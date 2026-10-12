/* Carrega um arquivo .env simples (KEY=VALUE, sem dependências). Variáveis já definidas no ambiente têm prioridade. */
'use strict';
const fs = require('fs');

/** Interpreta o texto de um .env. Ignora linhas vazias, comentários e chaves inválidas. */
function parseEnv(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

/** Aplica o .env ao process.env, sem sobrescrever o que já foi exportado no terminal. */
function loadEnvFile(file, env = process.env) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; }
  const parsed = parseEnv(text);
  let applied = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (env[k] === undefined) { env[k] = v; applied += 1; }
  }
  return applied;
}

module.exports = { parseEnv, loadEnvFile };
