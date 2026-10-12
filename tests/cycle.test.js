const test = require('node:test');
const assert = require('node:assert/strict');
const cycle = require('../js/lib/cycle');
const seed = require('../js/lib/seed');

let n = 0;
const makeId = () => `new-${++n}`;
const ids = (c) => c.map((b) => b.id);

test('ciclo inicial tem 30 blocos na ordem informada', () => {
  const c = seed.seedCycle();
  assert.equal(c.length, 30);
  assert.equal(c[0].subjectId, 'sub-constitucional');
  assert.equal(c[1].subjectId, 'sub-etica');
  assert.equal(c[29].subjectId, 'sub-administrativo');
});

test('contagem inicial por matéria bate com a sequência do usuário', () => {
  const counts = cycle.countBySubject(seed.seedCycle());
  assert.equal(counts['sub-constitucional'], 4);
  assert.equal(counts['sub-etica'], 3);
  assert.equal(counts['sub-administrativo'], 4);
  assert.equal(counts['sub-empresarial'], 4);
  assert.equal(counts['sub-penal'], 2);
  assert.equal(counts['sub-afo'], undefined);
});

test('sucessor volta ao início depois do último bloco', () => {
  const c = seed.seedCycle();
  assert.equal(cycle.successorId(c, 'blk-01'), 'blk-02');
  assert.equal(cycle.successorId(c, 'blk-30'), 'blk-01');
  assert.equal(cycle.successorId(c, 'inexistente'), null);
});

test('remover o bloco do cursor move o cursor para o bloco seguinte', () => {
  const c = seed.seedCycle();
  const r = cycle.removeBlock(c, 'blk-02', 'blk-02');
  assert.equal(r.cycle.length, 29);
  assert.equal(r.cursorId, 'blk-03');
});

test('remover o último bloco que é cursor volta o cursor ao primeiro', () => {
  const c = seed.seedCycle();
  const r = cycle.removeBlock(c, 'blk-30', 'blk-30');
  assert.equal(r.cursorId, 'blk-01');
});

test('remover um bloco anterior ao cursor não altera o cursor', () => {
  const c = seed.seedCycle();
  const r = cycle.removeBlock(c, 'blk-05', 'blk-01');
  assert.equal(r.cursorId, 'blk-05');
  assert.equal(r.cycle.length, 29);
});

test('remover todos os blocos deixa o cursor vazio', () => {
  let c = [{ id: 'a', subjectId: 'x' }];
  const r = cycle.removeBlock(c, 'a', 'a');
  assert.deepEqual(r.cycle, []);
  assert.equal(r.cursorId, null);
});

test('mover um bloco preserva o ponteiro no mesmo bloco', () => {
  const c = seed.seedCycle();
  const moved = cycle.moveBlock(c, 'blk-10', 0);
  assert.equal(moved[0].id, 'blk-10');
  assert.equal(moved.length, 30);
  assert.equal(new Set(ids(moved)).size, 30);
  // O cursor continua apontando para o mesmo bloco (blk-05), mesmo após reordenar.
  assert.equal(cycle.cursorIndex(moved, 'blk-05'), moved.findIndex((b) => b.id === 'blk-05'));
});

test('duplicar cria um bloco logo após o original com a mesma matéria', () => {
  const c = seed.seedCycle();
  const r = cycle.duplicateBlock(c, 'blk-03', makeId);
  assert.equal(r.cycle.length, 31);
  assert.equal(r.cycle[3].id, r.block.id);
  assert.equal(r.block.subjectId, c[2].subjectId);
});

test('adicionar bloco sem posição vai para o fim', () => {
  const c = seed.seedCycle();
  const r = cycle.addBlock(c, 'sub-afo', makeId);
  assert.equal(r.cycle[r.cycle.length - 1].subjectId, 'sub-afo');
});

test('aumentar a quantidade de uma matéria insere após a última ocorrência', () => {
  const c = seed.seedCycle();
  const r = cycle.setSubjectCount(c, 'blk-01', 'sub-penal', 4, makeId);
  assert.equal(cycle.countBySubject(r.cycle)['sub-penal'], 4);
  assert.equal(r.cycle.length, 32);
  // Última ocorrência original de penal era blk-23; os novos blocos vêm logo depois dela.
  const idx = r.cycle.findIndex((b) => b.id === 'blk-23');
  assert.equal(r.cycle[idx + 1].subjectId, 'sub-penal');
  assert.equal(r.cycle[idx + 2].subjectId, 'sub-penal');
});

test('diminuir a quantidade remove a partir do fim, sem apagar o bloco do cursor', () => {
  const c = seed.seedCycle();
  // Penal aparece em blk-06 e blk-23; o cursor está em blk-23.
  const r = cycle.setSubjectCount(c, 'blk-23', 'sub-penal', 1, makeId);
  assert.equal(cycle.countBySubject(r.cycle)['sub-penal'], 1);
  assert.equal(r.cursorId, 'blk-23');
  assert.equal(r.shortfall, 0);
  assert.ok(r.cycle.some((b) => b.id === 'blk-23'));
});

test('diminuir para zero remove todos menos o bloco do cursor e informa o que faltou', () => {
  const c = seed.seedCycle();
  const r = cycle.setSubjectCount(c, 'blk-23', 'sub-penal', 0, makeId);
  assert.equal(cycle.countBySubject(r.cycle)['sub-penal'], 1);
  assert.equal(r.shortfall, 1);
  assert.equal(r.cursorId, 'blk-23');
});

test('mudar a matéria de um bloco altera só aquele bloco', () => {
  const c = seed.seedCycle();
  const updated = cycle.setBlockSubject(c, 'blk-01', 'sub-afo');
  assert.equal(updated[0].subjectId, 'sub-afo');
  assert.equal(updated[1].subjectId, c[1].subjectId);
});

test('sanitizeCursor corrige cursor inválido para o primeiro bloco', () => {
  const c = seed.seedCycle();
  assert.equal(cycle.sanitizeCursor(c, 'nada'), 'blk-01');
  assert.equal(cycle.sanitizeCursor([], 'nada'), null);
});
