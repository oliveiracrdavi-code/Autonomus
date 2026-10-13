const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../js/lib/week');

const subjects = [{ id: 'penal', name: 'Penal' }, { id: 'civil', name: 'Civil' }];
const nameOf = (id) => { const s = subjects.find((x) => x.id === id); return s ? s.name : 'Disciplina removida'; };

test('calendário: dia da semana começa na segunda (0 = segunda, 6 = domingo)', () => {
  assert.equal(W.dayIndex('2026-10-12'), 0, '12/10/2026 é segunda');
  assert.equal(W.dayIndex('2026-10-18'), 6, '18/10/2026 é domingo');
  assert.equal(W.weekKey('2026-10-14'), '2026-10-12', 'a semana da quarta começa na segunda');
});

test('calendário: validação aceita bloco completo e normaliza o assunto', () => {
  const r = W.validateBlock({ weekday: '2', subjectId: 'penal', minutes: '60', topic: '  Tipicidade  ' }, subjects);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { weekday: 2, subjectId: 'penal', minutes: 60, topic: 'Tipicidade' });
});

test('calendário: validação recusa dia, disciplina e minutos inválidos', () => {
  const r = W.validateBlock({ weekday: 9, subjectId: 'inexistente', minutes: 5 }, subjects);
  assert.equal(r.ok, false);
  assert.ok(r.errors.weekday);
  assert.ok(r.errors.subjectId);
  assert.ok(r.errors.minutes);
  assert.equal(W.validateBlock({ weekday: 0, subjectId: 'civil', minutes: 481 }, subjects).ok, false);
  assert.equal(W.validateBlock({ weekday: 0, subjectId: 'civil', minutes: 60, topic: 'x'.repeat(121) }, subjects).errors.topic !== undefined, true);
});

test('calendário: marcado como feito vale só para a semana em que foi marcado', () => {
  const week = { blocks: [{ id: 'b1', weekday: 1, subjectId: 'penal', minutes: 60, topic: '' }], done: ['2026-10-12|b1'] };
  const semanaAtual = W.dayPlan(week, '2026-10-13', nameOf);
  assert.equal(semanaAtual.blocks[0].done, true);
  const semanaSeguinte = W.dayPlan(week, '2026-10-20', nameOf);
  assert.equal(semanaSeguinte.blocks[0].done, false, 'na semana seguinte o bloco volta a aparecer como pendente');
});

test('calendário: totais por dia somam planejado e feito', () => {
  const week = {
    blocks: [
      { id: 'a', weekday: 1, subjectId: 'penal', minutes: 60, topic: '' },
      { id: 'b', weekday: 1, subjectId: 'civil', minutes: 30, topic: '' },
    ],
    done: ['2026-10-12|a'],
  };
  const days = W.weekTotals(week, '2026-10-12', nameOf);
  assert.equal(days.length, 7);
  assert.equal(days[1].plannedMin, 90);
  assert.equal(days[1].doneMin, 60);
  assert.equal(days[0].plannedMin, 0);
});

test('o que estudar: prioriza o bloco de hoje ainda não feito', () => {
  const week = {
    blocks: [
      { id: 'a', weekday: 1, subjectId: 'penal', minutes: 60, topic: 'Tipicidade' },
      { id: 'b', weekday: 1, subjectId: 'civil', minutes: 30, topic: '' },
    ],
    done: ['2026-10-12|a'],
  };
  const s = W.suggestion(week, '2026-10-13', nameOf, []);
  assert.equal(s.kind, 'bloco');
  assert.equal(s.blockId, 'b');
  assert.match(s.title, /Civil/);
});

test('o que estudar: dia com blocos todos feitos não repete a tarefa', () => {
  const week = { blocks: [{ id: 'a', weekday: 1, subjectId: 'penal', minutes: 60, topic: '' }], done: ['2026-10-12|a'] };
  assert.equal(W.suggestion(week, '2026-10-13', nameOf, []).kind, 'concluido');
});

test('o que estudar: sem bloco hoje, sugere a disciplina mais prioritária pelo desempenho', () => {
  const week = { blocks: [], done: [] };
  const priorities = [{ subjectId: 'civil', name: 'Civil', reason: 'desempenho abaixo de 50%' }];
  const s = W.suggestion(week, '2026-10-13', nameOf, priorities);
  assert.equal(s.kind, 'sugestao');
  assert.equal(s.subjectId, 'civil');
  assert.match(s.text, /Desempenho abaixo de 50%/);
});

test('o que estudar: sem disciplinas nem blocos, pede o cadastro', () => {
  assert.equal(W.suggestion({ blocks: [], done: [] }, '2026-10-13', nameOf, []).kind, 'nada');
});

test('calendário: disciplina arquivada aparece marcada e fica fora da sugestão de hoje', () => {
  const isActive = (id) => id !== 'penal';
  const week = { blocks: [{ id: 'a', weekday: 1, subjectId: 'penal', minutes: 60, topic: '' }], done: [] };
  const plan = W.dayPlan(week, '2026-10-13', nameOf, isActive);
  assert.equal(plan.blocks[0].archived, true);
  // só há bloco de disciplina arquivada: não vira "Agora" nem "concluído"
  assert.equal(W.suggestion(week, '2026-10-13', nameOf, [], null, isActive).kind, 'nada');
});

test('calendário: dia vazio ou minutos vazios são recusados, não viram zero válido', () => {
  assert.equal(W.validateBlock({ weekday: '', subjectId: 'civil', minutes: 60 }, subjects).ok, false);
  assert.equal(W.validateBlock({ weekday: 0, subjectId: 'civil', minutes: '' }, subjects).ok, false);
});

test('o que estudar: sugestão de prioridade traz o assunto para começar', () => {
  const priorities = [{ subjectId: 'civil', name: 'Civil', reason: 'desempenho abaixo de 50%' }];
  const s = W.suggestion({ blocks: [], done: [] }, '2026-10-13', nameOf, priorities, () => 'Obrigações', null);
  assert.match(s.text, /Assunto para começar: Obrigações/);
});
