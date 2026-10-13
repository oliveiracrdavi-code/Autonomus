/* Utilidades de áudio puras: montagem de WAV (PCM 16 bits, mono) e concatenação de trechos. */
'use strict';

/** Monta um cabeçalho RIFF/WAVE para PCM 16 bits mono e devolve o arquivo completo. */
function pcm16ToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Silêncio em PCM 16 bits, para separar trechos sem clique entre eles. */
function silence(sampleRate, ms) {
  return Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);
}

/** Concatena trechos PCM com uma pausa curta entre eles. */
function concatPcm(chunks, sampleRate, pauseMs = 140) {
  const parts = [];
  chunks.forEach((c, i) => {
    if (i > 0 && pauseMs > 0) parts.push(silence(sampleRate, pauseMs));
    parts.push(c);
  });
  return Buffer.concat(parts);
}

/** Lê um WAV PCM 16 bits e devolve só os dados (útil em testes). */
function wavData(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  return buf.subarray(44);
}

module.exports = { pcm16ToWav, concatPcm, silence, wavData };
