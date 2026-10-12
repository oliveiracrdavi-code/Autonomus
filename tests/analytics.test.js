const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/lib/util');
const seed = require('../js/lib/seed');
const an = require('../js/lib/analytics');
const records = require('../js/lib/records');

const makeId = (p) => U.uid(p);
const initial = () => seed.initialState((sim) => records.buildLogsFromSimulado(sim, makeId));

test('sequência conta dias seguidos até hoje e não cobra dias perdidos', () => {
  const today = '2026-10-12';
  const days = new Set(['2026-10-10', '2026-10-11', '2026-10-12']);
  assert.deepEqual(an.streak(days, today), { current: 3, longest: 3 });
  // Hoje ainda sem atividade: a contagem continua a partir de ontem.
  const noToday = new Set(['2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(an.streak(noToday, today).current, 3);
  // Dia perdido zera a contagem atual, mas o recorde permanece.
  const gap = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12']);
  assert.deepEqual(an.streak(gap, today), { current: 1, longest: 7 });
  assert.equal(an.streak(new Set(), today).current, 0);
});

test('XP e nível: nível L começa em 25·(L−1)² XP', () => {
  const s = initial();
  s.logs = [];
  s.sessions = [];
  s.errors = [];
  const base = an.xpInfo(s, 0);
  assert.equal(base.xp, 0);
  assert.equal(base.level, 1);
  s.logs = [{ total: 25, correct: 0, wrong: 25, blank: 0, subjectId: null, date: '2026-10-01' }];
  const info = an.xpInfo(s, 0);
  assert.equal(info.xp, 25);
  assert.equal(info.level, 2);
  s.logs = [{ total: 75, correct: 0, wrong: 75, blank: 0, subjectId: null, date: '2026-10-01' }];
  assert.equal(an.xpInfo(s, 0).level, 2); // 75 XP ainda está abaixo de 100, o limite do nível 3
});

test('XP: nível 3 começa exatamente em 100 XP', () => {
  const s = initial();
  s.logs = [{ total: 100, correct: 0, wrong: 100, blank: 0, subjectId: null, date: '2026-10-01' }];
  s.sessions = [];
  s.errors = [];
  const info = an.xpInfo(s, 0);
  assert.equal(info.xp, 100);
  assert.equal(info.level, 3);
});

test('mapa de calor: 16 semanas em colunas de segunda a domingo, com dias futuros marcados', () => {
  const today = '2026-10-12'; // segunda ou outro dia; a grade vai até o domingo da semana atual
  const cells = an.heatmapGrid(new Map(), today, 16);
  assert.equal(cells.length, 16 * 7);
  assert.equal(cells[0].date, U.addDays(U.weekStart(today), -15 * 7));
  const todayCell = cells.find((c) => c.date === today);
  assert.equal(todayCell.future, false);
  assert.ok(cells.some((c) => c.future)); // dias depois de hoje
});

test('mapa de calor: níveis crescem com minutos, questões e revisões', () => {
  const today = '2026-10-12';
  const act = new Map([[today, { date: today, minutes: 120, questions: 40, reviews: 6 }]]);
  const cell = an.heatmapGrid(act, today, 2).find((c) => c.date === today);
  assert.equal(cell.level, 4);
  const low = new Map([[today, { date: today, minutes: 5, questions: 0, reviews: 0 }]]);
  assert.equal(an.heatmapGrid(low, today, 2).find((c) => c.date === today).level, 1);
});

test('previsão linear com 3 ou mais simulados', () => {
  const sims = [
    { id: 'a', name: 'A', date: '2026-01-01', total: 80, correct: 40, blank: 0, createdAt: 1 },
    { id: 'b', name: 'B', date: '2026-01-20', total: 80, correct: 45, blank: 0, createdAt: 2 },
    { id: 'c', name: 'C', date: '2026-02-10', total: 80, correct: 50, blank: 0, createdAt: 3 },
  ];
  const f = an.forecast(sims);
  assert.equal(f.slope, 5);
  assert.equal(f.next, 55);
  assert.equal(an.forecast(sims.slice(0, 2)), null);
});

test('contagem para a prova: diferença em dias e nula sem data', () => {
  assert.equal(an.countdown('2026-12-01', '2026-10-12'), 50);
  assert.equal(an.countdown(null, '2026-10-12'), null);
});

test('prioridades: mais peso e pior desempenho sobem para o topo; sem dados vale meio caminho', () => {
  const s = initial();
  const list = an.priorities(s);
  assert.equal(list.length, 6);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  // Penal (peso 8, 5/6 = 83%) não deve liderar; Constitucional (peso 9, 4/7 ≈ 57%) é forte candidata.
  assert.ok(list.some((p) => p.name === 'Direito Constitucional'));
});

test('conquistas refletem dados reais (sem estudo, quase tudo bloqueado)', () => {
  const s = initial();
  s.sessions = [];
  s.errors = [];
  s.logs = [];
  const list = an.achievements(s, 0, { current: 0, longest: 0 });
  assert.equal(list.find((a) => a.id === 'primeira-sessao').unlocked, false);
  assert.equal(list.find((a) => a.id === 'cem-questoes').unlocked, false);
  const withLogs = initial();
  const ach = an.achievements(withLogs, 0, { current: 0, longest: 0 });
  assert.equal(ach.find((a) => a.id === 'cem-questoes').unlocked, false); // 80 questões no diagnóstico
  assert.equal(ach.find((a) => a.id === 'primeira-meta').unlocked, false); // melhor 45 < 50
});

test('ritmo semanal: sete dias terminando hoje, com minutos por dia', () => {
  const today = '2026-10-12';
  const act = new Map([[today, { date: today, minutes: 90, questions: 10, reviews: 0 }]]);
  const days = an.weekRhythm(act, today);
  assert.equal(days.length, 7);
  assert.equal(days[6].date, today);
  assert.equal(days[6].minutes, 90);
  assert.equal(days[6].isToday, true);
});
