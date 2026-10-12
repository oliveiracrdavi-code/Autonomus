/* Editor do ciclo: ordem dos blocos (arrastar e soltar ou botões), próximo bloco e quantidade por matéria. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const C = window.OAB.lib.cycle;

  function subjectOptions(currentId) {
    const list = store.sortedSubjects().filter((s) => !s.archived || s.id === currentId);
    return list.map((s) => ({ value: s.id, label: s.archived ? `${s.name} (arquivada)` : s.name }));
  }

  function blockRow(b, idx, total, cursorId) {
    const isNext = b.id === cursorId;
    const subj = store.subjectById(b.subjectId);
    const archived = !subj || subj.archived;
    const row = h('li', {
      class: `block-row ${isNext ? 'is-next' : ''} ${archived ? 'is-archived' : ''}`,
      draggable: 'true',
      'data-id': b.id,
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', b.id);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      },
      ondragend: () => row.classList.remove('dragging'),
      ondragover: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drop-target');
      },
      ondragleave: () => row.classList.remove('drop-target'),
      ondrop: (e) => {
        e.preventDefault();
        row.classList.remove('drop-target');
        const from = e.dataTransfer.getData('text/plain');
        if (from && from !== b.id) store.cycleMove(from, idx);
      },
    },
    h('span', { class: 'drag-handle', title: 'Arraste para reordenar', 'aria-hidden': 'true' }, ui.icon('drag')),
    h('span', { class: 'block-num' }, String(idx + 1)),
    ui.select({ 'aria-label': `Matéria do bloco ${idx + 1}`, onchange: (e) => store.cycleSetSubject(b.id, e.target.value) },
      subjectOptions(b.subjectId), b.subjectId),
    h('div', { class: 'row-tags' },
      isNext ? ui.pill('Próximo', 'ok') : null,
      archived ? ui.pill('Arquivada', 'warn') : null),
    h('div', { class: 'row-actions' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Subir', 'aria-label': 'Subir bloco', disabled: idx === 0 || null,
        onclick: () => store.cycleMove(b.id, idx - 1) }, ui.icon('arrowUp')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Descer', 'aria-label': 'Descer bloco', disabled: idx === total - 1 || null,
        onclick: () => store.cycleMove(b.id, idx + 1) }, ui.icon('arrowDown')),
      !isNext ? h('button', { class: 'icon-btn', type: 'button', title: 'Definir como próximo', 'aria-label': 'Definir como próximo bloco',
        onclick: () => store.cycleSetCursor(b.id) }, ui.icon('target')) : null,
      h('button', { class: 'icon-btn', type: 'button', title: 'Duplicar', 'aria-label': 'Duplicar bloco',
        onclick: () => store.cycleDuplicate(b.id) }, ui.icon('copy')),
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Remover', 'aria-label': 'Remover bloco',
        onclick: async () => {
          const ok = await ui.confirmDialog({
            title: 'Remover bloco?',
            message: `O bloco ${idx + 1} (${subj ? subj.name : 'matéria removida'}) sai do ciclo. Os registros de estudo não são apagados.`,
            confirmLabel: 'Remover',
            danger: true,
          });
          if (ok) store.cycleRemove(b.id);
        } }, ui.icon('trash'))));
    return row;
  }

  function countPanel(cursorId, cycle) {
    const counts = C.countBySubject(cycle);
    const subjects = store.sortedSubjects().filter((s) => !s.archived || counts[s.id]);
    const total = cycle.length || 1;
    const rows = subjects.map((s) => {
      const n = counts[s.id] || 0;
      const change = (target) => {
        const r = store.cycleSetCount(s.id, target);
        if (r && r.shortfall) {
          ui.toast(`Não foi possível remover ${r.shortfall} bloco(s): o próximo bloco é desta matéria.`, 'warn');
        }
      };
      const input = ui.number({
        value: n,
        min: '0',
        'aria-label': `Quantidade de blocos de ${s.name}`,
        onchange: (e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 0) change(v);
          else e.target.value = String(n);
        },
      });
      return h('li', { class: 'count-row' },
        h('div', { class: 'count-name' },
          h('strong', null, s.name),
          s.archived ? ui.pill('Arquivada', 'warn') : null,
          h('p', { class: 'small muted' }, `${((n / total) * 100).toFixed(1).replace('.', ',')}% do ciclo`)),
        h('div', { class: 'stepper' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remover um bloco de ${s.name}`, disabled: n === 0 || null, onclick: () => change(n - 1) }, '−'),
          input,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Adicionar um bloco de ${s.name}`, onclick: () => change(n + 1) }, '+')));
    });
    return rows.length ? h('ul', { class: 'count-list' }, rows) : ui.empty('Sem matérias', 'Cadastre matérias para montar o ciclo.');
  }

  function view() {
    const state = store.getState();
    const cycle = state.cycle;
    const cursorId = C.sanitizeCursor(cycle, state.cursorId);
    const pos = cycle.findIndex((b) => b.id === cursorId) + 1;
    const next = cycle[pos - 1];
    const addSelect = ui.select({ 'aria-label': 'Matéria a adicionar' }, subjectOptions(null), store.activeSubjects()[0] ? store.activeSubjects()[0].id : '');

    const list = cycle.length
      ? h('ol', {
        class: 'cycle-list',
        role: 'list',
      }, cycle.map((b, i) => blockRow(b, i, cycle.length, cursorId)))
      : ui.empty('Ciclo vazio', 'Adicione um bloco abaixo para começar.');

    return h('div', { class: 'page cycle-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Ciclo de estudos'),
          h('p', { class: 'muted' },
            `${cycle.length} bloco(s) · ${state.completedLoops + 1}º ciclo`,
            next ? ` · próximo: bloco ${pos} (${store.subjectName(next.subjectId)})` : '')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => store.cycleSetCursor(cycle[0] && cycle[0].id), disabled: !cycle.length || null }, 'Começar do bloco 1'),
          h('button', { class: 'btn ghost danger-text', type: 'button', onclick: async () => {
            const ok = await ui.confirmDialog({
              title: 'Restaurar ciclo padrão?',
              message: 'Os 30 blocos iniciais voltam e o próximo bloco será o 1. Os registros de estudo não são apagados.',
              confirmLabel: 'Restaurar',
              danger: true,
            });
            if (ok) store.cycleRestoreDefault();
          } }, 'Restaurar padrão'))),
      h('div', { class: 'cycle-grid' },
        h('section', { class: 'card' },
          h('header', { class: 'card-head' }, h('div', null,
            h('h3', null, 'Sequência'),
            h('p', { class: 'muted small' }, 'Arraste pela alça ⋮⋮ ou use as setas para reordenar. O bloco “Próximo” é o da próxima sessão.'))),
          h('form', {
            class: 'add-row',
            onsubmit: (e) => {
              e.preventDefault();
              if (addSelect.value) store.cycleAdd(addSelect.value, null);
            },
          }, addSelect, h('button', { class: 'btn', type: 'submit' }, ui.icon('plus'), 'Adicionar ao fim')),
          list),
        h('aside', { class: 'card' },
          h('header', { class: 'card-head' }, h('div', null,
            h('h3', null, 'Quantidade por matéria'),
            h('p', { class: 'muted small' }, 'Ajuste quantas vezes cada matéria aparece. Não há número fixo de blocos.'))),
          countPanel(cursorId, cycle))));
  }

  window.OAB.views.ciclo = view;
})();
