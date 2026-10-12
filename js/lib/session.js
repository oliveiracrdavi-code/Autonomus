/* Sessão de estudo: cronômetro por fases (teoria / questões) com pausa, retomada e recuperação.
 * O tempo é guardado como acumulado + marca de início da contagem (`runningSince`), assim o total
 * é exato mesmo após recarregar a página e nunca conta horas com o app fechado. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.session = lib;
})(function (U) {
  const PHASES = ['teoria', 'questoes'];

  function createSession({ id, block, subjectId, topicId, now, plannedMin }) {
    return {
      id,
      blockId: block.id,
      subjectId,
      topicId: topicId || null,
      status: 'ativa', // ativa | pausada | concluida
      phase: 'teoria',
      acc: { teoria: 0, questoes: 0 },
      runningSince: now,
      lastSeen: now,
      startedAt: now,
      endedAt: null,
      plannedMin: { teoria: plannedMin.teoria, questoes: plannedMin.questoes },
      materialIds: [],
      checklist: null,
      pendencias: [],
      notes: '',
      recovered: false,
    };
  }

  /** Tempo decorrido por fase e total, em ms, no instante `now`. */
  function elapsed(s, now) {
    const acc = { teoria: s.acc.teoria, questoes: s.acc.questoes };
    if (s.runningSince != null) acc[s.phase] += Math.max(0, now - s.runningSince);
    return { teoria: acc.teoria, questoes: acc.questoes, total: acc.teoria + acc.questoes };
  }

  function isRunning(s) {
    return s.status === 'ativa' && s.runningSince != null;
  }

  /** Pausa a contagem e acumula o tempo corrido. */
  function pause(s, now) {
    if (s.runningSince != null) {
      s.acc[s.phase] += Math.max(0, now - s.runningSince);
      s.runningSince = null;
    }
    if (s.status === 'ativa') s.status = 'pausada';
    s.lastSeen = now;
    return s;
  }

  function resume(s, now) {
    if (s.status === 'concluida') throw new Error('Sessão já concluída');
    s.status = 'ativa';
    s.runningSince = now;
    s.lastSeen = now;
    return s;
  }

  /** Troca de fase. Se a sessão estava rodando, a nova fase já começa a contar. */
  function switchPhase(s, phase, now) {
    if (!PHASES.includes(phase)) throw new Error(`Fase inválida: ${phase}`);
    if (s.runningSince != null) {
      s.acc[s.phase] += Math.max(0, now - s.runningSince);
      s.runningSince = now;
    }
    s.phase = phase;
    s.lastSeen = now;
    return s;
  }

  /** Registro periódico de atividade (usado ao sair da página e em intervalos). */
  function heartbeat(s, now) {
    if (s.runningSince != null) s.lastSeen = now;
    return s;
  }

  /**
   * Ao reabrir o app com uma sessão que estava rodando, o tempo é contado só até a última atividade
   * registrada. A sessão volta como pausada, para o usuário decidir quando retomar.
   */
  function recoverAfterReload(s) {
    if (s.status === 'ativa' && s.runningSince != null) {
      const end = Math.max(s.runningSince, s.lastSeen || s.runningSince);
      s.acc[s.phase] += end - s.runningSince;
      s.runningSince = null;
      s.status = 'pausada';
      s.recovered = true;
    }
    return s;
  }

  /** Sugestões automáticas para o checklist, com base no que já foi registrado. */
  function suggestChecklist(s, ctx) {
    const logCount = (ctx && ctx.logCount) || 0;
    const errorCount = (ctx && ctx.errorCount) || 0;
    return {
      teoria: s.acc.teoria > 0,
      questoes: s.acc.questoes > 0 || logCount > 0,
      registros: logCount > 0,
      caderno: errorCount > 0,
      material: s.materialIds.length > 0,
    };
  }

  /** Rótulos dos itens do checklist que ficaram desmarcados. */
  function pendingChecklist(checklist) {
    return U.CHECKLIST.filter((item) => !(checklist && checklist[item.key])).map((item) => item.label);
  }

  /** Conclui a sessão. O checklist incompleto é guardado como pendência, sem bloquear a conclusão. */
  function finish(s, { now, checklist, topicId, notes }) {
    pause(s, now);
    s.status = 'concluida';
    s.endedAt = now;
    s.checklist = { ...checklist };
    s.pendencias = pendingChecklist(checklist);
    if (topicId !== undefined) s.topicId = topicId || null;
    if (notes !== undefined) s.notes = notes;
    return s;
  }

  function isOpen(s) {
    return s && (s.status === 'ativa' || s.status === 'pausada');
  }

  return {
    PHASES, createSession, elapsed, isRunning, pause, resume, switchPhase, heartbeat,
    recoverAfterReload, suggestChecklist, pendingChecklist, finish, isOpen,
  };
});
