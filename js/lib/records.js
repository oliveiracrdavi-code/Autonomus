/* Validação e construção dos registros (questões, caderno de erros, simulados, metas, matérias, tópicos, materiais).
 * Cada `validate*` devolve { ok, errors, value } com mensagens por campo, pensadas para exibição no formulário. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.records = lib;
})(function (U) {
  /** Lê um inteiro digitado. Vazio → { empty }, texto inválido → { invalid }. */
  function parseCount(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return { empty: true };
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return { invalid: true };
    return { value: parseInt(s, 10) };
  }

  /** Lê uma lista de números de questões ("3, 7, 12-14"). Retorna números únicos e os trechos inválidos. */
  function parseQuestionList(text, total) {
    const numbers = new Set();
    const invalid = [];
    String(text || '')
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((tok) => {
        const m = /^(\d+)(?:-(\d+))?$/.exec(tok);
        if (!m) return invalid.push(tok);
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        if (a < 1 || b < a || (total && b > total) || b - a > 500) return invalid.push(tok);
        for (let n = a; n <= b; n++) numbers.add(n);
      });
    return { numbers: [...numbers].sort((x, y) => x - y), invalid };
  }

  const RESULTS = ['acerto', 'erro', 'branco'];

  /**
   * Valida um registro de questões.
   * mode 'bloco': total, acertos, erros e brancos (basta dois deles; o terceiro é calculado).
   * mode 'individual': uma questão, com resultado acerto / erro / branco.
   */
  function validateLog(input) {
    const errors = {};
    const warnings = [];
    const individual = input.mode === 'individual';
    let total = 1;
    let correct = 0;
    let wrong = 0;
    let blank = 0;

    if (!input.subjectId) errors.subjectId = 'Escolha a disciplina.';
    if (!U.isISODate(input.date)) errors.date = 'Informe uma data válida.';

    if (individual) {
      if (!RESULTS.includes(input.result)) errors.result = 'Marque o resultado da questão.';
      correct = input.result === 'acerto' ? 1 : 0;
      wrong = input.result === 'erro' ? 1 : 0;
      blank = input.result === 'branco' ? 1 : 0;
    } else {
      const t = parseCount(input.total);
      if (t.empty || t.invalid || t.value < 1) errors.total = 'Informe a quantidade de questões (mínimo 1).';
      else total = t.value;

      const c = parseCount(input.correct);
      const w = parseCount(input.wrong);
      const b = parseCount(input.blank);
      if (c.invalid || w.invalid || b.invalid) errors.correct = 'Use somente números inteiros.';
      else if (!errors.total) {
        let cv = c.empty ? null : c.value;
        let wv = w.empty ? null : w.value;
        const bv = b.empty ? 0 : b.value;
        if (cv === null && wv === null) errors.correct = 'Informe os acertos ou os erros.';
        else {
          if (cv === null) cv = total - wv - bv;
          if (wv === null) wv = total - cv - bv;
          if (cv < 0 || wv < 0) errors.correct = 'Acertos, erros e brancos não podem somar mais que o total.';
          else if (cv + wv + bv !== total) {
            errors.correct = `Acertos (${cv}) + erros (${wv}) + brancos (${bv}) somam ${cv + wv + bv}, mas o total é ${total}.`;
          }
          correct = cv;
          wrong = wv;
          blank = bv;
        }
      }
    }

    const minutes = parseCount(input.minutes);
    if (minutes.invalid) errors.minutes = 'Use minutos inteiros.';

    let wrongList = [];
    let doubtList = [];
    if (!individual && !errors.total) {
      const wl = parseQuestionList(input.wrongNumbers, total);
      const dl = parseQuestionList(input.doubtNumbers, total);
      if (wl.invalid.length) errors.wrongNumbers = `Números inválidos: ${wl.invalid.join(', ')}.`;
      if (dl.invalid.length) errors.doubtNumbers = `Números inválidos: ${dl.invalid.join(', ')}.`;
      wrongList = wl.numbers;
      doubtList = dl.numbers;
      if (wrongList.length && wrongList.length !== wrong && !errors.wrongNumbers) {
        warnings.push(`Você listou ${wrongList.length} questão(ões) erradas, mas informou ${wrong} erro(s).`);
      }
    }

    const ok = Object.keys(errors).length === 0;
    return {
      ok,
      errors,
      warnings,
      value: {
        mode: individual ? 'individual' : 'bloco',
        date: input.date,
        subjectId: input.subjectId || null,
        topicId: input.topicId || null,
        subtopic: String(input.subtopic || '').trim(),
        banca: String(input.banca || '').trim(),
        prova: String(input.prova || '').trim(),
        origem: input.origem || 'outra',
        total,
        correct,
        wrong,
        blank,
        minutes: minutes.empty || minutes.invalid ? null : minutes.value,
        notes: String(input.notes || '').trim(),
        sessionId: input.sessionId || null,
        ref: String(input.ref || '').trim(),
        chute: !!input.chute,
        wrongList,
        doubtList,
        motivo: String(input.motivo || '').trim(),
        regra: String(input.regra || '').trim(),
        anotacao: String(input.anotacao || '').trim(),
      },
    };
  }

  /** Itens do caderno de erros gerados a partir de um registro validado. */
  function errorsFromLog(v, log, makeId) {
    const base = (kind, ref) => ({
      id: makeId('err'),
      date: log.date,
      subjectId: log.subjectId,
      topicId: log.topicId,
      subtopic: log.subtopic,
      ref,
      kind,
      reason: v.motivo || '',
      rule: v.regra || '',
      note: v.anotacao || '',
      origem: log.origem,
      status: 'pendente',
      logId: log.id,
      sessionId: log.sessionId || null,
      attempts: [],
      createdAt: log.createdAt,
      updatedAt: log.createdAt,
    });
    if (v.mode === 'individual') {
      if (log.wrong === 1) return [base('erro', v.ref)];
      if (log.correct === 1 && v.chute) return [base('duvida', v.ref)];
      return [];
    }
    return [
      ...v.wrongList.map((n) => base('erro', `Q${n}`)),
      ...v.doubtList.map((n) => base('duvida', `Q${n}`)),
    ];
  }

  /** Converte um registro validado em registro de log (sem os campos de apoio). */
  function logFromValue(v, makeId, now) {
    return {
      id: makeId('log'),
      mode: v.mode,
      date: v.date,
      subjectId: v.subjectId,
      topicId: v.topicId,
      subtopic: v.subtopic,
      banca: v.banca,
      prova: v.prova,
      origem: v.origem,
      total: v.total,
      correct: v.correct,
      wrong: v.wrong,
      blank: v.blank,
      minutes: v.minutes,
      notes: v.notes,
      sessionId: v.sessionId,
      simuladoId: null,
      createdAt: now,
    };
  }

  /** Valida um simulado com totais e, opcionalmente, a divisão por disciplina. */
  function validateSimulado(input) {
    const errors = {};
    const name = String(input.name || '').trim();
    if (!name) errors.name = 'Dê um nome ao simulado.';
    if (!U.isISODate(input.date)) errors.date = 'Informe a data.';

    const t = parseCount(input.total);
    const c = parseCount(input.correct);
    const b = parseCount(input.blank);
    const m = parseCount(input.minutes);
    let total = 0;
    let correct = 0;
    let blank = 0;
    if (t.empty || t.invalid || t.value < 1) errors.total = 'Informe o total de questões.';
    else total = t.value;
    if (c.empty || c.invalid) errors.correct = 'Informe os acertos.';
    else correct = c.value;
    if (b.invalid) errors.blank = 'Use um número inteiro.';
    else blank = b.empty ? 0 : b.value;
    if (m.invalid) errors.minutes = 'Use minutos inteiros.';
    if (!errors.total && !errors.correct && !errors.blank && correct + blank > total) {
      errors.correct = 'Acertos + brancos não podem ser maiores que o total.';
    }

    const rows = (input.breakdown || [])
      .filter((r) => r.subjectId && String(r.total || '').trim() !== '')
      .map((r) => {
        const rt = parseCount(r.total);
        const rc = parseCount(r.correct);
        const rb = parseCount(r.blank);
        return {
          subjectId: r.subjectId,
          total: rt.value || 0,
          correct: rc.value || 0,
          blank: rb.value || 0,
          bad: rt.invalid || rt.empty || rt.value < 1 || rc.invalid || rc.empty || rb.invalid ||
            (rc.value || 0) + (rb.value || 0) > (rt.value || 0),
        };
      });
    if (rows.some((r) => r.bad)) errors.breakdown = 'Revise as linhas por disciplina: acertos e brancos não podem passar do total.';
    else if (rows.length) {
      const ids = rows.map((r) => r.subjectId);
      if (new Set(ids).size !== ids.length) errors.breakdown = 'Cada disciplina deve aparecer uma vez só.';
      const sumT = rows.reduce((s, r) => s + r.total, 0);
      const sumC = rows.reduce((s, r) => s + r.correct, 0);
      const sumB = rows.reduce((s, r) => s + r.blank, 0);
      if (!errors.total && (sumT !== total || sumC !== correct || sumB !== blank)) {
        errors.breakdown = `A soma por disciplina (${sumT} questões, ${sumC} acertos, ${sumB} brancos) deve bater com o total do simulado (${total}, ${correct}, ${blank}).`;
      }
    }

    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: {
        name,
        date: input.date,
        total,
        correct,
        blank,
        minutes: m.empty || m.invalid ? null : m.value,
        notes: String(input.notes || '').trim(),
        breakdown: rows.map(({ bad, ...r }) => r),
      },
    };
  }

  /** Registros de questões de um simulado: uma linha por disciplina, ou uma linha geral sem disciplina. */
  function buildLogsFromSimulado(sim, makeId) {
    const id = makeId || U.uid;
    const rows = sim.breakdown && sim.breakdown.length
      ? sim.breakdown
      : [{ subjectId: null, total: sim.total, correct: sim.correct, blank: sim.blank || 0 }];
    return rows
      .filter((r) => r.total > 0)
      .map((r) => ({
        id: id('log'),
        mode: 'bloco',
        date: sim.date,
        subjectId: r.subjectId || null,
        topicId: null,
        subtopic: '',
        banca: '',
        prova: sim.name,
        origem: 'simulado',
        total: r.total,
        correct: r.correct,
        wrong: r.total - r.correct - (r.blank || 0),
        blank: r.blank || 0,
        minutes: null,
        notes: '',
        sessionId: null,
        simuladoId: sim.id,
        createdAt: sim.createdAt || 0,
      }));
  }

  /** Valida um item do caderno de erros. */
  function validateErrorEntry(input) {
    const errors = {};
    if (!input.subjectId) errors.subjectId = 'Escolha a disciplina.';
    if (!U.isISODate(input.date)) errors.date = 'Informe a data.';
    const kind = input.kind === 'duvida' ? 'duvida' : 'erro';
    const ref = String(input.ref || '').trim();
    const subtopic = String(input.subtopic || '').trim();
    if (!ref && !subtopic && !input.topicId) errors.ref = 'Informe a questão, o assunto ou o subtópico.';
    const status = U.ERROR_STATUS.some((s) => s.id === input.status) ? input.status : 'pendente';
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: {
        subjectId: input.subjectId || null,
        topicId: input.topicId || null,
        subtopic,
        ref,
        kind,
        date: input.date,
        origem: input.origem || 'outra',
        reason: String(input.reason || '').trim(),
        rule: String(input.rule || '').trim(),
        note: String(input.note || '').trim(),
        status,
      },
    };
  }

  /** Registra uma nova tentativa de refazer a questão. Acertar revisa; errar de novo marca como recorrente. */
  function applyAttempt(entry, attempt, makeId) {
    const att = {
      id: makeId ? makeId('att') : U.uid('att'),
      date: attempt.date,
      result: attempt.result === 'acerto' ? 'acerto' : 'erro',
      note: String(attempt.note || '').trim(),
    };
    entry.attempts = [...(entry.attempts || []), att];
    entry.status = att.result === 'erro' ? 'recorrente' : 'revisado';
    entry.updatedAt = attempt.at || entry.updatedAt;
    return entry;
  }

  function validateSubject(input, others) {
    const errors = {};
    const name = String(input.name || '').trim();
    const weightRaw = String(input.weight ?? '').replace(',', '.').trim();
    const weight = weightRaw === '' ? 0 : Number(weightRaw);
    if (name.length < 3) errors.name = 'Informe o nome da disciplina.';
    else if (others.some((s) => U.normalize(s.name) === U.normalize(name) && s.id !== input.id)) {
      errors.name = 'Já existe uma disciplina com este nome.';
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) errors.weight = 'Peso entre 0 e 100.';
    return { ok: Object.keys(errors).length === 0, errors, value: { name, weight } };
  }

  function validateTopic(input) {
    const errors = {};
    const name = String(input.name || '').trim();
    if (!input.subjectId) errors.subjectId = 'Escolha a disciplina.';
    if (name.length < 2) errors.name = 'Informe o nome do assunto.';
    const priority = U.PRIORITIES.some((p) => p.id === input.priority) ? input.priority : 'media';
    const status = U.TOPIC_STATUS.some((s) => s.id === input.status) ? input.status : 'pendente';
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: {
        subjectId: input.subjectId || null,
        name,
        priority,
        status,
        source: String(input.source || '').trim(),
        materialId: input.materialId || null,
        notes: String(input.notes || '').trim(),
      },
    };
  }

  function validateMaterial(input) {
    const errors = {};
    const title = String(input.title || '').trim();
    if (!title) errors.title = 'Informe o título do material.';
    const page = parseCount(input.lastPage);
    if (page.invalid) errors.lastPage = 'Use um número de página.';
    const source = U.MATERIAL_SOURCES.some((s) => s.id === input.source) ? input.source : 'outro';
    const status = U.MATERIAL_STATUS.some((s) => s.id === input.status) ? input.status : 'nao_iniciado';
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: {
        title,
        description: String(input.description || '').trim(),
        source,
        subjectId: input.subjectId || null,
        topicId: input.topicId || null,
        lastPage: page.empty || page.invalid ? null : page.value,
        pendingPages: String(input.pendingPages || '').trim(),
        status,
        notes: String(input.notes || '').trim(),
      },
    };
  }

  function validateGoal(input) {
    const errors = {};
    const t = parseCount(input.target);
    if (t.empty || t.invalid || t.value < 1 || t.value > 500) errors.target = 'Informe um número de acertos entre 1 e 500.';
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: { target: t.value || 0, label: String(input.label || '').trim() },
    };
  }

  return {
    parseCount, parseQuestionList, validateLog, errorsFromLog, logFromValue,
    validateSimulado, buildLogsFromSimulado, validateErrorEntry, applyAttempt,
    validateSubject, validateTopic, validateMaterial, validateGoal,
  };
});
