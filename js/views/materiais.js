/* Biblioteca de materiais: PDFs importados (guardados no IndexedDB do navegador) e cadastros manuais. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const forms = () => window.OAB.forms;

  const filters = { q: '', subjectId: '', source: '', status: '' };

  function openPdf(m) {
    store.getMaterialFile(m.id).then((blob) => {
      if (!blob) return ui.toast('Arquivo não encontrado neste navegador. Importe o PDF novamente.', 'warn');
      const url = URL.createObjectURL(blob);
      const page = ui.input({ type: 'number', min: '0', value: m.lastPage != null ? String(m.lastPage) : '', placeholder: 'Página', 'aria-label': 'Página em que parei' });
      const save = () => {
        const v = parseInt(page.value, 10);
        store.updateMaterial(m.id, { lastPage: Number.isFinite(v) && v >= 0 ? v : null });
        ui.toast('Página registrada.', 'ok');
      };
      ui.modal({
        title: m.title,
        subtitle: `${U.labelOf(U.MATERIAL_SOURCES, m.source)} · ${store.subjectName(m.subjectId)}`,
        wide: true,
        content: h('div', { class: 'viewer' },
          h('iframe', { src: url, title: m.title, class: 'pdf-frame' }),
          h('p', { class: 'small muted' }, 'Se o PDF não aparecer aqui, use “Abrir em nova aba”.')),
        footer: [
          h('div', { class: 'footer-left' },
            h('label', { class: 'inline-field' }, 'Página em que parei', page),
            h('button', { class: 'btn sm', type: 'button', onclick: save }, 'Salvar página')),
          h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, ui.icon('open'), 'Abrir em nova aba'),
        ],
        onClose: () => URL.revokeObjectURL(url),
      });
    }).catch(() => ui.toast('Não foi possível abrir o PDF neste navegador.', 'warn'));
  }

  function materialCard(m, cursorId) {
    const onBlock = (m.blockIds || []).includes(cursorId);
    const pct = { nao_iniciado: 0, em_andamento: 50, concluido: 100 }[m.status] || 0;
    return h('article', { class: `material-card src-${m.source} ${onBlock ? 'on-block' : ''}` },
      h('header', { class: 'material-head' },
        h('span', { class: `source-tag src-${m.source}` }, U.labelOf(U.MATERIAL_SOURCES, m.source)),
        onBlock ? ui.pill('Bloco atual', 'ok') : null),
      h('h3', null, m.title),
      h('p', { class: 'small muted' }, [store.subjectName(m.subjectId) !== 'Sem matéria' ? store.subjectName(m.subjectId) : null, store.topicLabel(m.topicId)].filter(Boolean).join(' · ') || 'Sem matéria'),
      m.description ? h('p', { class: 'material-desc' }, m.description) : null,
      h('div', { class: 'material-progress' },
        ui.progressBar(pct, m.status === 'concluido' ? 'ok' : m.status === 'em_andamento' ? 'accent' : 'neutral'),
        h('div', { class: 'small muted row-between' },
          h('span', null, m.lastPage != null ? `Parei na página ${m.lastPage}` : 'Sem página registrada'),
          h('span', null, U.labelOf(U.MATERIAL_STATUS, m.status)))),
      m.pendingPages ? h('p', { class: 'small' }, h('strong', null, 'Pendente: '), m.pendingPages) : null,
      m.hasFile ? h('p', { class: 'tiny muted' }, `${m.fileName} · ${U.fmtSize(m.fileSize)}`) : h('p', { class: 'tiny muted' }, 'Cadastro manual (sem arquivo)'),
      h('footer', { class: 'material-actions' },
        m.hasFile ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => openPdf(m) }, ui.icon('open'), 'Abrir PDF') : null,
        cursorId ? h('button', { class: `btn sm ${onBlock ? 'ghost' : ''}`, type: 'button', onclick: () => {
          store.toggleMaterialOnBlock(m.id, cursorId);
          ui.toast(onBlock ? 'Removido do bloco atual.' : 'Associado ao bloco atual.', 'ok');
        } }, onBlock ? 'Remover do bloco' : 'Associar ao bloco atual') : null,
        h('select', { class: 'input compact', 'aria-label': 'Status do material', onchange: (e) => store.updateMaterial(m.id, { status: e.target.value }) },
          U.MATERIAL_STATUS.map((st) => h('option', { value: st.id, selected: st.id === m.status || null }, st.label))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar material', title: 'Editar', onclick: () => forms().material(m) }, ui.icon('edit')),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir material', title: 'Excluir', onclick: async () => {
          const ok = await ui.confirmDialog({ title: 'Excluir material?', message: m.hasFile ? 'O PDF guardado neste navegador também será apagado.' : 'O cadastro será removido.', confirmLabel: 'Excluir', danger: true });
          if (ok) await store.deleteMaterial(m.id);
        } }, ui.icon('trash'))));
  }

  function view() {
    const s = store.getState();
    const cursor = store.cursorBlock();
    const cursorId = cursor ? cursor.id : null;
    const gridBox = h('div', { class: 'material-grid' });
    const counter = h('p', { class: 'muted small' });
    const draw = () => {
      ui.clear(gridBox);
      const list = s.materials.filter((m) => {
        if (filters.subjectId === '__none' ? m.subjectId : filters.subjectId && m.subjectId !== filters.subjectId) return false;
        if (filters.source && m.source !== filters.source) return false;
        if (filters.status && m.status !== filters.status) return false;
        if (filters.q) {
          const hay = U.normalize([m.title, m.description, m.notes, m.pendingPages, store.subjectName(m.subjectId), store.topicLabel(m.topicId)].join(' '));
          if (!hay.includes(U.normalize(filters.q))) return false;
        }
        return true;
      }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      counter.textContent = `${list.length} de ${s.materials.length} material(is)`;
      if (!list.length) {
        gridBox.appendChild(ui.empty(s.materials.length ? 'Nenhum material com estes filtros' : 'Biblioteca vazia',
          s.materials.length ? 'Ajuste os filtros.' : 'Importe PDFs do Gran Curso ou da Estratégia, ou cadastre um material manualmente.'));
        return;
      }
      list.forEach((m) => gridBox.appendChild(materialCard(m, cursorId)));
    };

    let fileInput = null;
    const importBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => fileInput.click() }, ui.icon('plus'), 'Importar PDFs');
    fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true, 'aria-hidden': 'true',
      onchange: (e) => { if (e.target.files && e.target.files.length) forms().upload(e.target.files, { subjectId: filters.subjectId, source: filters.source }); e.target.value = ''; } });

    const search = ui.input({ placeholder: 'Buscar por nome, descrição, pendência…', value: filters.q, 'aria-label': 'Buscar materiais' });
    search.addEventListener('input', () => { filters.q = search.value; draw(); });
    draw();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Biblioteca'),
          h('h1', { class: 'display-sm' }, 'Materiais de estudo'),
          h('p', { class: 'muted' }, 'PDFs do Gran Curso e da Estratégia, organizados por disciplina e assunto.')),
        h('div', { class: 'page-actions' },
          importBtn,
          h('button', { class: 'btn ghost', type: 'button', onclick: () => forms().material(null) }, 'Cadastrar manualmente'))),
      fileInput,
      h('div', { class: 'notice' }, 'Os PDFs ficam guardados somente neste navegador (IndexedDB). Nada é enviado a servidores. Em outro dispositivo, importe os arquivos de novo: o backup de Configurações guarda só os dados.'),
      h('div', { class: 'filters' },
        search,
        ui.select({ 'aria-label': 'Filtrar por disciplina', onchange: (e) => { filters.subjectId = e.target.value; draw(); } },
          [{ value: '', label: 'Todas as disciplinas' }, { value: '__none', label: 'Sem matéria' }, ...store.sortedSubjects().map((x) => ({ value: x.id, label: x.name }))], filters.subjectId),
        ui.select({ 'aria-label': 'Filtrar por origem', onchange: (e) => { filters.source = e.target.value; draw(); } },
          [{ value: '', label: 'Todas as origens' }, ...U.MATERIAL_SOURCES.map((x) => ({ value: x.id, label: x.label }))], filters.source),
        ui.select({ 'aria-label': 'Filtrar por status', onchange: (e) => { filters.status = e.target.value; draw(); } },
          [{ value: '', label: 'Qualquer status' }, ...U.MATERIAL_STATUS.map((x) => ({ value: x.id, label: x.label }))], filters.status)),
      counter,
      gridBox);
  }

  window.OAB.views.materiais = view;
})();
