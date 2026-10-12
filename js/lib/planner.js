/* Planejamento: metas diárias e previsão de conclusão do ciclo, sempre a partir do ritmo real registrado. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.planner = lib;
})(function (U) {
  const DEFAULT_GOAL = { minutes: 120, questions: 40, reviews: 10 };
  const WINDOW_DAYS = 28; // janela de ritmo: 4 semanas

  /** Progresso de hoje frente às metas diárias. Meta zerada conta como concluída. */
  function dailyProgress(activity, today, goal) {
    const g = { ...DEFAULT_GOAL, ...(goal || {}) };
    const d = activity.get(today) || { minutes: 0, questions: 0, reviews: 0 };
    const pct = (value, target) => (target > 0 ? Math.min(100, (value / target) * 100) : 100);
    const rows = [
      { key: 'minutes', label: 'Minutos estudados', value: Math.round(d.minutes), target: g.minutes, unit: 'min' },
      { key: 'questions', label: 'Questões resolvidas', value: d.questions, target: g.questions, unit: 'questões' },
      { key: 'reviews', label: 'Itens revisados', value: d.reviews, target: g.reviews, unit: 'itens' },
    ].map((r) => ({ ...r, pct: pct(r.value, r.target) }));
    return { goal: g, rows, done: rows.every((r) => r.pct >= 100) };
  }

  /**
   * Previsão de conclusão com base nas sessões concluídas das últimas 4 semanas.
   * Projeta o ritmo atual; não cobra nada de dias perdidos.
   */
  function cycleForecast(sessions, cycle, cursorId, today) {
    const index = cycle.findIndex((b) => b.id === cursorId);
    const left = index < 0 ? cycle.length : cycle.length - index;
    const since = U.addDays(today, -(WINDOW_DAYS - 1));
    const recent = sessions.filter((s) => s.status === 'concluida' && U.isISODate(U.todayISO(new Date(s.startedAt))) && U.todayISO(new Date(s.startedAt)) >= since);
    if (!recent.length || !cycle.length) {
      return { ready: false, sessionsInWindow: recent.length, leftInLoop: left, cycleLength: cycle.length };
    }
    const perDay = recent.length / WINDOW_DAYS;
    const daysLoop = Math.ceil(left / perDay);
    const daysFull = Math.ceil(cycle.length / perDay);
    return {
      ready: true,
      sessionsInWindow: recent.length,
      perWeek: Math.round((recent.length / WINDOW_DAYS) * 7 * 10) / 10,
      leftInLoop: left,
      cycleLength: cycle.length,
      daysLoop,
      dateLoop: U.addDays(today, daysLoop),
      daysFull,
      dateFull: U.addDays(today, daysFull),
    };
  }

  return { DEFAULT_GOAL, WINDOW_DAYS, dailyProgress, cycleForecast };
});
