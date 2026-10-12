/* Cliente do chat da NVIDIA (API compatível com a OpenAI). Tenta cada chave em ordem quando há limite,
 * falha de acesso ou indisponibilidade. Só aceita modelos da lista permitida. */
'use strict';
const { RETRY_STATUS, redact } = require('./keys');

const BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Modelos de chat escolhidos e testados nesta conta. O primeiro é o padrão.
const CHAT_MODELS = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra (550B) · recomendado', recommended: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super (120B) · rápido' },
  { id: 'moonshotai/kimi-k3', label: 'Kimi K3' },
  { id: 'deepseek-ai/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash (pode estar indisponível)' },
  { id: 'z-ai/glm-5.3', label: 'GLM 5.3' },
];
const ALLOWED = new Set(CHAT_MODELS.map((m) => m.id));
const MAX_MESSAGES = 40;
const MAX_CHARS = 60000;

class ChatError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** Valida e limpa as mensagens recebidas do navegador. */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new ChatError('Envie ao menos uma mensagem.', 400);
  if (messages.length > MAX_MESSAGES) throw new ChatError('Conversa longa demais. Comece um novo chat.', 400);
  let total = 0;
  const clean = messages.map((m) => {
    const role = ['system', 'user', 'assistant'].includes(m && m.role) ? m.role : null;
    if (!role) throw new ChatError('Mensagem com papel inválido.', 400);
    const content = String((m && m.content) || '');
    total += content.length;
    return { role, content };
  });
  if (total > MAX_CHARS) throw new ChatError('Texto grande demais para uma resposta. Reduza o anexo.', 413);
  return clean;
}

/**
 * Chama o modelo. `fetchImpl` e `base` são injetáveis para teste.
 * Retorna { reply, model, usage, keyUsed }. Nunca inclui a chave na resposta.
 */
async function chat({ keys, model, messages, temperature = 0.3, maxTokens = 900, fetchImpl = fetch, base = BASE, budgetMs = 70000, perKeyMs = 35000 }) {
  const deadline = Date.now() + budgetMs; // tempo total da tentativa, somando todas as chaves
  if (!keys || keys.length === 0) throw new ChatError('Chave da NVIDIA não configurada no servidor.', 503);
  const useModel = ALLOWED.has(model) ? model : CHAT_MODELS[0].id;
  const body = JSON.stringify({ model: useModel, messages: sanitizeMessages(messages), temperature, max_tokens: maxTokens });
  const errors = [];
  for (const key of keys) {
    const left = deadline - Date.now();
    if (left <= 2000) { errors.push('tempo total esgotado'); break; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(perKeyMs, left));
    try {
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body,
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const msg = data && data.choices && data.choices[0] && data.choices[0].message;
        const reply = msg && typeof msg.content === 'string' ? msg.content.trim() : '';
        if (!reply) throw new ChatError('O modelo devolveu uma resposta vazia. Tente de novo.', 502);
        return { reply, model: useModel, usage: data.usage || null };
      }
      const status = res.status;
      errors.push(`HTTP ${status}`);
      if (!RETRY_STATUS.has(status)) {
        // erro de requisição (ex.: modelo descontinuado) não se resolve trocando de chave
        const txt = redact(await res.text().catch(() => ''), keys).slice(0, 160);
        throw new ChatError(`A NVIDIA recusou a requisição (HTTP ${status}). ${txt}`.trim(), status === 410 ? 410 : 502);
      }
    } catch (err) {
      if (err instanceof ChatError) throw err;
      errors.push(err.name === 'AbortError' ? 'tempo esgotado' : 'falha de rede');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ChatError(`Nenhum acesso respondeu (${[...new Set(errors)].join('; ')}). Tente outro modelo.`, 502);
}

module.exports = { chat, CHAT_MODELS, sanitizeMessages, ChatError };
