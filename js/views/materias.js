/* Matérias: lista com indicadores e página de detalhe (assuntos, PDFs, erros, sessões e evolução). */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const session = window.OAB.lib.session;
  const forms = () => window.OAB.forms;

  const listFilter = { q: '', showArchived: false };

  function weightNote(subjects) {
    const sum = subjects.filter((s) => !s.archived).reduce((t, s) => t + (Number(s.weight) || 0), 0);
    if (Math.abs(sum - 100) < 0.01) return null;
    return h('p', { class: 'notice warn' },
      `A soma dos pesos informados é ${sum.toString().replace('.', ',')}%. Esses valores vêm do relatório do simulado e são só referência: edite à vontade.`);
  }

  function subjectRow(r, s, e) {
    return h('tr', { class: r.archived ? 'is-archived' : '' },
      h('td', null,
        h('a', { href: `#/materias/${s.id}`, class: 'link strong' }, s.name),
        r.archived ? h('span', { class: 'pill warn tiny' }, 'arquivada') : null),
      h('td', { class: 'num' }, `${s.weight}%`),
      h('td', { class: 'num' }, U.fmtInt(r.total)),
      h('td', { class: 'num' }, r.total ? ui.pill(U.fmtPct(r.pct), ui.pctTone(r.pct)) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'num' }, U.fmtInt(store.getState().errors.filter((x) => x.subjectId === s.id && x.status !== 'revisado').length)),
      h('td', { class: 'num' }, U.fmtInt(store.topicsOf(s.id).length)),
      h('td', { class: 'row-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar disciplina', title: 'Editar', onclick: () => forms().subject(s) }, ui.icon('edit')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': s.archived ? 'Reativar disciplina' : 'Arquivar disciplina', title: s.archived ? 'Reativar' : 'Arquivar',
          onclick: () => { store.setSubjectArchived(s.id, !s.archived); ui.toast(s.archived ? 'Disciplina reativada.' : 'Disciplina arquivada. O histórico foi mantido.', 'ok'); } }, ui.icon('archive')),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir disciplina', title: 'Excluir', onclick: async () => {
          const ok = await ui.confirmDialog({ title: 'Excluir disciplina?', message: 'Só é possível excluir disciplinas sem registros. Ela sairá do ciclo e os assuntos serão removidos.', confirmLabel: 'Excluir', danger: true });
          if (!ok) return;
          const res = store.deleteSubject(s.id);
          ui.toast(res.ok ? 'Disciplina excluída.' : res.reason, res.ok ? 'ok' : 'warn');
        } }, ui.icon('trash'))));
  }

  function listView() {
    const s = store.getState();
    const logs = s.logs;
    const rows = stats.bySubject(logs, s.subjects);
    const box = h('div');
    const draw = () => {
      ui.clear(box);
      const filtered = s.subjects
        .filter((x) => (listFilter.showArchived || !x.archived))
        .filter((x) => !listFilter.q || U.normalize(x.name).includes(U.normalize(listFilter.q)))
        .sort((a, b) => a.order - b.order);
      box.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Disciplina'), h('th', { class: 'num' }, 'Peso'), h('th', { class: 'num' }, 'Questões'),
          h('th', { class: 'num' }, 'Aproveitamento'), h('th', { class: 'num' }, 'Erros em aberto'), h('th', { class: 'num' }, 'Assuntos'), h('th', null, ''))),
        h('tbody', null, filtered.map((x) => subjectRow(rows.find((r) => r.subjectId === x.id) || { total: 0, pct: null, archived: x.archived }, x))))));
      if (!filtered.length) box.appendChild(ui.empty('Nenhuma disciplina encontrada', 'Ajuste a busca ou crie uma nova disciplina.'));
    };
    const search = ui.input({ placeholder: 'Buscar disciplina…', value: listFilter.q, 'aria-label': 'Buscar disciplina' });
    search.addEventListener('input', () => { listFilter.q = search.value; draw(); });
    draw();
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Conteúdo'),
          h('h1', { class: 'display-sm' }, 'Matérias e assuntos'),
          h('p', { class: 'muted' }, 'Cada disciplina tem seus assuntos, PDFs, erros e evolução.')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => forms().subject(null) }, ui.icon('plus'), 'Nova disciplina'))),
      weightNote(s.subjects),
      h('div', { class: 'toolbar' },
        search,
        h('label', { class: 'check-row' },
          h('input', { type: 'checkbox', checked: listFilter.showArchived || null, onchange: (e) => { listFilter.showArchived = e.target.checked; draw(); } }),
          h('span', null, 'Mostrar arquivadas'))),
      ui.card(null, box, { cls: 'flush' }));
  }

  function topicRow(t, subjectId) {
    const t2 = stats.byTopic(store.getState().logs, t.id);
    const openErr = store.getState().errors.filter((e) => e.topicId === t.id && e.status !== 'revisado').length;
    const mat = t.materialId ? store.materialById(t.materialId) : null;
    const prio = U.PRIORITIES.find((p) => p.id === t.priority);
    return h('tr', null,
      h('td', null, h('strong', null, t.name), t.source ? h('p', { class: 'small muted' }, t.source) : null),
      h('td', null, ui.pill(prio.label, t.priority === 'alta' ? 'bad' : t.priority === 'media' ? 'warn' : 'neutral')),
      h('td', null, h('select', { class: 'input compact', 'aria-label': `Status de ${t.name}`, onchange: (e) => store.setTopicStatus(t.id, e.target.value) },
        U.TOPIC_STATUS.map((x) => h('option', { value: x.id, selected: x.id === t.status || null }, x.label)))),
      h('td', { class: 'num' }, U.fmtInt(t2.total)),
      h('td', { class: 'num' }, t2.total ? U.fmtPct(t2.pct) : '—'),
      h('td', { class: 'num' }, openErr ? ui.pill(String(openErr), 'warn') : '0'),
      h('td', null, mat ? h('a', { href: '#/materiais', class: 'link small' }, mat.title) : h('span', { class: 'muted small' }, 'Sem PDF')),
      h('td', { class: 'row-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar assunto', title: 'Editar', onclick: () => forms().topic(t, subjectId) }, ui.icon('edit')),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir assunto', title: 'Excluir', onclick: async () => {
          const ok = await ui.confirmDialog({ title: 'Excluir assunto?', message: 'Os registros que usavam este assunto ficam sem assunto cadastrado.', confirmLabel: 'Excluir', danger: true });
          if (ok) store.deleteTopic(t.id);
        } }, ui.icon('trash'))));
  }

  function detailView(id) {
    const s = store.getState();
    const subject = store.subjectById(id);
    if (!subject) {
      return h('div', { class: 'page' }, ui.empty('Disciplina não encontrada', 'Ela pode ter sido excluída.', h('a', { class: 'btn', href: '#/materias' }, 'Voltar às matérias')));
    }
    const logs = s.logs.filter((l) => l.subjectId === id);
    const t = stats.totals(logs);
    const topics = store.topicsOf(id);
    const studied = topics.filter((x) => x.status === 'estudado').length;
    const sessions = s.sessions.filter((x) => x.subjectId === id);
    const sum = stats.sessionSummary(sessions, (x) => store.sessionElapsed(x));
    const timeline = stats.timelineByWeek(logs).map((w) => ({ label: w.label, value: w.pct, title: `${w.label}: ${w.correct}/${w.total}` }));
    const sub = stats.bySubtopic(logs, id);
    const recurring = stats.recurringGroups(s.errors.filter((e) => e.subjectId === id).map((e) => ({ ...e, topicLabel: store.topicLabel(e.topicId) })));
    const materials = s.materials.filter((m) => m.subjectId === id);
    const pending = topics.filter((x) => x.status !== 'estudado');

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, h('a', { href: '#/materias', class: 'link' }, '← Matérias')),
          h('h1', { class: 'display-sm' }, subject.name),
          h('p', { class: 'muted' }, `Peso informado: ${subject.weight}%${subject.archived ? ' · arquivada' : ''}`)),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => forms().subject(subject) }, ui.icon('edit'), 'Editar disciplina'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => forms().topic(null, id) }, ui.icon('plus'), 'Novo assunto'))),
      h('div', { class: 'kpis' },
        ui.stat('Questões', U.fmtInt(t.total), `${U.fmtInt(t.correct)} acertos · ${U.fmtInt(t.wrong)} erros`),
        ui.stat('Aproveitamento', U.fmtPct(t.pct), t.smallSample ? 'amostra pequena' : 'acertos ÷ total', ui.pctTone(t.pct)),
        ui.stat('Horas estudadas', U.fmtHours(sum.totalMs), `${sum.concluded} sessão(ões) concluída(s)`),
        ui.stat('Assuntos estudados', `${studied} de ${topics.length}`, topics.length ? `${pending.length} pendente(s)` : 'Nenhum cadastrado')),
      h('div', { class: 'grid-2' },
        ui.card('Evolução', ui.charts.line(timeline, { yMin: 0, yMax: 100 }), { sub: 'Aproveitamento por semana' }),
        ui.card('Aproveitamento por subtópico', sub.length ? h('ul', { class: 'rank-list' }, sub.slice(0, 8).map((r) => h('li', null,
          h('span', null, r.label),
          h('span', { class: 'small muted' }, `${U.fmtInt(r.total)} q`),
          ui.pill(U.fmtPct(r.pct), ui.pctTone(r.pct))))) : ui.empty('Sem subtópicos', 'Informe o subtópico ao registrar questões.'))),
      ui.card('Assuntos', topics.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Assunto'), h('th', null, 'Prioridade'), h('th', null, 'Status'),
          h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Aproveitamento'), h('th', { class: 'num' }, 'Erros'), h('th', null, 'PDF'), h('th', null, ''))),
        h('tbody', null, topics.map((x) => topicRow(x, id))))) : ui.empty('Nenhum assunto cadastrado', 'Cadastre os assuntos que você vai estudar nesta disciplina.',
        h('button', { class: 'btn', type: 'button', onclick: () => forms().topic(null, id) }, 'Cadastrar assunto')),
        { sub: 'Prioridade alta, média ou baixa. A sugestão de próximo assunto segue essa ordem.' }),
      h('div', { class: 'grid-2' },
        ui.card('Erros que se repetem', recurring.length ? h('ul', { class: 'rank-list' }, recurring.map((g) => h('li', null,
          h('span', null, g.label), h('span', { class: 'pill bad' }, `${g.errorCount} erro(s)`)))) : ui.empty('Nenhum erro repetido', 'Aparecem quando há 2 ou mais erros no mesmo assunto.')),
        ui.card('PDFs desta disciplina', materials.length ? h('ul', { class: 'rank-list' }, materials.map((m) => h('li', null,
          h('a', { href: '#/materiais', class: 'link' }, m.title),
          h('span', { class: 'pill neutral' }, U.labelOf(U.MATERIAL_SOURCES, m.source))))) : ui.empty('Nenhum PDF', 'Importe materiais na biblioteca e associe-os a esta disciplina.',
          h('a', { class: 'btn sm', href: '#/materiais' }, 'Ir para materiais')))),
      ui.card('Sessões desta disciplina', sessions.length ? h('ul', { class: 'rank-list' }, sessions.slice().reverse().slice(0, 6).map((x) => h('li', null,
        h('span', null, `${U.fmtDateTime(x.startedAt)}`),
        h('span', { class: 'small muted' }, U.fmtMinutes(store.sessionElapsed(x).total)),
        ui.pill(x.status === 'concluida' ? 'Concluída' : x.status === 'ativa' ? 'Em andamento' : 'Pausada', x.status === 'concluida' ? 'ok' : 'warn')))) : ui.empty('Nenhuma sessão ainda', 'Inicie uma sessão quando este for o próximo bloco do ciclo.')));
  }

  window.OAB.views.materias = (params) => (params[0] ? detailView(params[0]) : listView());
})();
