/* Estado da aplicação: carregamento, persistência (localStorage), backup e ações de domínio.
 * Os PDFs ficam no IndexedDB do próprio navegador e nunca são enviados para lugar nenhum. */
(function () {
  const L = window.OAB.lib;
  const U = L.util;
  const C = L.cycle;
  const S = L.session;
  const R = L.records;
  const Rv = L.review;
  const F = L.flashcards;
  const P = L.prova;

  const KEY = 'oab-estudos:v1';
  const KEY_BACKUP = 'oab-estudos:v1:corrompido';

  let state = null;
  let persistent = true;
  let loadNotice = null;
  const listeners = new Set();

  const makeIdFor = (prefix) => U.uid(prefix);

  function buildSeedState() {
    return L.seed.initialState((sim) => R.buildLogsFromSimulado(sim, makeIdFor));
  }

  function loadFromStorage() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      persistent = false;
      loadNotice = 'Não foi possível acessar o armazenamento deste navegador. Os dados valem só nesta aba até você exportar um backup.';
      return buildSeedState();
    }
    if (!raw) return buildSeedState();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== 1) throw new Error('Versão de dados desconhecida');
      return normalize(parsed);
    } catch (e) {
      // Não sobrescreve dados ilegíveis: guarda uma cópia antes de começar do zero.
      try {
        localStorage.setItem(KEY_BACKUP, raw);
      } catch (_) { /* ignora */ }
      loadNotice = 'Os dados salvos estavam ilegíveis. Uma cópia foi guardada em "oab-estudos:v1:corrompido" e o app começou com os dados iniciais.';
      return buildSeedState();
    }
  }

  /** Completa campos que possam faltar em dados antigos. */
  function normalize(s) {
    const base = L.seed.emptyState();
    const out = { ...base, ...s };
    out.settings = { ...base.settings, ...(s.settings || {}) };
    out.settings.dailyGoal = { ...base.settings.dailyGoal, ...((s.settings || {}).dailyGoal || {}) };
    if (!Array.isArray(out.cards)) out.cards = [];
    if (out.draft === undefined) out.draft = null;
    for (const k of ['subjects', 'topics', 'cycle', 'sessions', 'logs', 'errors', 'simulados', 'goals', 'materials']) {
      if (!Array.isArray(out[k])) out[k] = [];
    }
    out.cursorId = C.sanitizeCursor(out.cycle, out.cursorId);
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      persistent = true;
    } catch (e) {
      persistent = false;
    }
    return persistent;
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  /** Aplica uma alteração ao estado, salva e avisa as telas. */
  function update(fn) {
    const result = fn(state);
    save();
    emit();
    return result;
  }

  /* ---------- seletores ---------- */
  const getState = () => state;
  const subjectById = (id) => state.subjects.find((s) => s.id === id) || null;
  const subjectName = (id) => (subjectById(id) ? subjectById(id).name : id ? 'Matéria removida' : 'Sem matéria');
  const activeSubjects = () =>
    state.subjects.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  const sortedSubjects = () => state.subjects.slice().sort((a, b) => a.order - b.order);
  const topicById = (id) => state.topics.find((t) => t.id === id) || null;
  const topicsOf = (subjectId) =>
    state.topics
      .filter((t) => t.subjectId === subjectId)
      .sort((a, b) => U.PRIORITIES.find((p) => p.id === a.priority).order - U.PRIORITIES.find((p) => p.id === b.priority).order || a.createdAt - b.createdAt);
  const topicLabel = (id) => (topicById(id) ? topicById(id).name : '');
  const materialById = (id) => state.materials.find((m) => m.id === id) || null;
  const cursorBlock = () => state.cycle.find((b) => b.id === state.cursorId) || null;
  const blockPosition = (blockId) => state.cycle.findIndex((b) => b.id === blockId) + 1;
  const activeSession = () => state.sessions.find((s) => s.id === state.activeSessionId) || null;
  const sessionElapsed = (s, now) => S.elapsed(s, now == null ? Date.now() : now);
  const openErrorsCount = () => state.errors.filter((e) => e.status !== 'revisado').length;

  /** Próximo assunto pendente: prioridade alta primeiro, pendentes antes de "em estudo". */
  function suggestedTopic(subjectId) {
    const list = topicsOf(subjectId).filter((t) => t.status !== 'estudado');
    const rank = (t) => (t.status === 'pendente' ? 0 : 1);
    return list.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
  }

  /** Assunto estudado mais recentemente dentro da matéria. */
  function lastStudiedTopic(subjectId) {
    return topicsOf(subjectId)
      .filter((t) => t.lastStudiedAt)
      .sort((a, b) => b.lastStudiedAt - a.lastStudiedAt)[0] || null;
  }

  function materialsForBlock(blockId) {
    return state.materials.filter((m) => (m.blockIds || []).includes(blockId));
  }

  /* ---------- arquivos (PDF) no IndexedDB ---------- */
  const files = (() => {
    let dbp = null;
    const open = () => {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
          const req = indexedDB.open('oab-estudos-arquivos', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('pdfs');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbp;
    };
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', mode);
        const req = fn(tx.objectStore('pdfs'));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    };
    return {
      put: (key, blob) => run('readwrite', (store) => store.put(blob, key)),
      get: (key) => run('readonly', (store) => store.get(key)),
      remove: (key) => run('readwrite', (store) => store.delete(key)),
    };
  })();

  /* ---------- ações: questões e caderno ---------- */
  function addLog(value) {
    return update(() => {
      const now = Date.now();
      const log = R.logFromValue(value, makeIdFor, now);
      state.logs.push(log);
      const entries = R.errorsFromLog(value, log, makeIdFor);
      entries.forEach((e) => state.errors.push(e));
      return { log, entries };
    });
  }

  function updateLog(id, value) {
    return update(() => {
      const log = state.logs.find((l) => l.id === id);
      if (!log) return null;
      Object.assign(log, {
        mode: value.mode,
        date: value.date,
        subjectId: value.subjectId,
        topicId: value.topicId,
        subtopic: value.subtopic,
        banca: value.banca,
        prova: value.prova,
        origem: value.origem,
        total: value.total,
        correct: value.correct,
        wrong: value.wrong,
        blank: value.blank,
        minutes: value.minutes,
        notes: value.notes,
      });
      return log;
    });
  }

  function deleteLog(id) {
    return update(() => {
      state.logs = state.logs.filter((l) => l.id !== id);
    });
  }

  function addError(value) {
    return update(() => {
      const now = Date.now();
      const entry = {
        id: makeIdFor('err'),
        ...value,
        logId: null,
        sessionId: state.activeSessionId || null,
        attempts: [],
        createdAt: now,
        updatedAt: now,
      };
      state.errors.push(entry);
      return entry;
    });
  }

  function updateError(id, value) {
    return update(() => {
      const e = state.errors.find((x) => x.id === id);
      if (!e) return null;
      Object.assign(e, value, { updatedAt: Date.now() });
      return e;
    });
  }

  function deleteError(id) {
    return update(() => {
      state.errors = state.errors.filter((e) => e.id !== id);
    });
  }

  function setErrorStatus(id, status) {
    return update(() => {
      const e = state.errors.find((x) => x.id === id);
      if (e) {
        e.status = status;
        e.updatedAt = Date.now();
      }
      return e;
    });
  }

  function addAttempt(id, attempt) {
    return update(() => {
      const e = state.errors.find((x) => x.id === id);
      if (!e) return null;
      R.applyAttempt(e, { ...attempt, at: Date.now() }, makeIdFor);
      return e;
    });
  }

  /* ---------- ações: simulados e metas ---------- */
  function addSimulado(value) {
    return update(() => {
      const now = Date.now();
      const sim = { id: makeIdFor('sim'), name: value.name, date: value.date, total: value.total, correct: value.correct, blank: value.blank, minutes: value.minutes, notes: value.notes, createdAt: now };
      state.simulados.push(sim);
      const logs = R.buildLogsFromSimulado({ ...sim, breakdown: value.breakdown }, makeIdFor);
      state.logs.push(...logs);
      return sim;
    });
  }

  function updateSimulado(id, value) {
    return update(() => {
      const sim = state.simulados.find((s) => s.id === id);
      if (!sim) return null;
      Object.assign(sim, { name: value.name, date: value.date, total: value.total, correct: value.correct, blank: value.blank, minutes: value.minutes, notes: value.notes });
      state.logs = state.logs.filter((l) => l.simuladoId !== id);
      state.logs.push(...R.buildLogsFromSimulado({ ...sim, breakdown: value.breakdown }, makeIdFor));
      return sim;
    });
  }

  function deleteSimulado(id) {
    return update(() => {
      state.simulados = state.simulados.filter((s) => s.id !== id);
      state.logs = state.logs.filter((l) => l.simuladoId !== id);
    });
  }

  /** Divisão por disciplina de um simulado, reconstruída a partir dos registros. */
  function simuladoBreakdown(simId) {
    return state.logs
      .filter((l) => l.simuladoId === simId)
      .map((l) => ({ subjectId: l.subjectId, total: l.total, correct: l.correct, blank: l.blank, wrong: l.wrong }));
  }

  function setGoals(goals) {
    return update(() => {
      state.goals = goals;
    });
  }

  /* ---------- ações: disciplinas e assuntos ---------- */
  function addSubject(value) {
    return update(() => {
      const order = state.subjects.reduce((m, s) => Math.max(m, s.order), -1) + 1;
      const s = { id: makeIdFor('sub'), name: value.name, weight: value.weight, archived: false, order, createdAt: Date.now() };
      state.subjects.push(s);
      return s;
    });
  }

  function updateSubject(id, value) {
    return update(() => {
      const s = subjectById(id);
      if (s) Object.assign(s, value);
      return s;
    });
  }

  function setSubjectArchived(id, archived) {
    return update(() => {
      const s = subjectById(id);
      if (s) s.archived = archived;
      return s;
    });
  }

  /** Exclusão só é permitida quando a matéria não tem registros; caso contrário, arquive. */
  function deleteSubject(id) {
    const used = state.logs.some((l) => l.subjectId === id) || state.errors.some((e) => e.subjectId === id) ||
      state.sessions.some((s) => s.subjectId === id) || state.materials.some((m) => m.subjectId === id);
    if (used) return { ok: false, reason: 'Esta disciplina já tem registros. Arquive-a em vez de excluir.' };
    update(() => {
      state.subjects = state.subjects.filter((s) => s.id !== id);
      state.topics = state.topics.filter((t) => t.subjectId !== id);
      state.cycle = state.cycle.filter((b) => b.subjectId !== id);
      state.cursorId = C.sanitizeCursor(state.cycle, state.cursorId);
    });
    return { ok: true };
  }

  function addTopic(value) {
    return update(() => {
      const t = { id: makeIdFor('top'), ...value, lastStudiedAt: null, createdAt: Date.now() };
      state.topics.push(t);
      return t;
    });
  }

  function updateTopic(id, value) {
    return update(() => {
      const t = topicById(id);
      if (t) Object.assign(t, value);
      return t;
    });
  }

  function deleteTopic(id) {
    return update(() => {
      state.topics = state.topics.filter((t) => t.id !== id);
      state.logs.forEach((l) => { if (l.topicId === id) l.topicId = null; });
      state.errors.forEach((e) => { if (e.topicId === id) e.topicId = null; });
      state.sessions.forEach((s) => { if (s.topicId === id) s.topicId = null; });
    });
  }

  function setTopicStatus(id, status) {
    return update(() => {
      const t = topicById(id);
      if (t) t.status = status;
      return t;
    });
  }

  /* ---------- ações: materiais ---------- */
  /** Cria um material. Se houver arquivo, ele é guardado no IndexedDB com a mesma chave do material. */
  async function addMaterial(value, file) {
    const id = makeIdFor('mat');
    const meta = file
      ? { fileName: file.name, fileSize: file.size, fileType: file.type || 'application/pdf', hasFile: true }
      : { fileName: '', fileSize: 0, fileType: '', hasFile: false };
    if (file) await files.put(id, file);
    return update(() => {
      const m = { id, ...value, ...meta, blockIds: [], createdAt: Date.now(), updatedAt: Date.now() };
      state.materials.push(m);
      return m;
    });
  }

  function updateMaterial(id, value) {
    return update(() => {
      const m = materialById(id);
      if (m) Object.assign(m, value, { updatedAt: Date.now() });
      return m;
    });
  }

  async function deleteMaterial(id) {
    try {
      await files.remove(id);
    } catch (e) { /* arquivo já ausente */ }
    return update(() => {
      state.materials = state.materials.filter((m) => m.id !== id);
      state.sessions.forEach((s) => { s.materialIds = (s.materialIds || []).filter((x) => x !== id); });
    });
  }

  function toggleMaterialOnBlock(materialId, blockId) {
    return update(() => {
      const m = materialById(materialId);
      if (!m) return null;
      m.blockIds = m.blockIds || [];
      const i = m.blockIds.indexOf(blockId);
      if (i >= 0) m.blockIds.splice(i, 1);
      else m.blockIds.push(blockId);
      return m;
    });
  }

  async function getMaterialFile(id) {
    return files.get(id);
  }

  /* ---------- ações: ciclo ---------- */
  function cycleAdd(subjectId, afterId) {
    return update(() => {
      const r = C.addBlock(state.cycle, subjectId, () => makeIdFor('blk'), afterId);
      state.cycle = r.cycle;
      state.cursorId = C.sanitizeCursor(state.cycle, state.cursorId);
      return r.block;
    });
  }

  function cycleDuplicate(blockId) {
    return update(() => {
      const r = C.duplicateBlock(state.cycle, blockId, () => makeIdFor('blk'));
      state.cycle = r.cycle;
      return r.block;
    });
  }

  function cycleRemove(blockId) {
    return update(() => {
      const r = C.removeBlock(state.cycle, state.cursorId, blockId);
      state.cycle = r.cycle;
      state.cursorId = r.cursorId;
    });
  }

  function cycleMove(blockId, toIndex) {
    return update(() => {
      state.cycle = C.moveBlock(state.cycle, blockId, toIndex);
    });
  }

  function cycleSetSubject(blockId, subjectId) {
    return update(() => {
      state.cycle = C.setBlockSubject(state.cycle, blockId, subjectId);
    });
  }

  function cycleSetCount(subjectId, target) {
    return update(() => {
      const r = C.setSubjectCount(state.cycle, state.cursorId, subjectId, target, () => makeIdFor('blk'));
      state.cycle = r.cycle;
      state.cursorId = r.cursorId;
      return r;
    });
  }

  function cycleSetCursor(blockId) {
    return update(() => {
      if (state.cycle.some((b) => b.id === blockId)) state.cursorId = blockId;
    });
  }

  function cycleRestoreDefault() {
    return update(() => {
      state.cycle = L.seed.seedCycle();
      state.cursorId = state.cycle[0].id;
    });
  }

  /* ---------- ações: sessão de estudo ---------- */
  function startSession(topicId) {
    if (state.activeSessionId) return activeSession();
    const block = cursorBlock();
    if (!block) return null;
    return update(() => {
      const now = Date.now();
      const sess = S.createSession({
        id: makeIdFor('ses'),
        block,
        subjectId: block.subjectId,
        topicId: topicId || null,
        now,
        plannedMin: { teoria: state.settings.plannedTheoryMin, questoes: state.settings.plannedQuestionsMin },
      });
      state.sessions.push(sess);
      state.activeSessionId = sess.id;
      const t = topicById(topicId);
      if (t && t.status === 'pendente') t.status = 'estudando';
      return sess;
    });
  }

  function withActive(fn) {
    return update(() => {
      const s = activeSession();
      if (!s) return null;
      return fn(s, Date.now());
    });
  }

  const pauseSession = () => withActive((s, now) => S.pause(s, now));
  const resumeSession = () => withActive((s, now) => S.resume(s, now));
  const switchSessionPhase = (phase) => withActive((s, now) => S.switchPhase(s, phase, now));
  const setSessionTopic = (topicId) => withActive((s) => {
    s.topicId = topicId || null;
    const t = topicById(topicId);
    if (t && t.status === 'pendente') t.status = 'estudando';
    return s;
  });
  const setSessionMaterials = (ids) => withActive((s) => {
    s.materialIds = ids.slice();
    return s;
  });
  const setSessionNotes = (notes) => withActive((s) => {
    s.notes = notes;
    return s;
  });

  /** Atualiza o "último sinal" da sessão sem re-renderizar a tela. */
  function heartbeat() {
    const s = activeSession();
    if (s && s.runningSince != null) S.heartbeat(s, Date.now());
    if (state.draft && state.draft.runningSince != null) state.draft.lastSeen = Date.now();
    if ((s && s.runningSince != null) || (state.draft && state.draft.runningSince != null)) save();
  }

  /**
   * Conclui a sessão e avança o ciclo para o bloco seguinte. Itens do checklist não marcados
   * viram pendências registradas no histórico, sem impedir a conclusão.
   */
  function finishSession({ checklist, topicId, notes, markTopicStudied }) {
    return update(() => {
      const s = activeSession();
      if (!s) return null;
      const now = Date.now();
      S.finish(s, { now, checklist, topicId, notes });
      const t = topicById(s.topicId);
      if (t) {
        t.lastStudiedAt = now;
        if (markTopicStudied) t.status = 'estudado';
        else if (t.status === 'pendente') t.status = 'estudando';
      }
      const idx = state.cycle.findIndex((b) => b.id === s.blockId);
      if (idx >= 0) {
        state.cursorId = C.successorId(state.cycle, s.blockId);
        if (idx === state.cycle.length - 1) state.completedLoops += 1;
      }
      state.activeSessionId = null;
      return s;
    });
  }

  /** Descarta a sessão em andamento sem avançar o ciclo. */
  function discardSession() {
    return update(() => {
      const s = activeSession();
      if (s) state.sessions = state.sessions.filter((x) => x.id !== s.id);
      state.activeSessionId = null;
    });
  }

  /* ---------- flashcards (repetição espaçada) ---------- */
  /** Registra a resposta de um cartão (lembrei / esqueci) e agenda a próxima revisão. */
  function answerCard(errorId, correct) {
    return update(() => {
      const today = U.todayISO();
      const current = F.cardState(errorId, state.cards, today);
      const next = F.answer(current, correct, today);
      const i = state.cards.findIndex((c) => c.errorId === errorId);
      if (i >= 0) state.cards[i] = next;
      else state.cards.push(next);
      return next;
    });
  }

  /* ---------- modo prova (simulado cronometrado) ---------- */
  function startDraft({ name, total, limitMin }) {
    if (state.draft) return state.draft;
    return update(() => {
      state.draft = P.createDraft({ id: makeIdFor('prova'), name, total, limitMin, now: Date.now() });
      return state.draft;
    });
  }

  function setDraftMark(n, mark) {
    return update(() => {
      if (!state.draft) return null;
      if (mark) state.draft.answers[n] = mark;
      else delete state.draft.answers[n];
      state.draft.lastSeen = Date.now();
      return state.draft;
    });
  }

  /** Marcação de uma questão sem redesenhar a tela (mantém o foco do teclado). */
  function setDraftMarkQuiet(n, mark) {
    const d = state.draft;
    if (!d) return null;
    if (mark) d.answers[n] = mark;
    else delete d.answers[n];
    d.lastSeen = Date.now();
    save();
    return d;
  }

  function setDraftAnswers(answers) {
    return update(() => {
      if (!state.draft) return null;
      state.draft.answers = { ...state.draft.answers, ...answers };
      return state.draft;
    });
  }

  function toggleDraftRunning() {
    return update(() => {
      const d = state.draft;
      if (!d) return null;
      const now = Date.now();
      if (d.runningSince != null) P.pause(d, now);
      else P.resume(d, now);
      d.lastSeen = now;
      return d;
    });
  }

  function discardDraft() {
    return update(() => {
      state.draft = null;
    });
  }

  /** Conclui a prova: cria o simulado (com brancos = em branco + não marcadas) e limpa o rascunho. */
  function finishDraft() {
    return update(() => {
      const d = state.draft;
      if (!d) return null;
      const now = Date.now();
      P.pause(d, now);
      const t = P.totals(d.answers, d.total);
      const minutes = Math.round(P.elapsed(d, now) / 60000);
      const sim = {
        id: makeIdFor('sim'),
        name: d.name,
        date: U.todayISO(),
        total: d.total,
        correct: t.correct,
        blank: t.blankFinal,
        minutes,
        notes: `Modo prova cronometrado · limite ${d.limitMin} min${minutes > d.limitMin ? ' (tempo excedido)' : ''}`,
        createdAt: now,
      };
      state.simulados.push(sim);
      state.logs.push(...R.buildLogsFromSimulado({ ...sim, breakdown: [] }, makeIdFor));
      state.draft = null;
      return { sim, totals: t, minutes };
    });
  }

  /* ---------- configurações, backup e reset ---------- */
  function setSettings(partial) {
    return update(() => {
      state.settings = { ...state.settings, ...partial };
    });
  }

  function exportBackup() {
    return JSON.stringify({ app: 'oab-estudos', exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  /** Importa um backup. Substitui os dados atuais após validação. */
  function importBackup(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'O arquivo não é um JSON válido.' };
    }
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || data.schema !== 1 || !Array.isArray(data.subjects) || !Array.isArray(data.logs)) {
      return { ok: false, reason: 'Arquivo de backup não reconhecido.' };
    }
    state = normalize(data);
    save();
    emit();
    return { ok: true };
  }

  function resetToSeed() {
    state = buildSeedState();
    save();
    emit();
  }

  /** Limpa os dados de registro (matérias e ciclo são mantidos), para recomeçar a contagem. */
  function clearRecords() {
    return update(() => {
      state.logs = [];
      state.errors = [];
      state.simulados = [];
      state.sessions = [];
      state.activeSessionId = null;
      state.completedLoops = 0;
    });
  }

  /* ---------- inicialização ---------- */
  function init() {
    state = loadFromStorage();
    // Sessão que estava rodando quando o app foi fechado passa para "pausada", contando até a última atividade.
    const s = activeSession();
    if (s) {
      S.recoverAfterReload(s);
      save();
    }
    if (state.draft && state.draft.runningSince != null) {
      P.recover(state.draft, state.draft.lastSeen);
      save();
    }
    window.addEventListener('pagehide', () => heartbeat());
    setInterval(heartbeat, 15000);
  }

  window.OAB.store = {
    init, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    getState, isPersistent: () => persistent, loadNotice: () => loadNotice,
    subjectById, subjectName, activeSubjects, sortedSubjects, topicById, topicsOf, topicLabel,
    materialById, cursorBlock, blockPosition, activeSession, sessionElapsed, openErrorsCount,
    suggestedTopic, lastStudiedTopic, materialsForBlock, simuladoBreakdown,
    addLog, updateLog, deleteLog, addError, updateError, deleteError, setErrorStatus, addAttempt,
    addSimulado, updateSimulado, deleteSimulado, setGoals,
    addSubject, updateSubject, setSubjectArchived, deleteSubject,
    addTopic, updateTopic, deleteTopic, setTopicStatus,
    addMaterial, updateMaterial, deleteMaterial, toggleMaterialOnBlock, getMaterialFile,
    cycleAdd, cycleDuplicate, cycleRemove, cycleMove, cycleSetSubject, cycleSetCount, cycleSetCursor, cycleRestoreDefault,
    startSession, pauseSession, resumeSession, switchSessionPhase, setSessionTopic, setSessionMaterials, setSessionNotes,
    finishSession, discardSession, heartbeat,
    answerCard, startDraft, setDraftMark, setDraftMarkQuiet, setDraftAnswers, toggleDraftRunning, discardDraft, finishDraft,
    setSettings, exportBackup, importBackup, resetToSeed, clearRecords,
    update, save,
  };
})();
