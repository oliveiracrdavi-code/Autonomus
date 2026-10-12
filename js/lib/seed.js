/* Dados iniciais informados pelo usuário: disciplinas, diagnóstico da OAB 47, ciclo de 30 blocos e metas.
 * Nada aqui é estimado: pesos e resultados vêm do relatório do simulado. */
(function (factory) {
  const lib = factory(typeof require === 'function' ? require('./util') : window.OAB.lib.util);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.seed = lib;
})(function (U) {
  // [chave, nome, peso informado (%), [questões, acertos] do diagnóstico]
  const SUBJECTS = [
    ['etica', 'Ética Profissional e Estatuto da OAB', 9, [7, 5]],
    ['constitucional', 'Direito Constitucional', 9, [7, 4]],
    ['administrativo', 'Direito Administrativo', 6, [5, 1]],
    ['civil', 'Direito Civil', 6, [5, 4]],
    ['pcivil', 'Direito Processual Civil', 8, [6, 4]],
    ['penal', 'Direito Penal', 8, [6, 5]],
    ['ppenal', 'Direito Processual Penal', 8, [6, 5]],
    ['trabalho', 'Direito do Trabalho', 6, [5, 2]],
    ['ptrabalho', 'Direito Processual do Trabalho', 6, [5, 2]],
    ['tributario', 'Direito Tributário', 6, [5, 3]],
    ['empresarial', 'Direito Empresarial', 5, [4, 0]],
    ['ambiental', 'Direito Ambiental', 3, [2, 1]],
    ['consumidor', 'Direito do Consumidor', 3, [2, 1]],
    ['eca', 'Direito da Criança e do Adolescente — ECA', 3, [2, 2]],
    ['eleitoral', 'Direito Eleitoral', 3, [2, 1]],
    ['previdenciario', 'Direito Previdenciário', 3, [2, 1]],
    ['dh', 'Direitos Humanos', 3, [2, 0]],
    ['filosofia', 'Filosofia do Direito', 3, [2, 1]],
    ['afo', 'Administração Financeira e Orçamentária — AFO', 1, [1, 1]],
    ['financeiro', 'Direito Financeiro', 1, [1, 0]],
    ['digital', 'Direito Digital', 1, [1, 1]],
    ['ipublico', 'Direito Internacional Público', 1, [1, 0]],
    ['iprivado', 'Direito Internacional Privado', 1, [1, 1]],
  ];

  // Sequência inicial do ciclo (30 blocos), pelas chaves acima.
  const CYCLE_KEYS = [
    'constitucional', 'etica', 'administrativo', 'pcivil', 'empresarial', 'penal', 'trabalho', 'ppenal',
    'constitucional', 'ptrabalho', 'administrativo', 'civil', 'etica', 'empresarial', 'tributario', 'pcivil',
    'trabalho', 'ppenal', 'constitucional', 'empresarial', 'administrativo', 'ptrabalho', 'penal', 'civil',
    'etica', 'tributario', 'constitucional', 'trabalho', 'empresarial', 'administrativo',
  ];

  const subjectId = (key) => `sub-${key}`;
  const OAB47_ID = 'sim-oab47';

  function seedSubjects() {
    return SUBJECTS.map(([key, name, weight], i) => ({
      id: subjectId(key),
      name,
      weight,
      archived: false,
      order: i,
      createdAt: 0,
    }));
  }

  function seedCycle() {
    return CYCLE_KEYS.map((key, i) => ({ id: `blk-${String(i + 1).padStart(2, '0')}`, subjectId: subjectId(key) }));
  }

  function seedSimulado() {
    return {
      id: OAB47_ID,
      name: 'OAB 47 — diagnóstico (1ª fase)',
      date: '2026-10-12',
      total: 80,
      correct: 45,
      blank: 0,
      minutes: null,
      notes: 'Data provisória: ajuste para a data real do simulado na tela Simulados.',
      breakdown: SUBJECTS.map(([key, , , [total, correct]]) => ({
        subjectId: subjectId(key),
        total,
        correct,
        blank: 0,
      })),
      createdAt: 0,
    };
  }

  function seedGoals() {
    return [
      { id: 'goal-50', target: 50, label: 'Meta 1' },
      { id: 'goal-55', target: 55, label: 'Meta 2' },
      { id: 'goal-60', target: 60, label: 'Meta final (55–60 ou mais)' },
    ];
  }

  function emptyState() {
    return {
      schema: 1,
      subjects: [],
      topics: [],
      cycle: [],
      cursorId: null,
      completedLoops: 0,
      sessions: [],
      activeSessionId: null,
      logs: [],
      errors: [],
      simulados: [],
      goals: [],
      materials: [],
      settings: { plannedTheoryMin: 60, plannedQuestionsMin: 60, examDate: null, dailyGoal: { minutes: 120, questions: 40, reviews: 10 }, provaMin: 300, provaQuestions: 80 },
      cards: [],
      draft: null,
    };
  }

  // Estado inicial completo. `buildLogsFromSimulado` é injetado para evitar dependência circular.
  function initialState(buildLogsFromSimulado) {
    const state = emptyState();
    state.subjects = seedSubjects();
    state.cycle = seedCycle();
    state.cursorId = state.cycle[0].id;
    state.goals = seedGoals();
    const sim = seedSimulado();
    const { breakdown, ...stored } = sim;
    state.simulados = [stored];
    state.logs = buildLogsFromSimulado(sim);
    return state;
  }

  return {
    SUBJECTS, CYCLE_KEYS, OAB47_ID, subjectId,
    seedSubjects, seedCycle, seedSimulado, seedGoals, emptyState, initialState,
    _util: U,
  };
});
