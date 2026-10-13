const test = require('node:test');
const assert = require('node:assert/strict');
const session = require('../js/lib/session');

const plan = { teoria: 60, questoes: 60 };
const MIN = 60000;
const newSession = (now) =>
  session.createSession({ id: 's1', block: { id: 'blk-01' }, subjectId: 'sub-x', topicId: null, now, plannedMin: plan });

test('cronômetro conta só a fase ativa e soma o total', () => {
  const s = newSession(0);
  const e = session.elapsed(s, 10 * MIN);
  assert.equal(e.teoria, 10 * MIN);
  assert.equal(e.questoes, 0);
  assert.equal(e.total, 10 * MIN);
});

test('pausar congela o tempo e retomar continua de onde parou', () => {
  const s = newSession(0);
  session.pause(s, 5 * MIN);
  assert.equal(s.status, 'pausada');
  assert.equal(session.elapsed(s, 50 * MIN).total, 5 * MIN); // não cresce com a sessão pausada
  session.resume(s, 60 * MIN);
  assert.equal(session.elapsed(s, 63 * MIN).total, 8 * MIN);
});

test('trocar de fase durante a sessão separa teoria e questões sem perder tempo', () => {
  const s = newSession(0);
  session.switchPhase(s, 'questoes', 60 * MIN);
  const e = session.elapsed(s, 90 * MIN);
  assert.equal(e.teoria, 60 * MIN);
  assert.equal(e.questoes, 30 * MIN);
  assert.equal(e.total, 90 * MIN);
});

test('trocar de fase com a sessão pausada não inicia a contagem', () => {
  const s = newSession(0);
  session.pause(s, 10 * MIN);
  session.switchPhase(s, 'questoes', 20 * MIN);
  assert.equal(session.elapsed(s, 30 * MIN).questoes, 0);
  session.resume(s, 30 * MIN);
  assert.equal(session.elapsed(s, 35 * MIN).questoes, 5 * MIN);
});

test('recuperação após fechar o app conta só até a última atividade, sem duplicar horas', () => {
  const s = newSession(0);
  session.heartbeat(s, 20 * MIN); // última atividade registrada aos 20 min
  // O app foi fechado e reaberto 3 horas depois.
  session.recoverAfterReload(s);
  assert.equal(s.status, 'pausada');
  assert.equal(s.recovered, true);
  assert.equal(session.elapsed(s, 180 * MIN).total, 20 * MIN);
});

test('recuperação não mexe em sessões que já estavam pausadas', () => {
  const s = newSession(0);
  session.pause(s, 7 * MIN);
  session.recoverAfterReload(s);
  assert.equal(s.recovered, false);
  assert.equal(session.elapsed(s, 99 * MIN).total, 7 * MIN);
});

test('checklist: sugestões automáticas e pendências', () => {
  const s = newSession(0);
  session.switchPhase(s, 'questoes', 30 * MIN);
  session.pause(s, 40 * MIN);
  const sug = session.suggestChecklist(s, { logCount: 2, errorCount: 0 });
  assert.equal(sug.teoria, true);
  assert.equal(sug.questoes, true);
  assert.equal(sug.registros, true);
  assert.equal(sug.caderno, false);
  assert.equal(sug.material, false);
  const pend = session.pendingChecklist({ ...sug, caderno: false, material: false });
  assert.deepEqual(pend, ['Atualizei o caderno de erros', 'Registrei o material utilizado']);
});

test('concluir sessão grava pendências sem bloquear e encerra a contagem', () => {
  const s = newSession(0);
  session.finish(s, {
    now: 45 * MIN,
    checklist: { teoria: true, questoes: false, registros: false, caderno: false, material: false },
    topicId: 'top-1',
    notes: 'ok',
  });
  assert.equal(s.status, 'concluida');
  assert.equal(s.endedAt, 45 * MIN);
  assert.equal(s.pendencias.length, 4);
  assert.equal(s.topicId, 'top-1');
  assert.equal(session.elapsed(s, 999 * MIN).total, 45 * MIN);
});

test('não é possível retomar sessão concluída', () => {
  const s = newSession(0);
  session.finish(s, { now: MIN, checklist: {} });
  assert.throws(() => session.resume(s, 2 * MIN));
});
