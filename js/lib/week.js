/* Calendário semanal: blocos de estudo por dia (segunda a domingo). Os blocos se repetem toda semana;
 * o que foi feito é marcado por semana (a chave é a segunda-feira da semana). */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.week = lib;
})(function (U) {
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const MIN_MINUTES = 10;
  const MAX_MINUTES = 480;
  const MAX_TOPIC = 120;

  /** Dia da semana começando na segunda: 0 = segunda, 6 = domingo. */
  function dayIndex(iso) {
    return (U.weekday(iso) + 6) % 7;
  }

  /** Segunda-feira da semana que contém a data. */
  function weekKey(iso) {
    return U.weekStart(iso);
  }

  /** Valida um bloco do calendário. Devolve { ok, errors, value }. */
  function validateBlock(raw, subjects) {
    const errors = {};
    const day = raw.weekday === '' || raw.weekday == null ? NaN : Number(raw.weekday);
    if (!Number.isInteger(day) || day < 0 || day > 6) errors.weekday = 'Escolha o dia da semana.';
    const subjectId = String(raw.subjectId || '');
    if (!subjectId) errors.subjectId = 'Escolha a disciplina.';
    else if (!subjects.some((s) => s.id === subjectId)) errors.subjectId = 'Disciplina não encontrada. Cadastre em Matérias.';
    const minutes = raw.minutes === '' || raw.minutes == null ? NaN : Number(raw.minutes);
    if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      errors.minutes = `Informe de ${MIN_MINUTES} a ${MAX_MINUTES} minutos.`;
    }
    const topic = String(raw.topic || '').trim();
    if (topic.length > MAX_TOPIC) errors.topic = `Use até ${MAX_TOPIC} caracteres.`;
    if (Object.keys(errors).length) return { ok: false, errors, value: null };
    return { ok: true, errors: {}, value: { weekday: day, subjectId, minutes, topic } };
  }

  /** Blocos de um dia da semana, na ordem em que foram criados. */
  function blocksOfDay(blocks, index) {
    return blocks.filter((b) => b.weekday === index);
  }

  function isDone(done, weekStart, blockId) {
    return done.includes(`${weekStart}|${blockId}`);
  }

  /** Blocos de uma data, com a situação de "feito" na semana dessa data. */
  function dayPlan({ blocks, done }, date, subjectName, isActive) {
    const index = dayIndex(date);
    const weekStart = weekKey(date);
    const list = blocksOfDay(blocks, index).map((b) => ({
      ...b,
      subjectName: subjectName(b.subjectId),
      done: isDone(done, weekStart, b.id),
      archived: !!isActive && !isActive(b.subjectId),
    }));
    return {
      date,
      index,
      weekStart,
      dayName: DAYS[index],
      blocks: list,
      plannedMin: list.reduce((n, b) => n + b.minutes, 0),
      doneMin: list.filter((b) => b.done).reduce((n, b) => n + b.minutes, 0),
    };
  }

  /** Totais de uma semana: planejado e feito por dia (segunda a domingo). */
  function weekTotals({ blocks, done }, anyDateInWeek, subjectName, isActive) {
    const start = weekKey(anyDateInWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const date = U.addDays(start, i);
      const plan = dayPlan({ blocks, done }, date, subjectName, isActive);
      return { date, index: i, label: SHORT[i], plannedMin: plan.plannedMin, doneMin: plan.doneMin, blocks: plan.blocks };
    });
  }

  /**
   * O que estudar agora. Prioridade: bloco de hoje ainda não feito; depois, o dia já concluído;
   * sem bloco hoje, a disciplina mais prioritária segundo o desempenho (vinda de analytics.priorities).
   */
  function suggestion({ blocks, done }, today, subjectName, priorities, topicOf, isActive) {
    const plan = dayPlan({ blocks, done }, today, subjectName, isActive);
    // bloco de disciplina arquivada não entra na sugestão de hoje
    const pending = plan.blocks.find((b) => !b.done && !b.archived);
    if (pending) {
      return {
        kind: 'bloco',
        title: `Agora: ${pending.subjectName}`,
        text: `${pending.minutes} min${pending.topic ? ` · ${pending.topic}` : ''}. Registre as questões que fizer.`,
        subjectId: pending.subjectId,
        blockId: pending.id,
      };
    }
    if (plan.blocks.some((b) => !b.archived)) {
      return { kind: 'concluido', title: 'Blocos de hoje concluídos', text: 'Registre as questões que resolveu hoje ou revise o caderno de erros.', subjectId: null, blockId: null };
    }
    const top = (priorities || [])[0];
    if (top) {
      const topic = topicOf ? topicOf(top.subjectId) : null;
      return {
        kind: 'sugestao',
        title: `Sugestão: ${top.name}`,
        text: `${top.reason[0].toUpperCase()}${top.reason.slice(1)}. ${topic ? `Assunto para começar: ${topic}. ` : ''}Monte um bloco para ela no calendário.`,
        subjectId: top.subjectId,
        blockId: null,
      };
    }
    return { kind: 'nada', title: 'Nada para hoje', text: 'Cadastre as disciplinas em Matérias e monte sua semana no calendário.', subjectId: null, blockId: null };
  }

  return { DAYS, SHORT, MIN_MINUTES, MAX_MINUTES, dayIndex, weekKey, validateBlock, blocksOfDay, isDone, dayPlan, weekTotals, suggestion };
});
