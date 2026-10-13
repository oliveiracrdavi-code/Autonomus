/* Revisão semanal: reúne itens já registrados no caderno no período escolhido.
 * Não adiciona conteúdo novo, não presume dias de estudo e não altera o ciclo. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const review = window.OAB.lib.review;

  const state = { period: 'semana', custom: null, includePending: false };

  function reviewItemCard(e, today) {
    const last = review.lastAttempt(e);
    const recurring = e.status === 'recorrente';
    const form = h('form', { class: 'retry-form', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      const v = ui.readForm(form);
      if (!v.result) return ui.toast('Marque se acertou ou errou ao refazer.', 'warn');
      store.addAttempt(e.id, { date: today, result: v.result, note: v.note || '' });
      ui.toast(v.result === 'acerto' ? 'Revisado. O item continua no histórico.' : 'Erro de novo: item marcado como recorrente.', v.result === 'acerto' ? 'ok' : 'warn');
    } },
      h('div', { class: 'radio-row' },
        h('label', { class: 'radio-chip' }, h('input', { type: 'radio', name: 'result', value: 'acerto' }), h('span', null, 'Acertei')),
        h('label', { class: 'radio-chip' }, h('input', { type: 'radio', name: 'result', value: 'erro' }), h('span', null, 'Errei de novo'))),
      ui.input({ name: 'note', placeholder: 'Anotação da nova tentativa (opcional)', 'aria-label': 'Anotação da nova tentativa' }),
      h('button', { class: 'btn sm primary', type: 'submit' }, 'Registrar tentativa'));

    return h('article', { class: `review-item ${recurring ? 'recurring' : ''}` },
      h('header', { class: 'error-head' },
        h('div', null,
          h('p', { class: 'small muted' }, `${U.fmtDate(e.date)} · ${store.subjectName(e.subjectId)}`),
          h('h3', null, [e.ref, store.topicLabel(e.topicId) || e.subtopic].filter(Boolean).join(' · ') || 'Item sem referência')),
        h('div', { class: 'pill-row' },
          ui.pill(U.labelOf(U.ERROR_KIND, e.kind), e.kind === 'erro' ? 'bad' : 'warn'),
          ui.pill(U.labelOf(U.ERROR_STATUS, e.status), e.status === 'revisado' ? 'ok' : e.status === 'recorrente' ? 'bad' : 'warn'))),
      recurring ? h('p', { class: 'notice bad' }, 'Erro que se repete: revise a regra antes de refazer.') : null,
      e.rule || e.reason ? h('dl', { class: 'kv compact' },
        e.reason ? [h('dt', null, 'Motivo'), h('dd', null, e.reason)] : null,
        e.rule ? [h('dt', null, 'Regra correta'), h('dd', null, e.rule)] : null) : null,
      last ? h('p', { class: 'small muted' }, `Última tentativa: ${U.fmtDate(last.date)} — ${last.result === 'acerto' ? 'acertei' : 'errei'}${(e.attempts || []).length > 1 ? ` · ${e.attempts.length} tentativas` : ''}`) : null,
      h('details', { class: 'retry', open: !last || null },
        h('summary', null, 'Refazer a questão'),
        form));
  }

  function view() {
    const s = store.getState();
    const today = U.todayISO();
    const isSunday = U.weekday(today) === 0;
    const range = review.periodRange(state.period, today, state.custom || U.weekRange(today));
    const enriched = s.errors.map((e) => ({ ...e }));
    const items = review.collectItems(enriched, { ...range, includePendingBefore: state.includePending });
    const sum = review.summarize(items, s.logs, range);

    const periodSelect = ui.select({ 'aria-label': 'Período da revisão', onchange: (e) => { state.period = e.target.value; if (e.target.value === 'personalizado' && !state.custom) state.custom = U.weekRange(today); window.OAB.app.refresh(); } },
      [
        { value: 'semana', label: 'Esta semana (seg–dom)' },
        { value: 'anterior', label: 'Semana anterior' },
        { value: '7dias', label: 'Últimos 7 dias' },
        { value: 'personalizado', label: 'Período personalizado' },
      ], state.period);

    const customBox = state.period === 'personalizado'
      ? h('div', { class: 'filters' },
        ui.input({ type: 'date', 'aria-label': 'Data inicial', value: range.from, onchange: (e) => { state.custom = { from: e.target.value, to: range.to }; window.OAB.app.refresh(); } }),
        ui.input({ type: 'date', 'aria-label': 'Data final', value: range.to, onchange: (e) => { state.custom = { from: range.from, to: e.target.value }; window.OAB.app.refresh(); } }))
      : null;

    const pendingToggle = h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: state.includePending || null, onchange: (e) => { state.includePending = e.target.checked; window.OAB.app.refresh(); } }),
      h('span', null, 'Incluir pendências de períodos anteriores'));

    const list = items.length
      ? h('div', { class: 'stack-lg' }, items.map((e) => reviewItemCard(e, today)))
      : ui.empty('Nada para revisar neste período', 'Só aparecem itens que você registrou no caderno. Nenhum conteúdo novo é adicionado automaticamente.',
        h('a', { class: 'btn', href: '#/questoes' }, 'Registrar questões'));

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Domingo é dia de revisão'),
          h('h1', { class: 'display-sm' }, 'Revisão semanal de erros'),
          h('p', { class: 'muted' }, 'Refaça o que errou ou marcou com dúvida. A revisão não altera o ciclo de estudos.'))),
      isSunday ? h('div', { class: 'banner' }, h('div', null, h('strong', null, 'Hoje é domingo.'), h('p', { class: 'small' }, 'Reserve um momento para refazer os itens da semana.'))) : null,
      ui.card(null, h('div', { class: 'filters' }, periodSelect, customBox), { cls: 'toolbar-card' }),
      h('div', { class: 'kpis' },
        ui.stat('Período', `${U.fmtDayMonth(range.from)} – ${U.fmtDayMonth(range.to)}`, `${sum.periodDays} dias`),
        ui.stat('Itens', U.fmtInt(sum.total), 'Registrados no caderno'),
        ui.stat('Pendentes', U.fmtInt(sum.pending), 'Ainda não refeitos', sum.pending ? 'warn' : 'ok'),
        ui.stat('Revisados', U.fmtInt(sum.revised), 'Refeitos com acerto', 'ok'),
        ui.stat('Recorrentes', U.fmtInt(sum.recurring), 'Erraram de novo', sum.recurring ? 'bad' : ''),
        ui.stat('Dias com registro', `${sum.daysWithLogs} de ${sum.periodDays}`, 'Só dias em que houve questões')),
      h('div', { class: 'toolbar' }, pendingToggle, items.length ? h('button', { class: 'btn', type: 'button', onclick: () => {
        const label = `${U.fmtDate(range.from)} a ${U.fmtDate(range.to)}`;
        const rows = items.map((e) => ({ subjectName: store.subjectName(e.subjectId), topicName: store.topicLabel(e.topicId) || e.subtopic, rule: e.rule, reason: e.reason, status: e.status }));
        window.OAB.tutorSeed = { text: window.OAB.lib.tutor.weeklyScriptText(rows, label), mode: 'resumo', autoSend: true, autoSpeak: true };
        window.OAB.app.go('tutor');
      } }, '📝 Resumo da semana com o tutor') : null),
      list);
  }

  window.OAB.views.revisao = view;
})();
