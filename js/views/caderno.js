/* Caderno de erros: itens de erro e de acerto por chute/dúvida, com status, histórico e erros que se repetem. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const forms = () => window.OAB.forms;

  const filters = { q: '', subjectId: '', topicId: '', kind: '', status: '' };

  const enriched = (state) => state.errors.map((e) => ({ ...e, topicLabel: store.topicLabel(e.topicId) }));

  function matches(e) {
    if (filters.subjectId && e.subjectId !== filters.subjectId) return false;
    if (filters.topicId && e.topicId !== filters.topicId) return false;
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.q) {
      const hay = U.normalize([e.ref, e.subtopic, e.topicLabel, e.reason, e.rule, e.note, store.subjectName(e.subjectId)].join(' '));
      if (!hay.includes(U.normalize(filters.q))) return false;
    }
    return true;
  }

  function setStatus(id, status) {
    store.setErrorStatus(id, status);
    ui.toast(status === 'revisado' ? 'Marcado como revisado. O item continua no histórico.' : 'Marcado como erro recorrente.', status === 'revisado' ? 'ok' : 'warn');
  }

  function itemCard(e) {
    const attempts = e.attempts || [];
    const tone = e.status === 'revisado' ? 'ok' : e.status === 'recorrente' ? 'bad' : 'warn';
    return h('article', { class: `error-item tone-${tone}` },
      h('header', { class: 'error-head' },
        h('div', null,
          h('p', { class: 'small muted' }, `${U.fmtDate(e.date)} · ${store.subjectName(e.subjectId)}`),
          h('h3', null, [e.ref, e.topicLabel || e.subtopic].filter(Boolean).join(' · ') || 'Item sem referência')),
        h('div', { class: 'pill-row' },
          ui.pill(U.labelOf(U.ERROR_KIND, e.kind), e.kind === 'erro' ? 'bad' : 'warn'),
          ui.pill(U.labelOf(U.ERROR_STATUS, e.status), tone),
          h('span', { class: 'pill neutral' }, U.labelOf(U.ORIGINS, e.origem)))),
      e.reason || e.rule || e.note ? h('dl', { class: 'kv compact' },
        e.reason ? [h('dt', null, 'Motivo'), h('dd', null, e.reason)] : null,
        e.rule ? [h('dt', null, 'Regra correta'), h('dd', null, e.rule)] : null,
        e.note ? [h('dt', null, 'Anotação'), h('dd', null, e.note)] : null) : null,
      attempts.length ? h('details', { class: 'attempts' },
        h('summary', null, `Histórico de tentativas (${attempts.length})`),
        h('ol', null, attempts.map((a) => h('li', null,
          h('span', { class: 'small muted' }, U.fmtDate(a.date)), ' · ',
          ui.pill(a.result === 'acerto' ? 'Acertei' : 'Errei', a.result === 'acerto' ? 'ok' : 'bad'),
          a.note ? h('span', { class: 'small' }, ` — ${a.note}`) : null)))) : null,
      h('footer', { class: 'error-actions' },
        e.status !== 'revisado' ? h('button', { class: 'btn sm', type: 'button', onclick: () => setStatus(e.id, 'revisado') }, ui.icon('check'), 'Marcar revisado') : null,
        e.status !== 'recorrente' ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => setStatus(e.id, 'recorrente') }, 'Marcar recorrente') : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar item', title: 'Editar', onclick: () => forms().errorEntry(e) }, ui.icon('edit')),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir item', title: 'Excluir', onclick: async () => {
          const ok = await ui.confirmDialog({ title: 'Excluir item?', message: 'O item e seu histórico de tentativas serão apagados.', confirmLabel: 'Excluir', danger: true });
          if (ok) store.deleteError(e.id);
        } }, ui.icon('trash'))));
  }

  function view() {
    const s = store.getState();
    const all = enriched(s);
    const open = all.filter((e) => e.status !== 'revisado');
    const groups = stats.recurringGroups(all);
    const subjectOpts = [{ value: '', label: 'Todas as disciplinas' }, ...store.sortedSubjects().map((x) => ({ value: x.id, label: x.name }))];
    const topicOpts = [{ value: '', label: 'Todos os assuntos' }, ...(filters.subjectId ? store.topicsOf(filters.subjectId).map((t) => ({ value: t.id, label: t.name })) : [])];
    const listBox = h('div', { class: 'stack-lg' });
    const drawList = () => {
      ui.clear(listBox);
      const list = all.filter(matches).sort((a, b) => U.compareText(b.date, a.date) || (b.createdAt || 0) - (a.createdAt || 0));
      if (!list.length) return listBox.appendChild(ui.empty(all.length ? 'Nenhum item com estes filtros' : 'Caderno vazio', all.length ? 'Ajuste os filtros.' : 'Erros de questões e acertos por chute aparecem aqui automaticamente.'));
      list.slice(0, 60).forEach((e) => listBox.appendChild(itemCard(e)));
      if (list.length > 60) listBox.appendChild(h('p', { class: 'muted small center' }, `Mostrando 60 de ${list.length}. Refine os filtros.`));
    };
    const search = ui.input({ placeholder: 'Pesquisar por palavra: motivo, regra, anotação, assunto…', value: filters.q, 'aria-label': 'Pesquisar no caderno' });
    search.addEventListener('input', () => { filters.q = search.value; drawList(); });
    drawList();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Caderno de erros'),
          h('h1', { class: 'display-sm' }, 'Erros e dúvidas'),
          h('p', { class: 'muted' }, 'Nada some ao revisar: o histórico de cada item fica preservado.')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => forms().errorEntry(null) }, ui.icon('plus'), 'Novo item'))),
      h('div', { class: 'kpis' },
        ui.stat('Em aberto', U.fmtInt(open.length), 'Pendentes ou recorrentes', open.length ? 'warn' : ''),
        ui.stat('Revisados', U.fmtInt(all.filter((e) => e.status === 'revisado').length), 'Já refeitos com acerto'),
        ui.stat('Erro recorrente', U.fmtInt(all.filter((e) => e.status === 'recorrente').length), 'Errados de novo na revisão', 'bad'),
        ui.stat('Acertos por chute', U.fmtInt(all.filter((e) => e.kind === 'duvida').length), 'Com dúvida relevante')),
      groups.length ? ui.card('Erros que se repetem', h('ul', { class: 'rank-list' }, groups.slice(0, 8).map((g) => h('li', null,
        h('div', null, h('strong', null, g.label), h('p', { class: 'small muted' }, store.subjectName(g.subjectId))),
        h('span', { class: 'pill bad' }, `${g.errorCount} erro(s)${g.flagged ? ` · ${g.flagged} recorrente(s)` : ''}`),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { filters.subjectId = g.subjectId; filters.topicId = ''; filters.q = g.label; window.OAB.app.refresh(); } }, 'Ver itens')))),
      { sub: 'Mesmo assunto com 2 ou mais erros, ou marcado como recorrente' }) : null,
      ui.card('Itens', h('div', null,
        h('div', { class: 'filters' },
          search,
          ui.select({ 'aria-label': 'Filtrar por disciplina', onchange: (e) => { filters.subjectId = e.target.value; filters.topicId = ''; window.OAB.app.refresh(); } }, subjectOpts, filters.subjectId),
          ui.select({ 'aria-label': 'Filtrar por assunto', onchange: (e) => { filters.topicId = e.target.value; drawList(); } }, topicOpts, filters.topicId),
          ui.select({ 'aria-label': 'Filtrar por tipo', onchange: (e) => { filters.kind = e.target.value; drawList(); } },
            [{ value: '', label: 'Erros e chutes' }, ...U.ERROR_KIND.map((k) => ({ value: k.id, label: k.label }))], filters.kind),
          ui.select({ 'aria-label': 'Filtrar por status', onchange: (e) => { filters.status = e.target.value; drawList(); } },
            [{ value: '', label: 'Todos os status' }, ...U.ERROR_STATUS.map((k) => ({ value: k.id, label: k.label }))], filters.status)),
        listBox)));
  }

  window.OAB.views.caderno = view;
})();
