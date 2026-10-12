const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pcm16ToWav, concatPcm, wavData } = require('../server/wav');
const { chunkText } = require('../server/text');
const http = require('http');
const { parseKeys, maskKey, redact } = require('../server/keys');
const nvidia = require('../server/nvidia');
const { server, staticFile } = require('../server/server');

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status) => ({ ok: false, status, json: async () => ({}), text: async () => `erro ${status}` });
const completion = (content) => ({ choices: [{ message: { content } }], usage: { total_tokens: 9 } });

test('WAV: cabeçalho RIFF/WAVE 16 bits mono com taxa e tamanho corretos', () => {
  const pcm = Buffer.alloc(3200, 1);
  const wav = pcm16ToWav(pcm, 22050);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 3200);
  assert.equal(wavData(wav).length, 3200);
});

test('WAV: concatenação insere pausa de silêncio entre trechos', () => {
  const a = Buffer.alloc(100, 7);
  const out = concatPcm([a, a], 16000, 10); // 10 ms a 16 kHz = 160 amostras = 320 bytes em PCM 16 bits
  assert.equal(out.length, 100 + 320 + 100);
  assert.equal(out.subarray(100, 420).every((b) => b === 0), true);
});

test('texto: trechos respeitam o limite e não perdem palavras', () => {
  const text = 'Primeira frase curta. ' + 'palavra '.repeat(120) + 'Fim.';
  const chunks = chunkText(text, 200);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((c) => c.length <= 200));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

test('texto: vazio gera nenhum trecho', () => {
  assert.deepEqual(chunkText('   '), []);
});

test('chaves: lê NVIDIA_API_KEYS e NVIDIA_API_KEY, sem vazias nem duplicadas', () => {
  const keys = parseKeys({ NVIDIA_API_KEYS: 'nvapi-a, nvapi-b,,nvapi-a', NVIDIA_API_KEY: 'nvapi-c' });
  assert.deepEqual(keys, ['nvapi-a', 'nvapi-b', 'nvapi-c']);
  assert.deepEqual(parseKeys({}), []);
});

test('chaves: máscara nunca mostra a chave inteira', () => {
  const key = 'nvapi-EXEMPLO-0123456789-abcdefghijklmnopqrstuvwxyz';
  const masked = maskKey(key);
  assert.ok(masked.length < 15);
  assert.ok(!masked.includes(key.slice(8, 30)));
});

test('chat: rotaciona chaves quando há limite e usa a primeira que responde', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    const key = opts.headers.Authorization.replace('Bearer ', '');
    seen.push(key);
    return key === 'k2' ? ok(completion('resposta da chave 2')) : fail(429);
  };
  const out = await nvidia.chat({ keys: ['k1', 'k2', 'k3'], messages: [{ role: 'user', content: 'oi' }], fetchImpl });
  assert.deepEqual(seen, ['k1', 'k2']);
  assert.equal(out.reply, 'resposta da chave 2');
  assert.equal(out.keyUsed, undefined, 'a chave nunca volta na resposta');
});

test('chat: erro de requisição (modelo descontinuado) não gasta as outras chaves', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fail(410); };
  await assert.rejects(() => nvidia.chat({ keys: ['k1', 'k2', 'k3'], messages: [{ role: 'user', content: 'x' }], fetchImpl }), (e) => e.status === 410);
  assert.equal(calls, 1);
});

test('chat: resposta vazia é tratada como erro', async () => {
  const fetchImpl = async () => ok(completion('   '));
  await assert.rejects(() => nvidia.chat({ keys: ['k1'], messages: [{ role: 'user', content: 'x' }], fetchImpl }), /vazia/);
});

test('chat: modelo fora da lista permitida cai no padrão', async () => {
  let sent = null;
  const fetchImpl = async (url, opts) => { sent = JSON.parse(opts.body).model; return ok(completion('ok')); };
  const out = await nvidia.chat({ keys: ['k1'], model: 'modelo/qualquer', messages: [{ role: 'user', content: 'x' }], fetchImpl });
  assert.equal(sent, nvidia.CHAT_MODELS[0].id);
  assert.equal(out.model, nvidia.CHAT_MODELS[0].id);
});

test('chat: sem chaves configuradas responde 503', async () => {
  await assert.rejects(() => nvidia.chat({ keys: [], messages: [{ role: 'user', content: 'x' }] }), (e) => e.status === 503);
});

