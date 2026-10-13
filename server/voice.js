/* Voz pela NVIDIA: síntese (Magpie TTS multilíngue) e reconhecimento (Parakeet TDT multilíngue).
 * Os modelos hospedados falam gRPC em grpc.nvcf.nvidia.com:443 com um cabeçalho function-id por modelo. */
'use strict';
const path = require('path');
const { chunkText } = require('./text');
const { concatPcm, pcm16ToWav } = require('./wav');

const HOST = process.env.NVIDIA_SPEECH_HOST || 'grpc.nvcf.nvidia.com:443';
const TTS_FUNCTION = process.env.NVIDIA_TTS_FUNCTION_ID || '877104f7-e885-42b9-8de8-f6e4c6303969';
const ASR_FUNCTION = process.env.NVIDIA_ASR_FUNCTION_ID || '2b940e91-a70e-4483-a958-d50408b96589';
const TTS_RATE = 22050;
const ASR_RATE = 16000;

// Vozes em português do Brasil do Magpie (nome completo exigido pelo serviço).
const VOICES = [
  { id: 'Magpie-Multilingual.PT-BR.Isabela', label: 'Isabela · feminina' },
  { id: 'Magpie-Multilingual.PT-BR.Louise', label: 'Louise · feminina' },
  { id: 'Magpie-Multilingual.PT-BR.Diego', label: 'Diego · masculina' },
];
const VOICE_IDS = new Set(VOICES.map((v) => v.id));
// Códigos gRPC que justificam trocar de chave: prazo, não encontrado, sem permissão, cota esgotada, indisponível e não autenticado.
const KEY_RETRY_CODES = new Set([4, 5, 7, 8, 14, 16]);

let grpc = null;
let loader = null;
let stubs = null;
let loadError = null;

/** Carrega o cliente gRPC sob demanda. Se as dependências não estiverem instaladas, o voz fica desativada. */
function load() {
  if (stubs || loadError) return stubs;
  try {
    grpc = require('@grpc/grpc-js');
    loader = require('@grpc/proto-loader');
    const opts = { includeDirs: [path.join(__dirname, 'proto')], keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true };
    const tts = grpc.loadPackageDefinition(loader.loadSync('riva/proto/riva_tts.proto', opts));
    const asr = grpc.loadPackageDefinition(loader.loadSync('riva/proto/riva_asr.proto', opts));
    stubs = {
      Tts: tts.nvidia.riva.tts.RivaSpeechSynthesis,
      Asr: asr.nvidia.riva.asr.RivaSpeechRecognition,
    };
  } catch (err) {
    loadError = err.message;
  }
  return stubs;
}

function metadata(key, fid) {
  const md = new grpc.Metadata();
  md.set('authorization', `Bearer ${key}`);
  md.set('function-id', fid);
  return md;
}

/** Chamada gRPC unária com tempo limite. */
function unary(client, method, request, md, timeoutMs) {
  return new Promise((resolve, reject) => {
    client[method](request, md, { deadline: Date.now() + timeoutMs }, (err, res) => {
      client.close();
      if (err) reject(Object.assign(new Error(String(err.details || err.message)), { code: err.code }));
      else resolve(res);
    });
  });
}

/** Status do recurso de voz para a interface. */
function status(keys) {
  const ready = !!load() && keys.length > 0;
  return { available: ready, reason: ready ? null : (loadError ? 'Dependências de voz não instaladas (rode npm install).' : 'Chave da NVIDIA não configurada.'), voices: VOICES, languageIn: 'multi' };
}

function synthesizeChunk(client, text, voice, md, timeoutMs) {
  return new Promise((resolve, reject) => {
    client.Synthesize({ text, language_code: 'pt-BR', encoding: 'LINEAR_PCM', sample_rate_hz: TTS_RATE, voice_name: voice }, md, { deadline: Date.now() + timeoutMs }, (err, res) => {
      if (err) reject(Object.assign(new Error(String(err.details || err.message)), { code: err.code }));
      else resolve(res);
    });
  });
}


