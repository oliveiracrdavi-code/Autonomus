const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/lib/util');
const planner = require('../js/lib/planner');
const fc = require('../js/lib/flashcards');
const exporter = require('../js/lib/exporter');
const prova = require('../js/lib/prova');
const seed = require('../js/lib/seed');

const TODAY = '2026-10-12';

test('metas diárias: progresso de hoje e meta concluída quando tudo bate', () => {
  const act = new Map([[TODAY, { date: TODAY, minutes: 60, questions: 40, reviews: 3 }]]);
  const p = planner.dailyProgress(act, TODAY, { minutes: 120, questions: 40, reviews: 3 });
  assert.equal(p.rows[0].pct, 50); // 60 de 120 min
  assert.equal(p.rows[1].pct, 100); // 40 de 40 questões
  assert.equal(p.done, false);
  const full = planner.dailyProgress(act, TODAY, { minutes: 60, questions: 40, reviews: 3 });
  assert.equal(full.done, true);
  // Dia sem atividade: zero, e meta zerada conta como cumprida.
  const empty = planner.dailyProgress(new Map(), TODAY, { minutes: 0, questions: 0, reviews: 0 });
  assert.equal(empty.done, true);
});

test('previsão do ciclo: sem sessões concluídas, não estima', () => {
  const cycle = seed.seedCycle();
  const f = planner.cycleForecast([], cycle, 'blk-01', TODAY);
  assert.equal(f.ready, false);
  assert.equal(f.leftInLoop, 30);
});

test('previsão do ciclo: ritmo de 7 sessões em 28 dias (1,75/semana) projeta datas', () => {
  const cycle = seed.seedCycle();
  const sessions = Array.from({ length: 7 }, (_, i) => {
    const day = U.addDays(TODAY, -i * 4);
    const start = new Date(`${day}T12:00:00`).getTime(); // meio-dia local: a data não muda com o fuso
    return { status: 'concluida', startedAt: start };
  });
  const f = planner.cycleForecast(sessions, cycle, 'blk-21', TODAY); // faltam 10 blocos nesta volta
  assert.equal(f.ready, true);
  assert.equal(f.sessionsInWindow, 7);
  assert.equal(f.leftInLoop, 10);
  // 7/28 = 0,25 sessões por dia → 10 blocos levam 40 dias; 30 blocos levam 120 dias.
  assert.equal(f.daysLoop, 40);
  assert.equal(f.daysFull, 120);
  assert.equal(f.dateLoop, U.addDays(TODAY, 40));
});

test('flashcards: só vira cartão item com regra correta', () => {
  assert.equal(fc.isCandidate({ rule: '' }), false);
  assert.equal(fc.isCandidate({ rule: 'ab' }), false);
  assert.equal(fc.isCandidate({ rule: 'Prazo decadencial de 5 anos' }), true);
});

test('flashcards: acertar sobe de caixa e afasta a revisão; errar volta à caixa 1', () => {
  let card = fc.cardState('e1', [], TODAY);
  assert.equal(card.box, 1);
  assert.equal(card.due, TODAY); // novo cartão vence hoje
  card = fc.answer(card, true, TODAY);
  assert.equal(card.box, 2);
  assert.equal(card.due, U.addDays(TODAY, 2));
  card = fc.answer(card, true, U.addDays(TODAY, 2));
  assert.equal(card.box, 3);
  assert.equal(card.due, U.addDays(TODAY, 2 + 4));
  card = fc.answer(card, false, U.addDays(TODAY, 6));
  assert.equal(card.box, 1);
  assert.equal(card.lapses, 1);
  assert.equal(card.due, U.addDays(TODAY, 6 + 1));
});

test('flashcards: caixa 5 não passa do máximo e revisa em 15 dias', () => {
  let card = { errorId: 'x', box: 5, due: TODAY, reps: 9, lapses: 0 };
  card = fc.answer(card, true, TODAY);
  assert.equal(card.box, 5);
  assert.equal(card.due, U.addDays(TODAY, 15));
});

test('flashcards: fila do dia traz só o que venceu, da caixa mais baixa para a mais alta', () => {
  const entries = [
    { id: 'a', rule: 'Regra A value' },
    { id: 'b', rule: 'Regra B value' },
    { id: 'c', rule: 'Regra C value' },
    { id: 'd', rule: '' }, // não é cartão
  ];
  const cards = [
    { errorId: 'a', box: 4, due: TODAY, reps: 3, lapses: 0 },
    { errorId: 'b', box: 1, due: U.addDays(TODAY, 3), reps: 0, lapses: 1 }, // não vence hoje
    { errorId: 'c', box: 2, due: TODAY, reps: 1, lapses: 0 },
  ];
  const due = fc.dueToday(entries, cards, TODAY).map((x) => x.entry.id);
  assert.deepEqual(due, ['c', 'a']);
  const s = fc.summary(entries, cards, TODAY);
  assert.equal(s.total, 3);
  assert.equal(s.due, 2);
  assert.equal(s.withoutRule, 1);
});

