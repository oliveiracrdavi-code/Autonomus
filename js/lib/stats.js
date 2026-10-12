/* Indicadores calculados a partir dos registros reais (nunca preenchidos com valores estimados). */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.stats = lib;
})(function (U) {
  const MIN_SAMPLE = 5; // abaixo disso o desempenho é marcado como "amostra pequena"

  /** Soma acertos, erros, brancos e calcula o aproveitamento (acertos / total). */
  function totals(logs) {
    const t = { total: 0, correct: 0, wrong: 0, blank: 0 };
    for (const l of logs) {
      t.total += l.total;
      t.correct += l.correct;
      t.wrong += l.wrong;
      t.blank += l.blank;
    }
    t.pct = U.pctOf(t.correct, t.total);
    return t;
  }

  /** Uma linha por disciplina (inclusive sem registros), na ordem cadastrada. */
  function bySubject(logs, subjects) {
    return subjects.map((s) => {
      const mine = logs.filter((l) => l.subjectId === s.id);
      const t = totals(mine);
      return {
        subjectId: s.id,
        name: s.name,
        weight: s.weight,
        archived: !!s.archived,
        ...t,
        smallSample: t.total > 0 && t.total < MIN_SAMPLE,
      };
    });
  }

  /** Desempenho de um assunto (topic) específico. */
  function byTopic(logs, topicId) {
    return totals(logs.filter((l) => l.topicId === topicId));
  }

  /** Agrupa por subtópico/assunto livre dentro de uma disciplina. */
  function bySubtopic(logs, subjectId) {
    const groups = new Map();
    for (const l of logs) {
      if (l.subjectId !== subjectId) continue;
      const label = (l.subtopic || '').trim() || 'Sem assunto informado';
      const key = U.normalize(label);
      if (!groups.has(key)) groups.set(key, { label, logs: [] });
      groups.get(key).logs.push(l);
    }
    return [...groups.values()]
      .map((g) => ({ label: g.label, ...totals(g.logs) }))
      .sort((a, b) => b.total - a.total || U.compareText(a.label, b.label));
  }

  /** Evolução semanal (semana começando na segunda-feira). */
  function timelineByWeek(logs) {
    const weeks = new Map();
    for (const l of logs) {
      if (!U.isISODate(l.date)) continue;
      const key = U.weekStart(l.date);
      if (!weeks.has(key)) weeks.set(key, []);
      weeks.get(key).push(l);
    }
    return [...weeks.keys()]
      .sort()
      .map((key) => {
        const t = totals(weeks.get(key));
        return { key, label: `sem. ${U.fmtDayMonth(key)}`, ...t };
      });
  }

  /** Horas estudadas por disciplina, a partir das sessões (inclui sessões pausadas, sem duplicar). */
  function hoursBySubject(sessions, elapsedFn) {
    const out = {};
    for (const s of sessions) {
      if (!s.subjectId) continue;
      out[s.subjectId] = (out[s.subjectId] || 0) + elapsedFn(s).total;
    }
    return out;
  }

  /** Melhores e piores disciplinas, considerando só amostras com tamanho mínimo. */
  function rankSubjects(rows, n) {
    const eligible = rows.filter((r) => r.total >= MIN_SAMPLE && !r.archived);
    const sorted = eligible.slice().sort((a, b) => b.pct - a.pct || b.total - a.total);
    const count = Math.min(n || 3, Math.floor(sorted.length / 2) || sorted.length);
    return {
      best: sorted.slice(0, count),
      worst: sorted.slice().reverse().slice(0, count),
      enoughData: eligible.length >= 2,
    };
  }

  /**
   * Erros que se repetem: mesmo assunto (ou mesma disciplina sem assunto) com 2+ erros no caderno,
   * ou itens marcados como "erro recorrente".
   */
  function recurringGroups(errors) {
    const groups = new Map();
    for (const e of errors) {
      if (!e.subjectId) continue;
      const topicPart = e.topicId || U.normalize(e.subtopic || '');
      const key = `${e.subjectId}|${topicPart}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          subjectId: e.subjectId,
          label: e.topicLabel || (e.subtopic || '').trim() || 'Sem assunto informado',
          errorCount: 0,
          flagged: 0,
          items: [],
        });
      }
      const g = groups.get(key);
      if (e.kind === 'erro') g.errorCount += 1;
      if (e.status === 'recorrente') g.flagged += 1;
      g.items.push(e);
    }
    return [...groups.values()]
      .filter((g) => g.errorCount >= 2 || g.flagged > 0)
      .sort((a, b) => b.errorCount + b.flagged - (a.errorCount + a.flagged));
  }

  /**
   * Comparação "uma semana sim e uma não": cada simulado é comparado com o último feito
   * pelo menos 14 dias antes.
   */
  function simuladoSeries(simulados) {
    const sorted = simulados
      .slice()
      .sort((a, b) => U.compareText(a.date, b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    return sorted.map((s, i) => {
      const pct = U.pctOf(s.correct, s.total);
      const wrong = s.total - s.correct - (s.blank || 0);
      let compare = null;
      for (let j = i - 1; j >= 0; j--) {
        if (U.diffDays(sorted[j].date, s.date) >= 14) {
          const prev = sorted[j];
          const deltaCorrect = s.correct - prev.correct;
          const deltaPct = pct != null && U.pctOf(prev.correct, prev.total) != null
            ? pct - U.pctOf(prev.correct, prev.total)
            : null;
          compare = {
            id: prev.id,
            date: prev.date,
            name: prev.name,
            correct: prev.correct,
            deltaCorrect,
            deltaPct,
            trend: deltaCorrect > 0 ? 'evoluiu' : deltaCorrect < 0 ? 'caiu' : 'estável',
          };
          break;
        }
      }
      return { ...s, pct, wrong, compare };
    });
  }

  /** Meta atual = menor meta ainda não superada pelo melhor simulado. */
  function goalStatus(goals, simulados) {
    const series = simuladoSeries(simulados);
    const sortedGoals = goals.slice().sort((a, b) => a.target - b.target);
    const best = series.reduce((m, s) => Math.max(m, s.correct), 0);
    const latest = series.length ? series[series.length - 1] : null;
    const achieved = sortedGoals.filter((g) => best >= g.target);
    const current = sortedGoals.find((g) => best < g.target) || null;
    return {
      goals: sortedGoals.map((g) => {
        const firstHit = series.find((s) => s.correct >= g.target);
        return { ...g, achieved: best >= g.target, achievedOn: firstHit ? firstHit.date : null };
      }),
      best,
      latest,
      current,
      achievedCount: achieved.length,
      progress: current && latest ? Math.min(100, (latest.correct / current.target) * 100) : current ? 0 : 100,
    };
  }

  /** Resumo das sessões: concluídas, horas e tempo em cada fase. */
  function sessionSummary(sessions, elapsedFn) {
    let ms = 0;
    let teoria = 0;
    let questoes = 0;
    let concluded = 0;
    for (const s of sessions) {
      const e = elapsedFn(s);
      ms += e.total;
      teoria += e.teoria;
      questoes += e.questoes;
      if (s.status === 'concluida') concluded += 1;
    }
    return { totalMs: ms, teoriaMs: teoria, questoesMs: questoes, concluded, count: sessions.length };
  }

  /**
   * Matriz de certeza: para questões individuais com nível de certeza, cruza certeza × resultado.
   * Convicção errada (certeza + erro) é o quadrante mais perigoso: é onde a revisão deve começar.
   */
  function certaintyMatrix(logs) {
    const cells = {
      certeza: { acerto: 0, erro: 0 },
      duvida: { acerto: 0, erro: 0 },
      chute: { acerto: 0, erro: 0 },
    };
    for (const l of logs) {
      if (l.mode !== 'individual' || !cells[l.certainty]) continue;
      if (l.correct === 1) cells[l.certainty].acerto += 1;
      else if (l.wrong === 1) cells[l.certainty].erro += 1;
    }
    const total = Object.values(cells).reduce((n, c) => n + c.acerto + c.erro, 0);
    return { cells, total, convictionWrong: cells.certeza.erro, guessRight: cells.chute.acerto };
  }

  return {
    MIN_SAMPLE, totals, bySubject, byTopic, bySubtopic, timelineByWeek, hoursBySubject,
    rankSubjects, recurringGroups, simuladoSeries, goalStatus, sessionSummary, certaintyMatrix,
  };
});
