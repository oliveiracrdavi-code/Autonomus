/* Indicadores de engajamento e planejamento, todos derivados dos registros reais:
 * dias de estudo, sequência, mapa de calor, XP e nível, conquistas, ritmo semanal,
 * sugestão de prioridades (sem alterar o ciclo) e previsão de acertos a partir dos simulados. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const stats = typeof require === 'function' ? require('./stats') : window.OAB.lib.stats;
  const S = typeof require === 'function' ? require('./session') : window.OAB.lib.session;
  const lib = factory(U, stats, S);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.analytics = lib;
})(function (U, stats, S) {
  const XP = { perTenMinutes: 1, perQuestion: 1, perSession: 20, perReviewAttempt: 3 };

  /** Minutos e atividade por dia (sessões, questões e tentativas de revisão). */
  function activityByDay(state, now) {
    const days = new Map();
    const bump = (date, key, value) => {
      if (!U.isISODate(date)) return;
      if (!days.has(date)) days.set(date, { date, minutes: 0, questions: 0, sessions: 0, reviews: 0 });
      days.get(date)[key] += value;
    };
    for (const s of state.sessions) {
      const e = S.elapsed(s, now);
      if (e.total > 0) {
        bump(U.todayISO(new Date(s.startedAt)), 'minutes', e.total / 60000);
        if (s.status === 'concluida') bump(U.todayISO(new Date(s.startedAt)), 'sessions', 1);
      }
    }
    for (const l of state.logs) bump(l.date, 'questions', l.total);
    for (const e of state.errors) {
      for (const a of e.attempts || []) bump(a.date, 'reviews', 1);
    }
    return days;
  }

  /** Dias com qualquer atividade. */
  function activeDays(activity) {
    return new Set([...activity.values()].filter((d) => d.minutes > 0 || d.questions > 0 || d.reviews > 0).map((d) => d.date));
  }

  /**
   * Sequência atual: dias seguidos com estudo até hoje (ou até ontem, se hoje ainda não teve nada).
   * Não cobra nada: um dia sem estudo apenas zera a contagem, sem gerar pendências.
   */
  function streak(days, today) {
    let cursor = today;
    if (!days.has(cursor)) cursor = U.addDays(today, -1);
    let current = 0;
    while (days.has(cursor)) {
      current += 1;
      cursor = U.addDays(cursor, -1);
    }
    const sorted = [...days].sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const d of sorted) {
      run = prev && U.diffDays(prev, d) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    return { current, longest };
  }

  /** Últimas N semanas em células (domingo a sábado), para o mapa de calor. */
  function heatmapGrid(activity, today, weeks) {
    const count = (weeks || 16) * 7;
    const end = today;
    const start = U.addDays(U.weekStart(end), -(weeks - 1) * 7);
    const cells = [];
    for (let i = 0; i < count; i++) {
      const date = U.addDays(start, i);
      if (date > end) {
        cells.push({ date, future: true, level: 0 });
        continue;
      }
      const d = activity.get(date);
      const score = d ? d.minutes / 30 + d.questions / 20 + d.reviews / 3 : 0;
      const level = score === 0 ? 0 : score < 1 ? 1 : score < 2.5 ? 2 : score < 5 ? 3 : 4;
      cells.push({ date, future: false, level, detail: d || null });
    }
    return cells;
  }

  /** XP e nível. Nível L começa em 25·(L−1)² XP. */
  function xpInfo(state, now) {
    const sessions = stats.sessionSummary(state.sessions, (s) => S.elapsed(s, now));
    const totals = stats.totals(state.logs);
    const reviews = state.errors.reduce((n, e) => n + (e.attempts || []).length, 0);
    const xp = Math.floor(
      (sessions.totalMs / 60000 / 10) * XP.perTenMinutes +
      totals.total * XP.perQuestion +
      sessions.concluded * XP.perSession +
      reviews * XP.perReviewAttempt
    );
    const level = Math.floor(Math.sqrt(xp / 25)) + 1;
    const floorXp = 25 * (level - 1) ** 2;
    const nextXp = 25 * level ** 2;
    return {
      xp,
      level,
      floorXp,
      nextXp,
      progress: Math.min(100, ((xp - floorXp) / (nextXp - floorXp)) * 100),
      breakdown: { minutes: sessions.totalMs / 60000, questions: totals.total, sessions: sessions.concluded, reviews },
    };
  }

  /** Conquistas desbloqueadas a partir dos dados reais. */
  function achievements(state, now, streakInfo) {
    const totals = stats.totals(state.logs);
    const sessions = stats.sessionSummary(state.sessions, (s) => S.elapsed(s, now));
    const goals = stats.goalStatus(state.goals, state.simulados);
    const reviews = state.errors.reduce((n, e) => n + (e.attempts || []).length, 0);
    const openErrors = state.errors.filter((e) => e.status !== 'revisado').length;
    const maxGoal = state.goals.reduce((m, g) => Math.max(m, g.target), 0);
    return [
      { id: 'primeira-sessao', title: 'Primeira sessão', desc: 'Conclua uma sessão de estudo.', unlocked: sessions.concluded >= 1, icon: 'timer' },
      { id: 'sete-dias', title: 'Sete dias seguidos', desc: 'Estude 7 dias seguidos sem interrupção.', unlocked: streakInfo.longest >= 7, icon: 'cycle' },
      { id: 'cem-questoes', title: 'Centena', desc: 'Resolva 100 questões.', unlocked: totals.total >= 100, icon: 'list' },
      { id: 'mil-questoes', title: 'Mil questões', desc: 'Resolva 1.000 questões.', unlocked: totals.total >= 1000, icon: 'target' },
      { id: 'dez-horas', title: 'Dez horas', desc: 'Acumule 10 horas cronometradas.', unlocked: sessions.totalMs >= 10 * 3600000, icon: 'history' },
      { id: 'primeira-meta', title: 'Primeira meta', desc: 'Atinja a primeira meta de acertos.', unlocked: goals.best >= (goals.goals[0] ? goals.goals[0].target : Infinity), icon: 'target' },
      { id: 'meta-final', title: 'Meta final', desc: 'Alcance a maior meta cadastrada.', unlocked: maxGoal > 0 && goals.best >= maxGoal, icon: 'target' },
      { id: 'revisao-feita', title: 'Revisão em dia', desc: 'Refaça pelo menos um item do caderno.', unlocked: reviews >= 1, icon: 'refresh' },
      { id: 'caderno-zerado', title: 'Caderno zerado', desc: 'Tenha ao menos 5 itens e nenhum em aberto.', unlocked: state.errors.length >= 5 && openErrors === 0, icon: 'check' },
      { id: 'ciclo-completo', title: 'Volta completa', desc: 'Percorra o ciclo inteiro uma vez.', unlocked: state.completedLoops >= 1, icon: 'cycle' },
    ];
  }

  /** Ritmo dos últimos 7 dias (minutos por dia), do mais antigo para o mais recente. */
  function weekRhythm(activity, today) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = U.addDays(today, i - 6);
      const d = activity.get(date);
      return { date, label: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][U.weekday(date)], minutes: d ? Math.round(d.minutes) : 0, questions: d ? d.questions : 0, isToday: date === today };
    });
  }

  /**
   * Sugestão de prioridade por disciplina: peso informado × baixo desempenho × presença no ciclo.
   * É apenas uma sugestão exibida na tela; o ciclo não muda automaticamente.
   */
  function priorities(state) {
    const counts = {};
    state.cycle.forEach((b) => { counts[b.subjectId] = (counts[b.subjectId] || 0) + 1; });
    const rows = stats.bySubject(state.logs, state.subjects).filter((r) => !r.archived);
    const maxW = Math.max(1, ...rows.map((r) => r.weight || 0));
    return rows.map((r) => {
      const perf = r.pct == null ? 0.5 : (100 - r.pct) / 100; // sem dados = meio caminho
      const weight = (r.weight || 0) / maxW;
      const freq = (counts[r.subjectId] || 0) / Math.max(1, state.cycle.length);
      const score = Math.round((weight * 0.45 + perf * 0.4 + Math.min(1, freq * 4) * 0.15) * 100);
      const reason = r.pct == null ? 'sem questões ainda'
        : r.pct < 50 ? 'desempenho abaixo de 50%'
          : r.pct < 70 ? 'desempenho na faixa de atenção'
            : 'manter o ritmo';
      return { subjectId: r.subjectId, name: r.name, weight: r.weight, pct: r.pct, total: r.total, cycleCount: counts[r.subjectId] || 0, score, reason };
    }).sort((a, b) => b.score - a.score || (b.weight || 0) - (a.weight || 0)).slice(0, 6);
  }

  /** Previsão linear de acertos a partir dos últimos simulados (só com 3 ou mais). */
  function forecast(simulados) {
    const series = stats.simuladoSeries(simulados).slice(-6);
    if (series.length < 3) return null;
    const n = series.length;
    const xs = series.map((_, i) => i);
    const ys = series.map((s) => s.correct);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0;
    const next = Math.round(my + slope * (n - mx));
    return { next: Math.max(0, Math.min(80, next)), slope: Math.round(slope * 10) / 10, points: n };
  }

  /** Dias até a data da prova (null se não definida). */
  function countdown(examDate, today) {
    if (!U.isISODate(examDate)) return null;
    return U.diffDays(today, examDate);
  }

  return { XP, activityByDay, activeDays, streak, heatmapGrid, xpInfo, achievements, weekRhythm, priorities, forecast, countdown };
});
