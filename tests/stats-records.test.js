const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/lib/util');
const seed = require('../js/lib/seed');
const stats = require('../js/lib/stats');
const records = require('../js/lib/records');
const review = require('../js/lib/review');

const makeId = (p) => U.uid(p);
const initial = () => seed.initialState((sim) => records.buildLogsFromSimulado(sim, makeId));

test('diagnóstico da OAB 47 reproduz exatamente 80 questões, 45 acertos e 35 erros', () => {
  const s = initial();
  const t = stats.totals(s.logs);
  assert.equal(t.total, 80);
  assert.equal(t.correct, 45);
  assert.equal(t.wrong, 35);
  assert.equal(t.blank, 0);
  assert.equal(t.pct, 56.25);
});

test('diagnóstico por matéria: nenhum total inventado e amostras pequenas marcadas', () => {
  const s = initial();
  const rows = stats.bySubject(s.logs, s.subjects);
  const constitucional = rows.find((r) => r.subjectId === 'sub-constitucional');
  assert.equal(constitucional.total, 7);
  assert.equal(constitucional.correct, 4);
  assert.equal(constitucional.smallSample, false); // 7 questões: acima do mínimo de 5
  const empresarial = rows.find((r) => r.subjectId === 'sub-empresarial');
  assert.equal(empresarial.pct, 0);
  assert.equal(empresarial.smallSample, true); // 4 questões: abaixo do mínimo
  const afo = rows.find((r) => r.subjectId === 'sub-afo');
  assert.equal(afo.total, 1);
  assert.equal(afo.smallSample, true);
  // Uma matéria com 1 questão não entra em melhor/pior desempenho.
  const ranks = stats.rankSubjects(rows, 3);
  assert.ok(ranks.best.every((r) => r.total >= stats.MIN_SAMPLE));
  assert.ok(ranks.worst.every((r) => r.total >= stats.MIN_SAMPLE));
});

test('pesos informados somam 103% (o relatório original também soma 103%)', () => {
  const total = seed.seedSubjects().reduce((s, x) => s + x.weight, 0);
  assert.equal(total, 103);
});

test('horas por disciplina e resumo de sessões usam o tempo calculado', () => {
  const sessions = [
    { subjectId: 'a', status: 'concluida', total: 2 },
    { subjectId: 'a', status: 'pausada', total: 1 },
    { subjectId: 'b', status: 'concluida', total: 3 },
  ];
  const elapsed = (s) => ({ teoria: s.total, questoes: 0, total: s.total });
  const hours = stats.hoursBySubject(sessions, elapsed);
  assert.deepEqual(hours, { a: 3, b: 3 });
  const sum = stats.sessionSummary(sessions, elapsed);
  assert.equal(sum.concluded, 2);
  assert.equal(sum.count, 3);
  assert.equal(sum.totalMs, 6);
});

test('comparação quinzenal: cada simulado é comparado com o último feito há 14+ dias', () => {
  const sims = [
    { id: 'a', name: 'A', date: '2026-01-01', total: 80, correct: 45, blank: 0, createdAt: 1 },
    { id: 'b', name: 'B', date: '2026-01-10', total: 80, correct: 50, blank: 0, createdAt: 2 },
    { id: 'c', name: 'C', date: '2026-01-15', total: 80, correct: 55, blank: 0, createdAt: 3 },
    { id: 'd', name: 'D', date: '2026-01-29', total: 80, correct: 55, blank: 0, createdAt: 4 },
  ];
  const series = stats.simuladoSeries(sims);
  assert.equal(series[0].compare, null);
  assert.equal(series[1].compare, null); // 9 dias depois: ainda não é "uma semana sim, uma não"
  assert.equal(series[2].compare.id, 'a'); // 14 dias depois de A
  assert.equal(series[2].compare.deltaCorrect, 10);
  assert.equal(series[2].compare.trend, 'evoluiu');
  assert.equal(series[3].compare.id, 'c'); // D (29/01) é comparado com C (15/01), 14 dias antes
  assert.equal(series[3].compare.deltaCorrect, 0);
  assert.equal(series[3].compare.trend, 'estável');
});

test('metas: meta atual é a menor ainda não superada pelo melhor simulado', () => {
  const sims = [{ id: 'a', name: 'A', date: '2026-01-01', total: 80, correct: 52, blank: 0, createdAt: 1 }];
  const g = stats.goalStatus(seed.seedGoals(), sims);
  assert.equal(g.best, 52);
  assert.equal(g.current.target, 55);
  assert.equal(g.goals[0].achieved, true);
  assert.equal(g.progress, (52 / 55) * 100);
});

test('validação de registro: bloco aceita dois dos três números e calcula o terceiro', () => {
  const base = { mode: 'bloco', subjectId: 'sub-x', date: '2026-10-10', total: '20', correct: '13', wrong: '', blank: '' };
  const r = records.validateLog(base);
  assert.equal(r.ok, true);
  assert.equal(r.value.wrong, 7);
  assert.equal(r.value.blank, 0);
});

test('validação de registro: soma diferente do total gera erro no campo', () => {
  const r = records.validateLog({ mode: 'bloco', subjectId: 'sub-x', date: '2026-10-10', total: '20', correct: '13', wrong: '5', blank: '1' });
  assert.equal(r.ok, false);
  assert.match(r.errors.correct, /somam 19/);
});

