/* Histórico de sessões: tudo o que foi estudado, com tempos reais, pendências e anotações. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;

  const filters = { subjectId: '', status: '' };

  const statusPill = (s) => {
    if (s.status === 'concluida') return ui.pill('Concluída', 'ok');
    if (s.status === 'ativa') return ui.pill('Em andamento', 'warn');
    return ui.pill('Pausada', 'warn');
  };

  function sessionCard(x, s) {
    const e = store.sessionElapsed(x);
    const block = s.cycle.findIndex((b) => b.id === x.blockId);
    const pm = x.plannedMin || {};
    const planned = { teoria: Number(pm.teoria) || 60, questoes: Number(pm.questoes) || 60 };
    const isOpen = x.status !== 'concluida';
    return h('article', { class: 'session-item' },
      h('header', { class: 'error-head' },
        h('div', null,
          h('p', { class: 'small muted' }, `${U.fmtDateTime(x.startedAt)}${x.endedAt ? ` → ${U.fmtDateTime(x.endedAt)}` : ''}`),
          h('h3', null, store.subjectName(x.subjectId)),
          h('p', { class: 'small muted' }, [block >= 0 ? `Bloco ${block + 1}` : 'Bloco removido', x.topicId ? store.topicLabel(x.topicId) : 'sem assunto'].join(' · '))),
        h('div', { class: 'pill-row' }, statusPill(x))),
      h('div', { class: 'session-times' },
        h('div', null, h('span', { class: 'muted small' }, 'Teoria'), h('strong', null, U.fmtMinutes(e.teoria)), h('span', { class: 'tiny muted' }, `previsto ${planned.teoria} min`)),
        h('div', null, h('span', { class: 'muted small' }, 'Questões'), h('strong', null, U.fmtMinutes(e.questoes)), h('span', { class: 'tiny muted' }, `previsto ${planned.questoes} min`)),
        h('div', null, h('span', { class: 'muted small' }, 'Total'), h('strong', null, U.fmtMinutes(e.total)))),
      x.pendencias && x.pendencias.length ? h('p', { class: 'small' }, h('strong', null, 'Pendências: '), x.pendencias.join(' · ')) : (x.status === 'concluida' ? h('p', { class: 'small ok-text' }, 'Checklist completo.') : null),
      x.notes ? h('p', { class: 'small muted' }, x.notes) : null,
      isOpen ? h('footer', { class: 'error-actions' },
        h('a', { class: 'btn sm primary', href: '#/sessao' }, x.status === 'ativa' ? 'Ir para a sessão' : 'Retomar')) : null);
  }

  function view() {
    const s = store.getState();
    const now = Date.now();
    const sum = stats.sessionSummary(s.sessions, (x) => store.sessionElapsed(x, now));
    const list = s.sessions
      .filter((x) => !filters.subjectId || x.subjectId === filters.subjectId)
      .filter((x) => !filters.status || (filters.status === 'concluida' ? x.status === 'concluida' : x.status !== 'concluida'))
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const avg = sum.concluded ? sum.totalMs / sum.concluded : 0;

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Estudo'),
          h('h1', { class: 'display-sm' }, 'Histórico de sessões'),
          h('p', { class: 'muted' }, 'Tempo real de cada sessão. Sessões pausadas contam até o último registro, sem duplicar horas.'))),
      h('div', { class: 'kpis' },
        ui.stat('Horas no total', U.fmtHours(sum.totalMs), `${sum.count} sessão(ões)`),
        ui.stat('Concluídas', U.fmtInt(sum.concluded), 'Ciclo avançou em cada uma'),
        ui.stat('Média por sessão', U.fmtMinutes(avg), 'Só sessões concluídas'),
        ui.stat('Teoria × questões', `${U.fmtHours(sum.teoriaMs)} · ${U.fmtHours(sum.questoesMs)}`, 'Tempo por fase')),
      h('div', { class: 'toolbar' },
        ui.select({ 'aria-label': 'Filtrar por disciplina', onchange: (e) => { filters.subjectId = e.target.value; window.OAB.app.refresh(); } },
          [{ value: '', label: 'Todas as disciplinas' }, ...store.sortedSubjects().map((x) => ({ value: x.id, label: x.name }))], filters.subjectId),
        ui.select({ 'aria-label': 'Filtrar por status', onchange: (e) => { filters.status = e.target.value; window.OAB.app.refresh(); } },
          [{ value: '', label: 'Todas' }, { value: 'concluida', label: 'Concluídas' }, { value: 'aberta', label: 'Em andamento ou pausadas' }], filters.status)),
      list.length ? h('div', { class: 'stack-lg' }, list.map((x) => sessionCard(x, s)))
        : ui.empty('Nenhuma sessão ainda', 'Quando você iniciar a primeira sessão, o histórico aparece aqui.',
          h('a', { class: 'btn primary', href: '#/sessao' }, 'Iniciar sessão')));
  }

  window.OAB.views.sessoes = view;
})();
