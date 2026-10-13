/* Servidor local do OAB Estudos: serve o site e expõe o tutor (chat) e a voz (TTS/ASR) da NVIDIA.
 * As chaves ficam em variáveis de ambiente (NVIDIA_API_KEYS). Nenhuma chave sai daqui. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Carrega o .env antes dos demais módulos: eles leem o ambiente (URLs, IDs de função) ao carregar.
require('./env').loadEnvFile(path.join(ROOT, '.env'));
const { parseKeys, redact } = require('./keys');
const nvidia = require('./nvidia');
const voice = require('./voice');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const KEYS = parseKeys(process.env);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
const STATIC_DIRS = ['css', 'js', 'docs'];
const LIMITS = { json: 1024 * 1024, tts: 64 * 1024, asr: 12 * 1024 * 1024 };

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };
// Com HOST de loopback, só aceita o próprio endereço local no cabeçalho Host (bloqueia DNS rebinding de outros sites).
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const IS_LOOPBACK = LOOPBACK.has(HOST);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
// Corpos de API só com tipos que exigem pré-verificação CORS: um formulário de outro site não consegue enviá-los.
const API_BODY_TYPES = new Set(['application/json', 'application/octet-stream']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

/** Lê o corpo com limite de tamanho. Rejeita com status 413 se passar do limite. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Corpo grande demais.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Caminho estático seguro: só arquivos dentro de ROOT/css, ROOT/js e ROOT/docs, com extensão conhecida. */
function staticFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; } // % mal formado
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  // Confere o caminho já resolvido (".." e %2f contam): precisa estar dentro de uma pasta permitida.
  const full = path.resolve(ROOT, rel);
  const inAllowedDir = STATIC_DIRS.some((dir) => full.startsWith(path.join(ROOT, dir) + path.sep));
  if (!inAllowedDir && full !== path.join(ROOT, 'index.html')) return null;
  const ext = path.extname(full).toLowerCase();
  if (!TYPES[ext]) return null;
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch (e) { return null; }
  return full;
}

async function handleApi(req, res, url) {
  if (req.method === 'POST') {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!API_BODY_TYPES.has(type)) return sendJson(res, 415, { error: 'Envie o corpo como JSON (ou PCM para a transcrição).' });
  }
  if (req.method === 'GET' && url === '/api/status') {
    return sendJson(res, 200, {
      keysConfigured: KEYS.length,
      chat: { available: KEYS.length > 0, models: nvidia.CHAT_MODELS },
      voice: voice.status(KEYS),
    });
  }
  if (req.method === 'POST' && url === '/api/chat') {
    if (KEYS.length === 0) return sendJson(res, 503, { error: 'O tutor precisa de uma chave da NVIDIA configurada no servidor (NVIDIA_API_KEYS).' });
    const body = JSON.parse((await readBody(req, LIMITS.json)).toString('utf8') || '{}');
    const out = await nvidia.chat({ keys: KEYS, model: body.model, messages: body.messages, temperature: body.temperature, maxTokens: Math.min(Math.max(Number(body.maxTokens) || 900, 1), 2000) });
    return sendJson(res, 200, out);
  }
  if (req.method === 'POST' && url === '/api/tts') {
    if (KEYS.length === 0) return sendJson(res, 503, { error: 'Voz indisponível: chave da NVIDIA não configurada.' });
    const body = JSON.parse((await readBody(req, LIMITS.tts)).toString('utf8') || '{}');
    const text = String(body.text || '').slice(0, 4000);
    const out = await voice.synthesize({ keys: KEYS, text, voice: body.voice });
    return send(res, 200, out.wav, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Voice': out.voice });
  }
  if (req.method === 'POST' && url === '/api/asr') {
    if (KEYS.length === 0) return sendJson(res, 503, { error: 'Voz indisponível: chave da NVIDIA não configurada.' });
    const rate = Number(req.headers['x-sample-rate'] || 0);
    if (rate !== voice.ASR_RATE) return sendJson(res, 400, { error: `Envie áudio PCM 16 bits mono a ${voice.ASR_RATE} Hz.` });
    const pcm = await readBody(req, LIMITS.asr);
    const out = await voice.transcribe({ keys: KEYS, pcm, language: 'multi' });
    return sendJson(res, 200, { text: out.text });
  }
  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  try {
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '');
    if (IS_LOOPBACK && !LOCAL_HOSTS.has(hostName)) return sendJson(res, 403, { error: 'Acesso permitido apenas pelo endereço local do servidor.' });
    if (url.startsWith('/api/')) return await handleApi(req, res, url.split('?')[0]);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
    if (url === '/favicon.ico') return send(res, 204, '');
    const file = staticFile(url);
    if (!file) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    const body = fs.readFileSync(file);
    return send(res, 200, body, { 'Content-Type': TYPES[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' });
  } catch (err) {
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: 'Corpo da requisição não é um JSON válido.' });
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const msg = redact(err.message, KEYS).slice(0, 400);
    if (status >= 500) console.error(`[erro ${status}] ${msg.slice(0, 200)}`);
    return sendJson(res, status, { error: status >= 500 && !err.status ? 'Erro interno no servidor.' : msg });
  }
});

if (require.main === module) {
  if (!IS_LOOPBACK && process.env.OAB_ALLOW_REMOTE !== '1') {
    console.error(`HOST=${HOST} deixa o servidor acessível pela rede, sem autenticação, junto com as chaves da NVIDIA. Para aceitar isso, defina OAB_ALLOW_REMOTE=1.`);
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`OAB Estudos em http://${HOST}:${PORT}`);
    console.log(`Chaves da NVIDIA configuradas: ${KEYS.length} (valores não são exibidos)`);
    if (KEYS.length === 0) console.log('Defina NVIDIA_API_KEYS para ativar o tutor e a voz.');
  });
}

module.exports = { server, staticFile };