test('chat: valida papéis e tamanho das mensagens', () => {
  assert.throws(() => nvidia.sanitizeMessages([{ role: 'root', content: 'x' }]), /papel/);
  assert.throws(() => nvidia.sanitizeMessages([]), /mensagem/);
  assert.throws(() => nvidia.sanitizeMessages([{ role: 'user', content: 'x'.repeat(70000) }]), /grande/);
});

test('estático: serve só css, js e docs, sem sair da pasta do projeto', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(staticFile('/'), path.join(root, 'index.html'));
  assert.ok(staticFile('/js/app.js'));
  assert.equal(staticFile('/../package.json'), null);
  assert.equal(staticFile('/js/../../package.json'), null);
  assert.equal(staticFile('/.env'), null);
  assert.equal(staticFile('/server/server.js'), null);
  assert.equal(staticFile('/js/nao-existe.js'), null);
});

test('voz: normaliza texto para o modelo sem perder o conteúdo falado', () => {
  const v = require('../server/voice');
  const out = v.normalizeForVoice('Ação – teste “aspas” → seta; ok §1º 50%');
  assert.equal(out, 'Ação , teste "aspas" seta; ok §1º 50%');
  assert.ok(!/[→*#_]/.test(out));
});

test('voz: divisão de trecho acontece perto do meio e em espaço', () => {
  const v = require('../server/voice');
  const parts = v.splitInTwo('uma frase com varias palavras para dividir ao meio aqui');
  assert.equal(parts.length, 2);
  assert.equal(parts.join(' '), 'uma frase com varias palavras para dividir ao meio aqui');
  assert.equal(v.splitInTwo('palavra'), null);
});

test('env: lê KEY=VALUE, ignora comentários e aspas, e não sobrescreve o ambiente', () => {
  const { parseEnv, loadEnvFile } = require('../server/env');
  const parsed = parseEnv('# comentario\n\nNVIDIA_API_KEYS="nvapi-EXEMPLO-1,nvapi-EXEMPLO-2"\nPORT=9000\nlinha invalida\n');
  assert.equal(parsed.NVIDIA_API_KEYS, 'nvapi-EXEMPLO-1,nvapi-EXEMPLO-2');
  assert.equal(parsed.PORT, '9000');
  assert.equal(parsed['linha invalida'], undefined);
  const env = { PORT: '7000' };
  const fs = require('fs');
  const tmp = require('path').join(require('os').tmpdir(), `oab-env-${process.pid}.env`);
  fs.writeFileSync(tmp, 'PORT=9000\nHOST=0.0.0.0\n');
  const applied = loadEnvFile(tmp, env);
  fs.unlinkSync(tmp);
  assert.equal(env.PORT, '7000', 'variável exportada no terminal tem prioridade');
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(applied, 1);
});

test('segurança: texto que sai do servidor nunca traz a chave', () => {
  const secret = 'chave-SECRETA-de-teste-9876';
  const out = redact(`erro com ${secret} e também nvapi-ABCdef123456_xyz`, [secret]);
  assert.ok(!out.includes(secret));
  assert.ok(!out.includes('nvapi-ABCdef'));
  assert.match(out, /\[chave oculta\]/);
});

test('segurança: erro de requisição da NVIDIA é devolvido sem a chave ecoada', async () => {
  const secret = 'chave-ECOADA-de-teste-5544';
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => `invalid auth ${secret}` });
  await assert.rejects(
    () => nvidia.chat({ keys: [secret], messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    (e) => e.status === 502 && !e.message.includes(secret) && /HTTP 400/.test(e.message)
  );
});

test('segurança: caminho estático com % mal formado responde nulo, sem erro', () => {
  assert.equal(staticFile('/%E0%A4%A'), null);
});

/** Requisição HTTP crua, para controlar o cabeçalho Host (um navegador não deixa definir). */
function rawRequest(port, { method = 'GET', path: p = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('segurança: só aceita o endereço local no cabeçalho Host', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const evil = await rawRequest(port, { path: '/api/status', headers: { host: 'evil.example' } });
    assert.equal(evil.status, 403);
    const local = await rawRequest(port, { path: '/api/status', headers: { host: `127.0.0.1:${port}` } });
    assert.equal(local.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('segurança: POST de API só com JSON ou PCM, nunca com formulário ou texto simples', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const host = `127.0.0.1:${port}`;
    const form = await rawRequest(port, { method: 'POST', path: '/api/chat', headers: { host, 'content-type': 'text/plain' }, body: '{"messages":[]}' });
    assert.equal(form.status, 415);
    const simple = await rawRequest(port, { method: 'POST', path: '/api/tts', headers: { host, 'content-type': 'application/x-www-form-urlencoded' }, body: 'text=oi' });
    assert.equal(simple.status, 415);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
