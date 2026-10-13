/* Tela inicial: o que estudar agora, os blocos de hoje e o resumo da semana. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const L = window.OAB.lib;
  const U = L.util;
  const W = L.week;

  const subjectName = (id) => {
    const s = store.subjectById(id);
    return s ? s.name : 'Disciplina removida';
  };
  const isActive = (id) => {
    const s = store.subjectById(id);
    return !!s && !s.archived;
  };
  const topicOf = (id) => {
    const t = store.suggestedTopic(id);
    return t ? t.name : null;
  };

  function suggestionCard(sug) {
    const actions = h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => window.OAB.forms.log(null, { mode: 'bloco' }) }, ui.icon('list'), 'Registrar questões'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => window.OAB.app.go('semana') }, 'Abrir calendário'));
    return ui.card('O que estudar agora',
      h('div', { class: 'stack' },
        h('h2', { class: 'display-xs' }, sug.title),
        h('p', { class: 'muted' }, sug.text)),
      { actions });
  }

  function todayCard(plan, weekStart) {
    const body = plan.blocks.length
      ? h('ul', { class: 'week-block-list' }, plan.blocks.map((b) => h('li', { class: `week-block ${b.done ? 'is-done' : ''}` },
        h('label', { class: 'week-check' },
          h('input', { type: 'checkbox', checked: b.done || null, onchange: () => store.toggleWeekDone(weekStart, b.id) }),
          h('span', null, h('strong', null, b.subjectName), b.topic ? h('span', { class: 'tiny muted' }, ` · ${b.topic}`) : null)),
        h('span', { class: 'tiny muted' }, `${b.minutes} min${b.archived ? ' · arquivada' : ''}`))))
      : ui.empty('Nada marcado para hoje', 'Monte os blocos da semana no calendário.',
        h('button', { class: 'btn ghost', type: 'button', onclick: () => window.OAB.app.go('semana') }, 'Ir para o calendário'));
    return ui.card(`Blocos de ${plan.dayName.toLowerCase()}`, body);
  }

  function weekCard(days, today) {
    const rows = days.map((d) => {
      const pct = d.plannedMin ? Math.min(100, Math.round((d.doneMin / d.plannedMin) * 100)) : 0;
      return h('div', { class: `hoje-row ${d.date === today ? 'is-today' : ''}` },
        h('span', { class: 'hoje-label' }, d.label),
        d.plannedMin ? ui.progressBar(pct, pct >= 100 ? 'ok' : 'primary') : h('span', { class: 'tiny muted' }, 'sem blocos'),
        h('span', { class: 'tiny muted' }, `${Math.round(d.doneMin)} / ${Math.round(d.plannedMin)} min`));
    });
    return ui.card('Esta semana', h('div', { class: 'stack' }, rows));
  }

  function view() {
    const state = store.getState();
    const today = U.todayISO();
    const weekStart = W.weekKey(today);
    const weekEnd = U.addDays(weekStart, 6);
    const plan = W.dayPlan(state.week, today, subjectName, isActive);
    const days = W.weekTotals(state.week, weekStart, subjectName, isActive);
    const priorities = window.OAB.lib.analytics.priorities(state);
    const sug = W.suggestion(state.week, today, subjectName, priorities, topicOf, isActive);
    const totals = window.OAB.lib.stats.totals(state.logs);
    const questionsWeek = state.logs.filter((l) => l.date >= weekStart && l.date <= weekEnd).reduce((n, l) => n + l.total, 0);

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, `${W.DAYS[plan.index]}, ${U.fmtDayMonth(today)}`),
          h('h1', { class: 'display-sm' }, 'Hoje'),
          h('p', { class: 'muted' }, 'O que estudar agora, os blocos de hoje e o registro das questões.'))),
      h('div', { class: 'grid-2' }, suggestionCard(sug), todayCard(plan, weekStart)),
      h('div', { class: 'grid-3' },
        ui.stat('Questões na semana', U.fmtInt(questionsWeek), 'registradas'),
        ui.stat('Aproveitamento geral', U.fmtPct(totals.pct), `${U.fmtInt(totals.total)} questões no total`),
        ui.stat('Caderno em aberto', U.fmtInt(store.openErrorsCount()), 'itens para revisar')),
      weekCard(days, today));
  }

  window.OAB.views.hoje = view;
})();