test('CSV: separador ponto e vírgula, aspas escapadas e BOM para o Excel', () => {
  const csv = exporter.toCSV(['A', 'B'], [['x;y', 'diz "oi"'], ['linha\nquebra', 1]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('A;B'));
  assert.ok(csv.includes('"x;y";"diz ""oi"""'));
  assert.ok(csv.includes('"linha\nquebra";1'));
});

test('exportação de questões: aproveitamento em porcentagem com vírgula decimal', () => {
  const names = { subject: () => 'Direito Civil', topic: () => '' };
  const csv = exporter.logsCSV([{ date: TODAY, subjectId: 'sub-civil', topicId: null, subtopic: '', banca: '', prova: '', origem: 'gran', total: 20, correct: 13, wrong: 7, blank: 0, minutes: null, notes: '' }], names);
  assert.ok(csv.includes('65'), csv);
  assert.ok(csv.includes('Gran Curso'));
});

test('modo prova: gabarito cicla C → E → B → vazio e totais tratam não marcadas como em branco', () => {
  assert.equal(prova.nextMark(''), 'C');
  assert.equal(prova.nextMark('C'), 'E');
  assert.equal(prova.nextMark('E'), 'B');
  assert.equal(prova.nextMark('B'), '');
  const answers = { 1: 'C', 2: 'C', 3: 'E', 4: 'B' };
  const t = prova.totals(answers, 5);
  assert.equal(t.correct, 2);
  assert.equal(t.wrong, 1);
  assert.equal(t.blank, 1);
  assert.equal(t.unmarked, 1);
  assert.equal(t.blankFinal, 2);
});

test('modo prova: colar gabarito preenche e aponta caracteres inválidos', () => {
  const g = prova.parseGabarito('ce b x C\nE', 5); // 6 caracteres úteis: o 6º passa do total e é ignorado
  assert.deepEqual(g.answers, { 1: 'C', 2: 'E', 3: 'B', 5: 'C' });
  assert.deepEqual(g.invalid, ['x']);
  const extra = prova.parseGabarito('CCCCCC', 3);
  assert.equal(extra.extra, 3);
});

test('modo prova: tempo acumula com pausa e não conta com o app fechado', () => {
  const d = prova.createDraft({ id: 'p', name: 'x', total: 80, limitMin: 300, now: 0 });
  prova.pause(d, 10 * 60000);
  assert.equal(prova.elapsed(d, 50 * 60000), 10 * 60000);
  prova.resume(d, 60 * 60000);
  assert.equal(prova.elapsed(d, 65 * 60000), 15 * 60000);
  prova.pause(d, 70 * 60000);
  assert.equal(prova.elapsed(d, 999 * 60000), 20 * 60000); // 10 min antes da pausa + 10 min depois
});

test('bloqueio: detecta blocos seguidos da mesma matéria no ciclo circular', () => {
  const cycle = [{ subjectId: 'a' }, { subjectId: 'b' }, { subjectId: 'b' }, { subjectId: 'b' }, { subjectId: 'c' }];
  const an = require('../js/lib/analytics');
  const r = an.blockRuns(cycle, 0, 5);
  assert.equal(r.maxRun, 3);
  assert.equal(r.subjectId, 'b');
  // a partir do índice 4 (c), 0 (a), 1 (b): nenhum bloco seguido igual
  assert.equal(an.blockRuns(cycle, 4, 3).maxRun, 1);
  const intercalado = [{ subjectId: 'a' }, { subjectId: 'b' }, { subjectId: 'c' }];
  assert.equal(an.blockRuns(intercalado, 0, 3).maxRun, 1);
});

test('meta-piso: metade do ritmo recente, arredondada a 15 min; sem dados, nada', () => {
  const today = '2026-10-12';
  const act = new Map();
  [0, 1, 2, 3].forEach((i) => act.set(U.addDays(today, -i), { minutes: 120, questions: 0, reviews: 0 }));
  assert.equal(planner.suggestedFloor(act, today), 60);
  assert.equal(planner.suggestedFloor(new Map([[today, { minutes: 90 }]]), today), null);
  const pouco = new Map([0, 1, 2].map((i) => [U.addDays(today, -i), { minutes: 10 }]));
  assert.equal(planner.suggestedFloor(pouco, today), 15, 'piso mínimo de 15 min');
});

test('tutor: modo Feynman existe e pede avaliação de lacunas sem entregar a resposta', () => {
  const tutor = require('../js/lib/tutor');
  assert.ok(tutor.MODES.feynman);
  assert.match(tutor.MODES.feynman.system, /lacuna/);
});
