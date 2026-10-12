/* Modo prova: simulado cronometrado com gabarito (C = certa, E = errada, B = em branco).
 * Questões não marcadas ao final contam como em branco. O tempo segue o mesmo princípio das sessões:
 * acumulado + marca de início, para não contar tempo com o app fechado. */
(function (factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.prova = lib;
})(function () {
  const CYCLE = ['', 'C', 'E', 'B']; // ciclo de marcação ao clicar: vazio → certa → errada → branco → vazio
  const CODES = { C: 'C', E: 'E', B: 'B', c: 'C', e: 'E', b: 'B' };

  const nextMark = (m) => CYCLE[(CYCLE.indexOf(m || '') + 1) % CYCLE.length];

  /** Lê um gabarito colado (ex.: "CEBCE CC…"). Ignora espaços; outros caracteres viram erro. */
  function parseGabarito(text, total) {
    const codes = String(text || '').replace(/\s+/g, '').split('');
    const answers = {};
    const invalid = [];
    codes.forEach((ch, i) => {
      if (i >= total) return;
      if (CODES[ch]) answers[i + 1] = CODES[ch];
      else invalid.push(ch);
    });
    return { answers, invalid: [...new Set(invalid)], read: Object.keys(answers).length, extra: Math.max(0, codes.length - total) };
  }

  /** Totais do gabarito. Não marcadas entram como em branco. */
  function totals(answers, total) {
    const t = { total, correct: 0, wrong: 0, blank: 0, unmarked: 0, marked: 0 };
    for (let n = 1; n <= total; n++) {
      const m = answers[n];
      if (m === 'C') t.correct += 1;
      else if (m === 'E') t.wrong += 1;
      else if (m === 'B') t.blank += 1;
      else t.unmarked += 1;
    }
    t.marked = t.correct + t.wrong + t.blank;
    t.blankFinal = t.blank + t.unmarked;
    return t;
  }

  /** Tempo decorrido da prova, em ms. */
  function elapsed(draft, now) {
    return draft.acc + (draft.runningSince != null ? Math.max(0, now - draft.runningSince) : 0);
  }

  function createDraft({ id, name, total, limitMin, now }) {
    return {
      id,
      name,
      total,
      limitMin,
      startedAt: now,
      acc: 0,
      runningSince: now,
      answers: {},
      lastSeen: now,
      finishedAt: null,
    };
  }

  function pause(draft, now) {
    if (draft.runningSince != null) {
      draft.acc += Math.max(0, now - draft.runningSince);
      draft.runningSince = null;
    }
    return draft;
  }

  function resume(draft, now) {
    if (draft.runningSince == null) draft.runningSince = now;
    return draft;
  }

  /** Recuperação após fechar o app: conta só até a última atividade (aqui, o último instante em que a prova rodava). */
  function recover(draft, lastSeen) {
    if (draft.runningSince != null) {
      const end = Math.max(draft.runningSince, lastSeen || draft.runningSince);
      draft.acc += end - draft.runningSince;
      draft.runningSince = null;
    }
    return draft;
  }

  return { CYCLE, nextMark, parseGabarito, totals, elapsed, createDraft, pause, resume, recover };
});
