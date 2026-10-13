/* Shell da aplicação: roteamento por hash, navegação lateral, barra superior, paleta de comandos (Ctrl+K) e inicialização. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;

  const ROUTES = [
    { id: 'hoje', label: 'Hoje', icon: 'home', group: 'Estudo' },
    { id: 'semana', label: 'Calendário semanal', icon: 'grid', group: 'Estudo' },
    { id: 'questoes', label: 'Questões', icon: 'list', group: 'Questões' },
    { id: 'caderno', label: 'Caderno de erros', icon: 'book', group: 'Questões', badge: () => store.openErrorsCount() || null },
    { id: 'materias', label: 'Matérias e assuntos', icon: 'grid', group: 'Conteúdo' },
    { id: 'tutor', label: 'Tutor de estudo', icon: 'chat', group: 'Inteligência' },
    { id: 'config', label: 'Configurações', icon: 'gear', group: 'Sistema' },
    // Fora do menu para enxugar o app: continuam acessíveis pelo endereço, mas não aparecem na navegação.
    { id: 'inicio', label: 'Painel completo', icon: 'home', group: 'Estudo', hidden: true },
    { id: 'sessao', label: 'Sessão de estudo', icon: 'timer', group: 'Estudo', hidden: true },
    { id: 'ciclo', label: 'Ciclo de estudos', icon: 'cycle', group: 'Estudo', hidden: true },
    { id: 'sessoes', label: 'Histórico de sessões', icon: 'history', group: 'Estudo', hidden: true },
    { id: 'revisao', label: 'Revisão semanal', icon: 'refresh', group: 'Questões', hidden: true },
    { id: 'flashcards', label: 'Flashcards', icon: 'cards', group: 'Questões', hidden: true, badge: () => { const st = store.getState(); const f = window.OAB.lib.flashcards; const n = f.summary(st.errors, st.cards, U.todayISO()).due; return n || null; } },
    { id: 'materiais', label: 'Materiais (PDF)', icon: 'file', group: 'Conteúdo', hidden: true },
    { id: 'simulados', label: 'Simulados e metas', icon: 'target', group: 'Desempenho', hidden: true },
    { id: 'prova', label: 'Modo prova', icon: 'timer', group: 'Desempenho', hidden: true, badge: () => (store.getState().draft ? '•' : null) },
    { id: 'relatorio', label: 'Relatório e exportação', icon: 'file', group: 'Desempenho', hidden: true },
  ];

  let leaveFns = [];
  const onLeave = (fn) => leaveFns.push(fn);
  const go = (id) => { location.hash = `#/${id}`; };

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, ...params] = raw.split('/').map((p) => {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    const route = ROUTES.find((r) => r.id === name) || ROUTES[0];
    return { route, params };
  }

  function renderNav(activeId) {
    const nav = document.getElementById('nav');
    ui.clear(nav);
    let group = null;
    ROUTES.filter((r) => !r.hidden).forEach((r) => {
      if (r.group !== group) {
        group = r.group;
        nav.appendChild(h('p', { class: 'nav-group' }, group));
      }
      const badge = r.badge ? r.badge() : null;
      nav.appendChild(h('a', {
        href: `#/${r.id}`,
        class: `nav-link ${r.id === activeId ? 'active' : ''}`,
        'aria-current': r.id === activeId ? 'page' : null,
        onclick: () => document.body.classList.remove('nav-open'),
      }, ui.icon(r.icon), h('span', null, r.label), badge ? h('span', { class: 'nav-badge' }, String(badge)) : null));
    });
  }

  function renderTopbar(route) {
    document.getElementById('page-title').textContent = route.label;
    const chip = document.getElementById('status-chip');
    ui.clear(chip);
    const s = store.activeSession();
    if (s) {
      chip.appendChild(h('a', { href: '#/sessao', class: `status-chip ${s.status === 'ativa' ? 'live' : 'paused'}` },
        h('span', { class: 'dot' }),
        s.status === 'ativa' ? 'Sessão em andamento' : 'Sessão pausada',
        h('span', { class: 'muted' }, ` · ${store.subjectName(s.subjectId)}`)));
    } else {
      // o chip segue a mesma sugestão da tela Hoje (o ciclo antigo não aparece mais no menu)
      const st = store.getState();
      const nameOf = (id) => { const x = store.subjectById(id); return x ? x.name : 'Disciplina removida'; };
      const isActive = (id) => { const x = store.subjectById(id); return !!x && !x.archived; };
      const topicOf = (id) => { const t = store.suggestedTopic(id); return t ? t.name : null; };
      const sug = window.OAB.lib.week.suggestion(st.week, U.todayISO(), nameOf, window.OAB.lib.analytics.priorities(st), topicOf, isActive);
      chip.appendChild(h('a', { href: '#/hoje', class: 'status-chip' },
        h('span', { class: 'dot idle' }),
        sug.title));
    }
  }

  function render(preserveScroll) {
    const { route, params } = parseHash();
    leaveFns.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    leaveFns = [];
    const y = preserveScroll ? window.scrollY : 0;
    const root = document.getElementById('view');
    ui.clear(root);
    try {
      const view = window.OAB.views[route.id];
      root.appendChild(view(params, { onLeave }));
    } catch (err) {
      console.error(err);
      root.appendChild(ui.empty('Não foi possível exibir esta tela', `Erro: ${err.message}`,
        h('a', { class: 'btn', href: '#/hoje' }, 'Voltar ao início')));
    }
    renderNav(route.id);
    renderTopbar(route);
    document.title = `${route.label} · OAB Estudos`;
    window.scrollTo(0, y);
  }

  const refresh = () => render(true);

  /* ---------- paleta de comandos ---------- */
  function paletteCommands() {
    const cmds = ROUTES.filter((r) => !r.hidden).map((r) => ({ label: `Ir para ${r.label}`, hint: 'navegar', keys: r.label, run: () => go(r.id) }));
    cmds.push(
      { label: 'Novo registro de questões', hint: 'questões', keys: 'registrar questoes bloco', run: () => window.OAB.forms.log(null, { mode: 'bloco' }) },
      { label: 'Questão individual', hint: 'questões', keys: 'questao individual acerto erro chute', run: () => window.OAB.forms.log(null, { mode: 'individual' }) },
      { label: 'Novo item no caderno de erros', hint: 'caderno', keys: 'erro caderno', run: () => window.OAB.forms.errorEntry(null) },
      { label: 'Nova disciplina', hint: 'matérias', keys: 'materia disciplina', run: () => window.OAB.forms.subject(null) },
      { label: 'Exportar backup', hint: 'sistema', keys: 'backup exportar json', run: () => { ui.download(`oab-estudos-backup-${U.todayISO()}.json`, store.exportBackup()); ui.toast('Backup exportado.', 'ok'); } },
    );
    return cmds;
  }

  /** Busca global: disciplinas, assuntos, materiais, itens do caderno e registros de questões. */
  function searchItems(q) {
    const needle = U.normalize(q);
    if (needle.length < 2) return [];
    const st = store.getState();
    const has = (...parts) => U.normalize(parts.filter(Boolean).join(' ')).includes(needle);
    const hits = [];
    const add = (label, hint, route) => hits.push({ label, hint, keys: '', run: () => go(route) });
    st.subjects.forEach((x) => { if (has(x.name)) add(x.name, 'disciplina', `materias/${x.id}`); });
    st.topics.forEach((t) => { if (has(t.name, t.source, t.notes)) add(t.name, `assunto · ${store.subjectName(t.subjectId)}`, `materias/${t.subjectId}`); });
    st.materials.forEach((m) => { if (has(m.title, m.description, m.notes, m.pendingPages)) add(m.title, 'material (PDF)', 'materiais'); });
    st.errors.forEach((e) => { if (has(e.ref, e.subtopic, e.rule, e.reason, e.note)) add(`${e.ref || 'Item'} · ${e.subtopic || store.topicLabel(e.topicId) || store.subjectName(e.subjectId)}`, 'caderno de erros', 'caderno'); });
    st.logs.forEach((l) => { if (has(l.subtopic, l.banca, l.prova, l.notes)) add(`${l.subtopic || l.prova || 'Registro'} · ${store.subjectName(l.subjectId)}`, `questões · ${U.fmtDate(l.date)}`, 'questoes'); });
    return hits.slice(0, 10);
  }

  let paletteEl = null;
  function closePalette() {
    if (paletteEl) paletteEl.remove();
    paletteEl = null;
  }

  function openPalette() {
    if (paletteEl) return closePalette();
    const cmds = paletteCommands();
    let active = 0;
    let shown = cmds;
    const input = h('input', { class: 'palette-input', type: 'text', placeholder: 'Digite um comando ou tela…', 'aria-label': 'Buscar comando', autocomplete: 'off' });
    const list = h('ul', { class: 'palette-list', role: 'listbox' });
    const draw = () => {
      ui.clear(list);
      const q = U.normalize(input.value);
      const cmdHits = cmds.filter((c) => !q || U.normalize(`${c.label} ${c.keys} ${c.hint}`).includes(q));
      shown = [...cmdHits, ...searchItems(input.value)];
      active = Math.min(active, Math.max(0, shown.length - 1));
      if (!shown.length) list.appendChild(h('li', { class: 'palette-item muted' }, 'Nada encontrado.'));
      shown.slice(0, 12).forEach((c, i) => list.appendChild(h('li', {
        class: `palette-item ${i === active ? 'active' : ''}`, role: 'option', 'aria-selected': i === active ? 'true' : 'false',
        onmouseenter: () => { active = i; draw(); },
        onclick: () => runAt(i),
      }, h('span', null, c.label), h('small', null, c.hint))));
    };
    const runAt = (i) => {
      const c = shown[i];
      if (!c) return;
      closePalette();
      c.run();
    };
    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); runAt(active); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    paletteEl = h('div', { class: 'palette-overlay', onclick: (e) => { if (e.target === paletteEl) closePalette(); } },
      h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Paleta de comandos' },
        input, list,
        h('div', { class: 'palette-foot' }, h('span', null, '↑ ↓ navegar'), h('span', null, 'Enter executar'), h('span', null, 'Esc fechar'))));
    document.body.appendChild(paletteEl);
    draw();
    input.focus();
  }

  function onGlobalKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
      document.body.classList.remove('focus-mode');
    }
  }

  function showStorageNotices() {
    if (store.loadNotice()) ui.toast(store.loadNotice(), 'warn');
    if (!store.isPersistent()) ui.toast('Não foi possível salvar no navegador. Exporte um backup em Configurações.', 'warn');
  }

  function boot() {
    store.init();
    window.OAB.app = { render, refresh, onLeave, ROUTES, go, openPalette };
    store.subscribe(() => refresh());
    document.getElementById('menu-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    document.getElementById('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
    document.getElementById('palette-open').addEventListener('click', openPalette);
    document.addEventListener('keydown', onGlobalKey);
    window.addEventListener('hashchange', () => render(false));
    setInterval(() => renderTopbar(parseHash().route), 60000);
    render(false);
    showStorageNotices();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
