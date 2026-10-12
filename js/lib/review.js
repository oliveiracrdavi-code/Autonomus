/* Revisão semanal de erros. Reúne apenas itens já registrados no caderno dentro do período escolhido.
 * Não adiciona conteúdo novo, não presume dias de estudo e não mexe no ciclo. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.review = lib;
})(function (U) {
  /** Período da revisão: 'semana' (seg–dom), 'anterior', '7dias' ou 'personalizado'. */
  function periodRange(kind, today, custom) {
    if (kind === 'anterior') return U.weekRange(U.addDays(today, -7));
    if (kind === '7dias') return { from: U.addDays(today, -6), to: today };
    if (kind === 'personalizado' && custom && custom.from && custom.to) {
      const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
      return { from, to };
    }
    return U.weekRange(today);
  }

  /**
   * Itens do período, do mais antigo para o mais recente.
   * `includePendingBefore` acrescenta pendências de períodos anteriores (opcional, desligado por padrão).
   */
  function collectItems(errors, { from, to, includePendingBefore }) {
    return errors
      .filter((e) => {
        if (!U.isISODate(e.date)) return false;
        if (e.date >= from && e.date <= to) return true;
        return !!includePendingBefore && e.date < from && e.status === 'pendente';
      })
      .sort((a, b) => U.compareText(a.date, b.date) || U.compareText(a.subjectId, b.subjectId));
  }

  /** Resumo do período: quantos itens, quantos já revisados e em quantos dias houve registros. */
  function summarize(items, logs, { from, to }) {
    const daysWithLogs = new Set(logs.filter((l) => l.date >= from && l.date <= to).map((l) => l.date));
    const daysWithErrors = new Set(items.map((i) => i.date));
    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'pendente').length,
      revised: items.filter((i) => i.status === 'revisado').length,
      recurring: items.filter((i) => i.status === 'recorrente').length,
      daysWithLogs: daysWithLogs.size,
      daysWithErrors: daysWithErrors.size,
      periodDays: U.diffDays(from, to) + 1,
    };
  }

  /** Última tentativa de cada item (ou null). */
  function lastAttempt(entry) {
    const list = entry.attempts || [];
    return list.length ? list[list.length - 1] : null;
  }

  return { periodRange, collectItems, summarize, lastAttempt };
});
