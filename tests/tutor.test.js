const test = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../js/lib/seed');
const records = require('../js/lib/records');
const U = require('../js/lib/util');
const tutor = require('../js/lib/tutor');

const makeId = (p) => U.uid(p);
const initial = () => seed.initialState((sim) => records.buildLogsFromSimulado(sim, makeId));

test('modos: existem os cinco modos e cada um tem instrução de sistema', () => {
  assert.deepEqual(Object.keys(tutor.MODES).sort(), ['banca', 'feynman', 'resumo', 'socratico', 'tutor']);
  Object.values(tutor.MODES).forEach((m) => assert.ok(m.system.length > 80));
});

test('contexto do estudante: resume números sem nome pessoal', () => {
  const s = initial();
  const ctx = tutor.studentContext(s, 0);
  assert.match(ctx, /Questões resolvidas: 80/);
  assert.match(ctx, /aproveitamento geral: 56,25%/);
  assert.ok(!/@|CPF|nome do estudante/i.test(ctx));
  assert.match(ctx, /Disciplinas que mais precisam de atenção/);
});

test('contexto do estudante: anotação livre do caderno nunca sai no contexto', () => {
  const s = initial();
  const secret = 'Minha anotação pessoal secreta';
  s.errors = [
    { id: 'e1', subjectId: s.subjects[0].id, subtopic: secret, kind: 'erro', status: 'recorrente' },
    { id: 'e2', subjectId: s.subjects[0].id, subtopic: secret, kind: 'erro', status: 'pendente' },
  ];
  const ctx = tutor.studentContext(s, 0);
  assert.ok(!ctx.includes(secret));
  assert.match(ctx, /Matérias com erros repetidos/);
});

test('mensagens: anexo cortado avisa o modelo', () => {
  const att = tutor.prepareAttachment('lei.txt', 'x'.repeat(50000));
  const msgs = tutor.buildMessages({ userText: 'resuma', attachments: [att] });
  assert.match(msgs[msgs.length - 1].content, /texto cortado/);
});

test('contexto do estudante: sem registros não envia nada', () => {
  const s = initial();
  s.logs = [];
  assert.equal(tutor.studentContext(s, 0), null);
});

test('mensagens: system vem primeiro, histórico recente e pergunta por último', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const msgs = tutor.buildMessages({ mode: 'socratico', history, userText: 'oi' });
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[msgs.length - 1].content, 'oi');
  assert.ok(msgs.length <= 1 + 24 + 1, 'histórico limitado aos últimos 12 turnos');
});

test('mensagens: contexto entra no system e anexo entra na pergunta', () => {
  const msgs = tutor.buildMessages({ mode: 'tutor', context: 'Direito Penal 40%', userText: 'explique', attachments: [{ name: 'lei.txt', text: 'Art. 1º' }] });
  assert.match(msgs[0].content, /Direito Penal 40%/);
  assert.match(msgs[msgs.length - 1].content, /Anexo: lei\.txt/);
  assert.match(msgs[msgs.length - 1].content, /explique$/);
});

test('mensagens: modo desconhecido cai no tutor', () => {
  const msgs = tutor.buildMessages({ mode: 'inventado', userText: 'x' });
  assert.equal(msgs[0].content, tutor.MODES.tutor.system);
});

test('anexos: texto muito grande é cortado e sinalizado', () => {
  const a = tutor.prepareAttachment('grande.txt', 'x'.repeat(50000), 40000);
  assert.equal(a.text.length, 40000);
  assert.equal(a.truncated, true);
  assert.equal(tutor.prepareAttachment('p.txt', 'curto').truncated, false);
});

test('explicar erro: monta pedido com regra, motivo e anotação', () => {
  const txt = tutor.explainErrorText({ rule: 'Legítima defesa exige moderação', reason: 'Excesso', note: 'art. 25', ref: 'Q12', subtopic: 'Legítima defesa' }, 'Direito Penal', null);
  assert.match(txt, /Direito Penal · Legítima defesa · Q12/);
  assert.match(txt, /Regra que eu anotei: Legítima defesa exige moderação/);
  assert.match(txt, /mnemônico/);
});

test('resumo em áudio: roteiro lista os itens sem nome do estudante', () => {
  const t = tutor.weeklyScriptText([{ subjectName: 'Direito Civil', topicName: 'Prescrição', rule: 'Prazo de 5 anos', status: 'pendente' }], '05/10 a 11/10');
  assert.match(t, /Direito Civil, Prescrição: Prazo de 5 anos \(pendente\)/);
  assert.equal(tutor.weeklyScriptText([], 'x').includes('nenhum item'), true);
});

test('voz: texto para fala remove markdown e corta em frase completa', () => {
  const longo = 'Primeira frase importante. ' + 'Segunda frase com detalhes. '.repeat(60);
  const out = tutor.speechText('**Atenção:** ' + longo, 200);
  assert.ok(out.length <= 200);
  assert.ok(!out.includes('*'));
  assert.match(out, /[.?!]$/);
});

test('markdown: negrito, títulos, listas e código viram HTML', () => {
  const html = tutor.renderMarkdown('### Resumo\n\n**Prescrição**: prazo de `5 anos`.\n\n- item *um*\n- item dois\n\n1. passo\n2. passo');
  assert.match(html, /<h4>Resumo<\/h4>/);
  assert.match(html, /<strong>Prescrição<\/strong>/);
  assert.match(html, /<code>5 anos<\/code>/);
  assert.match(html, /<ul><li>item <em>um<\/em><\/li><li>item dois<\/li><\/ul>/);
  assert.match(html, /<ol><li>passo<\/li><li>passo<\/li><\/ol>/);
});

test('markdown: tabela vira tabela HTML', () => {
  const html = tutor.renderMarkdown('| Instituto | Prazo |\n|---|---|\n| Prescrição | 5 anos |');
  assert.match(html, /<th>Instituto<\/th>/);
  assert.match(html, /<td>Prescrição<\/td><td>5 anos<\/td>/);
});

test('markdown: HTML da resposta do modelo nunca é executado', () => {
  const html = tutor.renderMarkdown('<img src=x onerror="alert(1)"> **oi** <script>alert(2)</script>');
  assert.ok(!/<img|<script|<\/?[a-z]+[^>]*onerror/i.test(html), 'nenhuma tag real do modelo: ' + html);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>oi<\/strong>/);
});
