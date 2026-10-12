/* Rotação de chaves da NVIDIA: lê as chaves do ambiente e as ordena para tentativa em sequência.
 * As chaves nunca são devolvidas ao navegador nem escritas em log. */
'use strict';

/** Lê NVIDIA_API_KEYS (separadas por vírgula) ou NVIDIA_API_KEY. Ignora vazias e duplicadas. */
function parseKeys(env) {
  const raw = [env.NVIDIA_API_KEYS || '', env.NVIDIA_API_KEY || ''].join(',');
  const keys = raw.split(/[,\s]+/).map((k) => k.trim()).filter((k) => k.length > 0);
  return [...new Set(keys)];
}

/** Mascara uma chave para exibição segura (ex.: nvapi-…Ab12). */
function maskKey(key) {
  if (!key) return '';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/** Status que justificam tentar a próxima chave (limite, acesso negado, falha do servidor). */
const RETRY_STATUS = new Set([401, 403, 404, 408, 425, 429, 500, 502, 503, 504]);

/**
 * Remove chaves de qualquer texto antes que ele saia do servidor (resposta ou log):
 * as chaves configuradas e qualquer trecho no formato nvapi-…, mesmo que a NVIDIA o devolva em um erro.
 */
function redact(text, keys = []) {
  let out = String(text == null ? '' : text);
  for (const k of keys) if (k && k.length >= 8) out = out.split(k).join('[chave oculta]');
  return out.replace(/nvapi-[A-Za-z0-9_-]+/g, '[chave oculta]');
}

module.exports = { parseKeys, maskKey, RETRY_STATUS, redact };
