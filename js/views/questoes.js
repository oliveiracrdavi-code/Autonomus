/* Questões: resumo, aproveitamento por disciplina e por assunto, e lista de registros com filtros. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const forms = () => window.OAB.forms;

  const filters = { subjectId: '', origem: '', q: '', topicSubject: '' };
  let limit = 40;

  function matchesFilters(l, subjectsById) {
    if (filters.subjectId && l.subjectId !== filters.subjectId) return false;
    if (filters.origem && l.origem !== filters.origem) return false;
    if (filters.q) {
      const hay = U.normalize([l.subtopic, l.banca, l.prova, l.notes, subjectsById[l.subjectId] || ''].join(' '));
      if (!hay.includes(U.normalize(filters.q))) return false;
    }
    return true;
  }

  function summaryCards(logs) {
    const t = stats.totals(logs);
    return h('div', { class: 'kpis' },
      ui.stat('Questões', U.fmtInt(t.total), `${U.fmtInt(logs.length)} registro(s)`),
      ui.stat('Acertos', U.fmtInt(t.correct), 'Respostas certas'),
      ui.stat('Erros', U.fmtInt(t.wrong), 'Respostas erradas', t.wrong ? 'warn' : ''),
      ui.stat('Em branco', U.fmtInt(t.blank), 'Não respondidas'),
      ui.stat('Aproveitamento', U.fmtPct(t.pct), 'Acertos ÷ total', ui.pctTone(t.pct)));
  }

  function subjectTable(logs, subjects) {
    const rows = stats.bySubject(logs, subjects).filter((r) => r.total > 0)
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const general = logs.filter((l) => !l.subjectId);
    const gt = stats.totals(general);
    if (!rows.length && !gt.total) return ui.empty('Nenhuma questão registrada', 'Use “Nova questão” para começar. O aproveitamento por disciplina aparece aqui.');
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Disciplina'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Acertos'),
          h('th', { class: 'num' }, 'Erros'), h('th', { class: 'num' }, 'Aproveitamento'), h('th', null, ''))),
        h('tbody', null,
          rows.map((r) => h('tr', null,
            h('td', null, h('a', { href: `#/materias/${r.subjectId}`, class: 'link' }, r.name), r.smallSample ? h('span', { class: 'pill neutral tiny' }, 'amostra pequena') : null),
            h('td', { class: 'num' }, U.fmtInt(r.total)),
            h('td', { class: 'num' }, U.fmtInt(r.correct)),
            h('td', { class: 'num' }, U.fmtInt(r.wrong)),
            h('td', { class: 'num' }, ui.pill(U.fmtPct(r.pct), ui.pctTone(r.pct))),
            h('td', { class: 'bar-cell' }, ui.progressBar(r.pct, r.pct < 50 ? 'bad' : r.pct < 70 ? 'warn' : 'ok')))),
          gt.total ? h('tr', { class: 'muted-row' },
            h('td', null, 'Sem disciplina (simulados gerais)'), h('td', { class: 'num' }, U.fmtInt(gt.total)),
            h('td', { class: 'num' }, U.fmtInt(gt.correct)), h('td', { class: 'num' }, U.fmtInt(gt.wrong)),
            h('td', { class: 'num' }, U.fmtPct(gt.pct)), h('td', null, '')) : null)));
  }

  function subtopicTable(logs, subjects) {
    const subjectId = filters.topicSubject;
    const select = ui.select({ 'aria-label': 'Disciplina para ver assuntos', onchange: (e) => { filters.topicSubject = e.target.value; window.OAB.app.refresh(); } },
      [{ value: '', label: 'Escolha uma disciplina' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))], subjectId);
    if (!subjectId) return h('div', null, select, h('p', { class: 'muted small mt' }, 'Veja o aproveitamento por subtópico e por assunto cadastrado.'));
    const rows = stats.bySubtopic(logs, subjectId);
    const topics = store.topicsOf(subjectId).map((t) => ({ t, ...stats.byTopic(logs, t.id) }));
    return h('div', null, select,
      topics.length ? h('div', { class: 'table-wrap mt' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Assunto cadastrado'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Aproveitamento'))),
        h('tbody', null, topics.map((r) => h('tr', null, h('td', null, r.t.name), h('td', { class: 'num' }, U.fmtInt(r.total)), h('td', { class: 'num' }, ui.pill(U.fmtPct(r.pct), ui.pctTone(r.pct)))))))) : null,
      rows.length ? h('div', { class: 'table-wrap mt' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Subtópico'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Acertos'), h('th', { class: 'num' }, 'Aproveitamento'))),
        h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r.label), h('td', { class: 'num' }, U.fmtInt(r.total)), h('td', { class: 'num' }, U.fmtInt(r.correct)), h('td', { class: 'num' }, ui.pill(U.fmtPct(r.pct), ui.pctTone(r.pct)))))))) : (!topics.length ? ui.empty('Sem registros nesta disciplina', 'Registre questões para ver os subtópicos.') : null));
  }

  function recordsTable(logs, subjectsById) {
    const list = logs
      .filter((l) => matchesFilters(l, subjectsById))
      .sort((a, b) => U.compareText(b.date, a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) return ui.empty('Nenhum registro com estes filtros', 'Ajuste os filtros ou registre novas questões.');
    const shown = list.slice(0, limit);
    return h('div', null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table records' },
        h('thead', null, h('tr', null,
          h('th', null, 'Data'), h('th', null, 'Disciplina / assunto'), h('th', null, 'Banca · prova'), h('th', null, 'Origem'),
          h('th', { class: 'num' }, 'Total'), h('th', { class: 'num' }, 'Certas'), h('th', { class: 'num' }, 'Erradas'),
          h('th', { class: 'num' }, 'Branco'), h('th', { class: 'num' }, '%'), h('th', null, ''))),
        h('tbody', null, shown.map((l) => {
          const pct = U.pctOf(l.correct, l.total);
          return h('tr', null,
            h('td', { class: 'nowrap' }, U.fmtDate(l.date)),
            h('td', null,
              h('strong', null, subjectsById[l.subjectId] || 'Simulado geral'),
              l.subtopic || l.topicId ? h('p', { class: 'small muted' }, [l.topicId ? store.topicLabel(l.topicId) : '', l.subtopic].filter(Boolean).join(' · ')) : null),
            h('td', null, [l.banca, l.prova].filter(Boolean).join(' · ') || '—'),
            h('td', null, h('span', { class: 'pill neutral' }, U.labelOf(U.ORIGINS, l.origem))),
            h('td', { class: 'num' }, U.fmtInt(l.total)),
            h('td', { class: 'num ok-text' }, U.fmtInt(l.correct)),
            h('td', { class: 'num bad-text' }, U.fmtInt(l.wrong)),
            h('td', { class: 'num' }, U.fmtInt(l.blank)),
            h('td', { class: 'num' }, ui.pill(U.fmtPct(pct), ui.pctTone(pct))),
            h('td', { class: 'row-actions' },
              l.simuladoId ? h('span', { class: 'muted tiny' }, 'via simulado') : [
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar registro', title: 'Editar', onclick: () => forms().log(l) }, ui.icon('edit')),
                h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir registro', title: 'Excluir', onclick: async () => {
                  const ok = await ui.confirmDialog({ title: 'Excluir registro?', message: 'Os itens do caderno gerados por este registro são mantidos.', confirmLabel: 'Excluir', danger: true });
                  if (ok) store.deleteLog(l.id);
                } }, ui.icon('trash'))]));
        })))),
      list.length > limit ? h('div', { class: 'center mt' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { limit += 40; drawRecords(); } }, `Mostrar mais (${list.length - limit} restantes)`)) : null);
  }

  function view() {
    const s = store.getState();
    const subjectsById = Object.fromEntries(s.subjects.map((x) => [x.id, x.name]));
    const subjectOpts = [{ value: '', label: 'Todas as disciplinas' }, ...store.sortedSubjects().map((x) => ({ value: x.id, label: x.name }))];
    const originOpts = [{ value: '', label: 'Todas as origens' }, ...U.ORIGINS.map((o) => ({ value: o.id, label: o.label }))];
    const recordsBox = h('div');
    const drawRecords = () => { ui.clear(recordsBox); recordsBox.appendChild(recordsTable(s.logs, subjectsById)); };
    // Busca atualiza só a lista, para o campo não perder o foco a cada tecla.
    const search = ui.input({ placeholder: 'Buscar por assunto, banca, prova…', value: filters.q, 'aria-label': 'Buscar registros' });
    search.addEventListener('input', () => { filters.q = search.value; limit = 40; drawRecords(); });
    drawRecords();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Registro diário'),
          h('h1', { class: 'display-sm' }, 'Questões'),
          h('p', { class: 'muted' }, 'Registre blocos ou questões individuais. Erros e acertos por chute vão automaticamente para o caderno.')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => forms().log(null, { mode: 'bloco' }) }, ui.icon('plus'), 'Novo registro'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => forms().log(null, { mode: 'individual' }) }, 'Questão individual'))),
      summaryCards(s.logs),
      h('div', { class: 'grid-2' },
        ui.card('Aproveitamento por disciplina', subjectTable(s.logs, s.subjects), { sub: 'Verde ≥ 70% · Âmbar 50–69% · Vermelho < 50%' }),
        ui.card('Aproveitamento por assunto', subtopicTable(s.logs, store.sortedSubjects()), { sub: 'Escolha a disciplina para ver subtópicos e assuntos cadastrados' })),
      ui.card('Registros', h('div', null,
        h('div', { class: 'filters' },
          search,
          ui.select({ 'aria-label': 'Filtrar por disciplina', onchange: (e) => { filters.subjectId = e.target.value; limit = 40; drawRecords(); } }, subjectOpts, filters.subjectId),
          ui.select({ 'aria-label': 'Filtrar por origem', onchange: (e) => { filters.origem = e.target.value; limit = 40; drawRecords(); } }, originOpts, filters.origem)),
        recordsBox), { sub: `${U.fmtInt(s.logs.length)} registro(s) no total` }));
  }

  window.OAB.views.questoes = view;
})();
