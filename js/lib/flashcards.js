/* Flashcards com repetição espaçada (método de caixas, tipo Leitner) a partir do caderno de erros.
 * Um item do caderno vira cartão quando tem a regra correta preenchida. Acertar sobe de caixa e afasta a
 * próxima revisão; errar volta para a caixa 1 e a revisão é amanhã. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.flashcards = lib;
})(function (U) {
  // Intervalo em dias ao entrar em cada caixa (índice 0 = caixa 1).
  const INTERVALS = [1, 2, 4, 7, 15];
  const MAX_BOX = INTERVALS.length;

  /** Só vira cartão o item que tem uma regra correta escrita (o que se deve lembrar). */
  const isCandidate = (entry) => !!entry && String(entry.rule || '').trim().length >= 3;

  /** Estado atual do cartão, ou o estado inicial (caixa 1, vence hoje). */
  function cardState(errorId, cards, today) {
    const found = (cards || []).find((c) => c.errorId === errorId);
    return found || { errorId, box: 1, due: today, reps: 0, lapses: 0 };
  }

  /** Resposta do usuário: lembrei (correct) ou esqueci. Devolve o novo estado do cartão. */
  function answer(card, correct, today) {
    if (correct) {
      const box = Math.min(MAX_BOX, card.box + 1);
      return { ...card, box, due: U.addDays(today, INTERVALS[box - 1]), reps: card.reps + 1, lastAt: today };
    }
    return { ...card, box: 1, due: U.addDays(today, INTERVALS[0]), lapses: card.lapses + 1, lastAt: today };
  }

  /** Cartões que vencem até hoje, da caixa mais baixa para a mais alta (o que mais precisa de revisão primeiro). */
  function dueToday(entries, cards, today) {
    return entries
      .filter(isCandidate)
      .map((e) => ({ entry: e, card: cardState(e.id, cards, today) }))
      .filter(({ card }) => card.due <= today)
      .sort((a, b) => a.card.box - b.card.box || U.compareText(a.card.due, b.card.due));
  }

  /** Resumo para o painel: quantos cartões, quantos vencem hoje e distribuição por caixa. */
  function summary(entries, cards, today) {
    const candidates = entries.filter(isCandidate);
    const byBox = Array.from({ length: MAX_BOX }, () => 0);
    let due = 0;
    for (const e of candidates) {
      const c = cardState(e.id, cards, today);
      byBox[c.box - 1] += 1;
      if (c.due <= today) due += 1;
    }
    return {
      total: candidates.length,
      due,
      byBox,
      mastered: byBox[MAX_BOX - 1],
      withoutRule: entries.length - candidates.length,
    };
  }

  return { INTERVALS, MAX_BOX, isCandidate, cardState, answer, dueToday, summary };
});