/** Versão conservadora do texto para o modelo: só letras, números e pontuação básica. */
function normalizeForVoice(text) {
  return text
    .replace(/[–—]/g, ', ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s.,;:!?'"()\-%/ºª§]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide um trecho em duas metades pelo separador mais próximo do meio. */
function splitInTwo(text) {
  const mid = Math.floor(text.length / 2);
  let cut = text.lastIndexOf(' ', mid);
  if (cut < text.length * 0.25) cut = text.indexOf(' ', mid);
  if (cut <= 0) return null;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
}

/**
 * Sintetiza um trecho com recuperação: texto normalizado, depois duas metades.
 * Devolve { pcm: [Buffer, ...] } ou { skipped: 'motivo' } quando nada funciona.
 */
async function synthesizeRobust(client, text, voice, md, timeoutMs) {
  const attempt = async (t) => {
    const res = await synthesizeChunk(client, t, voice, md, timeoutMs);
    return Buffer.from(res.audio);
  };
  // erro ligado à chave (cota, permissão, indisponível) sobe para a rotação de chaves; os demais são do trecho
  const chunkError = (e) => !KEY_RETRY_CODES.has(e.code);
  try {
    return { pcm: [await attempt(text)] };
  } catch (err) {
    if (!chunkError(err)) throw err;
    // falhas do modelo costumam ser pontuais: tenta o mesmo trecho mais uma vez
    await new Promise((r) => setTimeout(r, 400));
    try { return { pcm: [await attempt(text)] }; } catch (e0) { if (!chunkError(e0)) throw e0; }
    const clean = normalizeForVoice(text);
    if (clean && clean !== text) {
      try { return { pcm: [await attempt(clean)] }; } catch (e2) { if (!chunkError(e2)) throw e2; }
    }
    const parts = splitInTwo(clean || text);
    if (!parts) return { skipped: err.message.slice(0, 80) };
    const out = [];
    for (const part of parts) {
      try { out.push(await attempt(part)); } catch (e3) { if (!chunkError(e3)) throw e3; }
    }
    return out.length ? { pcm: out } : { skipped: err.message.slice(0, 80) };
  }
}

/** Sintetiza um texto e devolve um WAV. Divide em trechos para não truncar o áudio. */
async function synthesize({ keys, text, voice, timeoutMs = 60000 }) {
  const s = load();
  if (!s || keys.length === 0) throw Object.assign(new Error('Voz indisponível no servidor.'), { status: 503 });
  const useVoice = VOICE_IDS.has(voice) ? voice : VOICES[0].id;
  const chunks = chunkText(text, 350);
  if (chunks.length === 0) throw Object.assign(new Error('Texto vazio.'), { status: 400 });
  const pcm = [];
  let lastErr = null;
  for (const key of keys) {
    const client = new s.Tts(HOST, grpc.credentials.createSsl());
    try {
      pcm.length = 0;
      const md = metadata(key, TTS_FUNCTION);
      const skipped = [];
      for (const piece of chunks) {
        const r = await synthesizeRobust(client, piece, useVoice, md, timeoutMs);
        if (r.pcm) pcm.push(...r.pcm);
        else skipped.push(r.skipped);
      }
      client.close();
      if (pcm.length === 0) throw Object.assign(new Error(`O modelo de voz não conseguiu sintetizar o texto (${skipped[0] || 'erro'}).`), { status: 502 });
      if (skipped.length) console.warn(`[voz] ${skipped.length} trecho(s) pulado(s) pelo modelo`);
      return { wav: pcm16ToWav(concatPcm(pcm, TTS_RATE), TTS_RATE), voice: useVoice, chunks: chunks.length, skipped: skipped.length };
    } catch (err) {
      client.close();
      lastErr = err;
      if (KEY_RETRY_CODES.has(err.code)) continue; // próxima chave
      throw Object.assign(new Error(`Falha na síntese de voz (${err.message.slice(0, 120)})`), { status: 502 });
    }
  }
  throw Object.assign(new Error(`Nenhuma chave conseguiu sintetizar a voz (${lastErr ? lastErr.message.slice(0, 120) : ''})`), { status: 502 });
}

/** Transcreve PCM 16 bits mono a 16 kHz. Devolve o texto. */
async function transcribe({ keys, pcm, language = 'multi', timeoutMs = 120000 }) {
  const s = load();
  if (!s || keys.length === 0) throw Object.assign(new Error('Voz indisponível no servidor.'), { status: 503 });
  let lastErr = null;
  for (const key of keys) {
    try {
      const client = new s.Asr(HOST, grpc.credentials.createSsl());
      const res = await unary(client, 'Recognize', {
        config: { encoding: 'LINEAR_PCM', sample_rate_hertz: ASR_RATE, language_code: language, max_alternatives: 1, enable_automatic_punctuation: true, audio_channel_count: 1 },
        audio: pcm,
      }, metadata(key, ASR_FUNCTION), timeoutMs);
      const text = (res.results || []).map((r) => (r.alternatives && r.alternatives[0] ? r.alternatives[0].transcript : '')).join(' ').trim();
      return { text };
    } catch (err) {
      lastErr = err;
      if (KEY_RETRY_CODES.has(err.code)) continue;
      throw Object.assign(new Error(`Falha na transcrição (${err.message.slice(0, 120)})`), { status: 502 });
    }
  }
  throw Object.assign(new Error(`Nenhuma chave conseguiu transcrever (${lastErr ? lastErr.message.slice(0, 120) : ''})`), { status: 502 });
}

module.exports = { status, synthesize, transcribe, synthesizeRobust, normalizeForVoice, splitInTwo, VOICES, VOICE_IDS, TTS_RATE, ASR_RATE };
