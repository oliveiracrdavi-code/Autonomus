/* Calendário semanal: blocos de estudo por dia, editáveis. Marque o que foi feito em cada semana. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const L = window.OAB.lib;
  const U = L.util;
  const W = L.week;

  let offset = 0; // 0 = esta semana; -1 = semana passada; +1 = próxima

  const subjectName = (id) => {
    const s = store.subjectById(id);
    return s ? s.name : 'Disciplina removida';
  };
  const isActive = (id) => {
    const s = store.subjectById(id);
    return !!s && !s.archived;
  };

  /** "1 h 30 min", "45 min", "0 min". */
  function fmtMin(min) {
    const m = Math.round(min || 0);
    if (m < 60) return `${m} min`;
    const h1 = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h1} h ${rest} min` : `${h1} h`;
  }

  function openBlockForm(existing, defaults) {
    const subjects = store.activeSubjects();
    if (!subjects.length) return ui.toast('Cadastre uma disciplina em Matérias antes de montar o calendário.', 'warn');
    const isEdit = !!existing;
    const v = existing || { weekday: (defaults && defaults.weekday) || 0, subjectId: subjects[0].id, minutes: 60, topic: '' };
    const day = ui.select({ name: 'weekday' }, W.DAYS.map((d, i) => ({ value: String(i), label: d })), String(v.weekday));
    // disciplina arquivada que já está no bloco continua na lista, para não trocar a matéria sem querer
    const options = subjects.slice();
    const current = existing && store.subjectById(existing.subjectId);
    if (current && !subjects.some((s) => s.id === current.id)) options.push(current);
    const subj = ui.select({ name: 'subjectId' }, options.map((s) => ({ value: s.id, label: s.archived ? `${s.name} (arquivada)` : s.name })), v.subjectId);
    const topic = ui.input({ name: 'topic', value: v.topic || '', placeholder: 'Ex.: Tipicidade material', maxlength: '120' });
    const minutes = ui.number({ name: 'minutes', step: '5', min: String(W.MIN_MINUTES), max: String(W.MAX_MINUTES), value: String(v.minutes) });
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Dia', day, { name: 'weekday' }),
      ui.field('Disciplina', subj, { name: 'subjectId' }),
      ui.field('Assunto (opcional)', topic, { name: 'topic', full: true }),
      ui.field('Minutos', minutes, { name: 'minutes', hint: `De ${W.MIN_MINUTES} a ${W.MAX_MINUTES} minutos.` }));

    function save() {
      const r = W.validateBlock(ui.readForm(form), store.getState().subjects);
      if (!r.ok) return ui.showErrors(form, r.errors);
      if (isEdit) store.updateWeekBlock(existing.id, r.value);
      else store.addWeekBlock(r.value);
      ui.closeModal();
      ui.toast(isEdit ? 'Bloco atualizado.' : 'Bloco adicionado.', 'ok');
    }

    const footer = [
      isEdit ? h('button', { class: 'btn ghost danger', type: 'button', onclick: () => {
        store.deleteWeekBlock(existing.id);
        ui.closeModal();
        ui.toast('Bloco removido.', 'ok');
      } }, ui.icon('trash'), 'Excluir') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salvar'),
    ].filter(Boolean);
    ui.modal({ title: isEdit ? 'Editar bloco' : 'Novo bloco de estudo', content: form, footer });
  }

  function blockItem(b, weekStart) {
    return h('li', { class: `week-block ${b.done ? 'is-done' : ''}` },
      h('label', { class: 'week-check' },
        h('input', { type: 'checkbox', checked: b.done || null, onchange: () => store.toggleWeekDone(weekStart, b.id) }),
        h('span', null,
          h('strong', null, b.subjectName),
          b.topic ? h('span', { class: 'tiny muted' }, ` · ${b.topic}`) : null,
          b.archived ? h('span', { class: 'tiny muted' }, ' (arquivada)') : null)),
      h('div', { class: 'week-block-meta' },
        h('span', { class: 'tiny muted' }, `${b.minutes} min`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar bloco de ${b.subjectName}`, onclick: () => openBlockForm(b) }, ui.icon('edit'))));
  }

  function dayColumn(day, weekStart, today) {
    return h('section', { class: `week-day ${day.date === today ? 'is-today' : ''}`, 'aria-label': W.DAYS[day.index] },
      h('header', { class: 'week-day-head' },
        h('div', null, h('strong', null, W.DAYS[day.index]), h('span', { class: 'tiny muted' }, ` ${U.fmtDayMonth(day.date)}`)),
        h('span', { class: 'tiny muted' }, day.plannedMin ? fmtMin(day.plannedMin) : '')),
      day.blocks.length
        ? h('ul', { class: 'week-block-list' }, day.blocks.map((b) => blockItem(b, weekStart)))
        : h('p', { class: 'tiny muted week-empty' }, 'Sem blocos'),
      h('button', { class: 'btn ghost sm week-add', type: 'button', onclick: () => openBlockForm(null, { weekday: day.index }) }, ui.icon('plus'), 'Bloco'));
  }

  function view() {
    const state = store.getState();
    const today = U.todayISO();
    const weekStart = W.weekKey(U.addDays(today, offset * 7));
    const weekEnd = U.addDays(weekStart, 6);
    const days = W.weekTotals(state.week, weekStart, subjectName, isActive);
    const planned = days.reduce((n, d) => n + d.plannedMin, 0);
    const doneMin = days.reduce((n, d) => n + d.doneMin, 0);
    const pct = planned ? Math.round((doneMin / planned) * 100) : 0;
    const questions = state.logs.filter((l) => l.date >= weekStart && l.date <= weekEnd).reduce((n, l) => n + l.total, 0);
    const noSubjects = store.activeSubjects().length === 0;

    const toolbar = h('div', { class: 'week-toolbar' },
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { offset -= 1; window.OAB.app.refresh(); } }, '‹ Anterior'),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { offset = 0; window.OAB.app.refresh(); }, disabled: offset === 0 || null }, 'Esta semana'),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { offset += 1; window.OAB.app.refresh(); } }, 'Próxima ›')),
      h('p', { class: 'week-range' }, `${U.fmtDate(weekStart)} a ${U.fmtDate(weekEnd)}`),
      h('button', { class: 'btn primary sm', type: 'button', onclick: () => window.OAB.forms.log(null, { mode: 'bloco' }) }, ui.icon('list'), 'Registrar questões'));

    return h('div', { class: 'page week-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Estudo'),
          h('h1', { class: 'display-sm' }, 'Calendário semanal'),
          h('p', { class: 'muted' }, 'Monte sua semana por dia. Os blocos se repetem toda semana e você pode mudar quando quiser.'))),
      toolbar,
      h('div', { class: 'grid-3' },
        ui.stat('Planejado', fmtMin(planned), 'na semana selecionada'),
        ui.stat('Feito', fmtMin(doneMin), `${pct}% do planejado`, pct >= 100 ? 'ok' : undefined),
        ui.stat('Questões na semana', U.fmtInt(questions), 'registradas no período')),
      noSubjects ? h('div', { class: 'notice warn' }, h('strong', null, 'Sem disciplinas ativas'), h('p', { class: 'small' }, 'Reative ou cadastre disciplinas em Matérias para adicionar blocos. Os blocos já criados continuam aqui.')) : null,
      h('div', { class: 'week-grid' }, days.map((d) => dayColumn(d, weekStart, today))));
  }

  window.OAB.views.semana = view;
})();