test('validação de registro: exige disciplina e data, mas não exige tudo', () => {
  const r = records.validateLog({ mode: 'bloco', total: '10', correct: '4' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.subjectId);
  assert.ok(r.errors.date);
  assert.equal(r.errors.minutes, undefined); // tempo é opcional
  assert.equal(r.errors.banca, undefined);
});

test('lista de questões erradas: aceita intervalos e avisa quando não bate com o número de erros', () => {
  const r = records.validateLog({
    mode: 'bloco', subjectId: 'sub-x', date: '2026-10-10', total: '20', correct: '13', wrong: '7',
    wrongNumbers: '2, 5-7, 19', doubtNumbers: '1',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.wrongList, [2, 5, 6, 7, 19]);
  assert.match(r.warnings[0], /5 questão/);
  const entries = records.errorsFromLog(r.value, { id: 'l', date: '2026-10-10', subjectId: 'sub-x', topicId: null, subtopic: '', origem: 'outra', createdAt: 1 }, makeId);
  assert.equal(entries.filter((e) => e.kind === 'erro').length, 5);
  assert.equal(entries.filter((e) => e.kind === 'duvida').length, 1);
  assert.equal(entries[0].ref, 'Q2');
});

test('lista com número fora do total é rejeitada', () => {
  const r = records.validateLog({ mode: 'bloco', subjectId: 'sub-x', date: '2026-10-10', total: '10', correct: '8', wrong: '2', wrongNumbers: '9, 11' });
  assert.equal(r.ok, false);
  assert.match(r.errors.wrongNumbers, /11/);
});

test('questão individual: erro gera item no caderno; acerto por chute também', () => {
  const erro = records.validateLog({ mode: 'individual', subjectId: 'sub-x', date: '2026-10-10', result: 'erro', ref: '14' });
  const le = { id: 'l1', date: '2026-10-10', subjectId: 'sub-x', topicId: null, subtopic: 'Atos', origem: 'gran', createdAt: 1 };
  const e1 = records.errorsFromLog(erro.value, { ...le, total: 1, wrong: 1, correct: 0, blank: 0 }, makeId);
  assert.equal(e1.length, 1);
  assert.equal(e1[0].kind, 'erro');
  const chute = records.validateLog({ mode: 'individual', subjectId: 'sub-x', date: '2026-10-10', result: 'acerto', chute: true });
  const e2 = records.errorsFromLog(chute.value, { ...le, total: 1, correct: 1, wrong: 0, blank: 0 }, makeId);
  assert.equal(e2[0].kind, 'duvida');
  const certo = records.validateLog({ mode: 'individual', subjectId: 'sub-x', date: '2026-10-10', result: 'acerto', chute: false });
  assert.equal(records.errorsFromLog(certo.value, { ...le, total: 1, correct: 1, wrong: 0, blank: 0 }, makeId).length, 0);
});

test('caderno: refazer errando marca como erro recorrente; acertando marca como revisado e mantém histórico', () => {
  const entry = { id: 'e', attempts: [], status: 'pendente', updatedAt: 1 };
  records.applyAttempt(entry, { date: '2026-10-11', result: 'erro', note: 'ainda confundi' });
  assert.equal(entry.status, 'recorrente');
  records.applyAttempt(entry, { date: '2026-10-12', result: 'acerto' });
  assert.equal(entry.status, 'revisado');
  assert.equal(entry.attempts.length, 2); // o erro anterior continua no histórico
});

test('caderno exige ao menos uma referência para o item', () => {
  const r = records.validateErrorEntry({ subjectId: 'sub-x', date: '2026-10-10' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.ref);
});

test('simulado: soma por disciplina precisa bater com o total', () => {
  const ok = records.validateSimulado({
    name: 'S', date: '2026-10-01', total: '4', correct: '2', blank: '0',
    breakdown: [{ subjectId: 'a', total: '2', correct: '1' }, { subjectId: 'b', total: '2', correct: '1' }],
  });
  assert.equal(ok.ok, true);
  const bad = records.validateSimulado({
    name: 'S', date: '2026-10-01', total: '4', correct: '2', blank: '0',
    breakdown: [{ subjectId: 'a', total: '2', correct: '1' }],
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.breakdown);
});

test('simulado sem divisão gera um registro geral (sem disciplina) que entra nos totais', () => {
  const logs = records.buildLogsFromSimulado({ id: 'x', name: 'S', date: '2026-10-01', total: 30, correct: 20, blank: 2, createdAt: 0 }, makeId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].subjectId, null);
  assert.equal(logs[0].wrong, 8);
  assert.equal(stats.totals(logs).total, 30);
});

test('revisão: usa apenas itens registrados no período e não presume dias de estudo', () => {
  const errors = [
    { id: 'a', date: '2026-10-05', status: 'pendente', subjectId: 's' }, // segunda
    { id: 'b', date: '2026-10-09', status: 'revisado', subjectId: 's' }, // sexta
    { id: 'c', date: '2026-09-30', status: 'pendente', subjectId: 's' }, // semana anterior
  ];
  const range = review.periodRange('semana', '2026-10-11'); // domingo
  assert.deepEqual(range, { from: '2026-10-05', to: '2026-10-11' });
  const items = review.collectItems(errors, range);
  assert.deepEqual(items.map((i) => i.id), ['a', 'b']);
  const withPending = review.collectItems(errors, { ...range, includePendingBefore: true });
  assert.deepEqual(withPending.map((i) => i.id), ['c', 'a', 'b']);
  const logs = [{ date: '2026-10-06' }, { date: '2026-10-06' }, { date: '2026-10-08' }];
  const sum = review.summarize(items, logs, range);
  assert.equal(sum.daysWithLogs, 2);
  assert.equal(sum.periodDays, 7);
});

test('datas: semana começa na segunda e intervalos são inclusivos', () => {
  assert.equal(U.weekStart('2026-10-11'), '2026-10-05');
  assert.equal(U.weekStart('2026-10-05'), '2026-10-05');
  assert.equal(U.diffDays('2026-10-01', '2026-10-15'), 14);
  assert.equal(U.isISODate('2026-02-30'), false);
});
