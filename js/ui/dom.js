/* Helpers de interface: criação de elementos (texto sempre escapado), modais, avisos e formulários. */
(function () {
  const ui = (window.OAB.ui = window.OAB.ui || {});

  /**
   * h('tag', { class, onclick, value, ... }, ...filhos)
   * Strings viram nós de texto (seguros). Arrays e null/false são aceitos como filhos.
   */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    let deferredValue;
    let hasValue = false;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') {
          deferredValue = v;
          hasValue = true;
        } else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    append(el, children);
    if (hasValue) el.value = deferredValue;
    return el;
  }

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  const clear = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  /* ---------- ícones (SVG fixo, sem dados do usuário) ---------- */
  const ICONS = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-13v5l3 2M9 2h6',
    cycle: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    book: 'M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM4 16a4 4 0 0 1 4-4h10',
    cards: 'M3 7h13v11H3zM8 3h13v11M7 12h5',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
    file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3l2-1-2-4-2 1a7 7 0 0 0-2-1l-.5-2.5h-4L10 7a7 7 0 0 0-2 1L6 7 4 11l2 1a7 7 0 0 0 0 2l-2 1 2 4 2-1a7 7 0 0 0 2 1l.5 2.5h4L14 19a7 7 0 0 0 2-1l2 1 2-4-2-1a7 7 0 0 0 0-2z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    up: 'M12 19V5M5 12l7-7 7 7',
    down: 'M12 5v14M19 12l-7 7-7-7',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    copy: 'M9 9h11v11H9zM4 15V4h11',
    drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
    open: 'M14 3h7v7M10 14L21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7',
    check: 'M5 12l5 5L20 7',
    pause: 'M9 5v14M15 5v14',
    play: 'M7 4l13 8-13 8z',
    stop: 'M6 6h12v12H6z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2l5 5',
    arrowUp: 'M7 14l5-5 5 5',
    arrowDown: 'M7 10l5 5 5-5',
    archive: 'M3 4h18v4H3zM5 8v12h14V8M9 12h6',
  };

  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `icon ${cls || ''}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || '');
    svg.appendChild(path);
    return svg;
  }

  /* ---------- avisos e modais ---------- */
  function toast(message, kind) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const el = h('div', { class: `toast ${kind || ''}`, role: 'status' }, message);
    root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4000);
  }

  let current = null;

  /**
   * Abre um modal. `content` é um nó; `footer` é uma lista de nós de botão.
   * Retorna { close }. Fecha com Esc, com o botão X ou clicando fora.
   */
  function modal({ title, content, footer, wide, onClose, subtitle }) {
    closeModal();
    const previouslyFocused = document.activeElement;
    const titleId = `m-${Date.now()}`;
    const close = () => {
      if (!current) return;
      const { backdrop, onKey } = current;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      current = null;
      if (onClose) onClose();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const backdrop = h(
      'div',
      { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
      h(
        'div',
        { class: `modal ${wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('header', { class: 'modal-head' },
          h('div', null,
            h('h2', { id: titleId }, title),
            subtitle ? h('p', { class: 'muted small' }, subtitle) : null),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: close }, icon('close'))),
        h('div', { class: 'modal-body' }, content),
        footer && footer.length ? h('footer', { class: 'modal-foot' }, footer) : null,
      ),
    );
    document.getElementById('modal-root').appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    current = { backdrop, onKey, close };
    const firstInput = backdrop.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
    if (firstInput) firstInput.focus();
    return { close };
  }

  function closeModal() {
    if (current) current.close();
  }

  /** Caixa de confirmação. Resolve true/false. */
  function confirmDialog({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      modal({
        title,
        content: h('p', null, message),
        footer: [
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { closeModal(); done(false); } }, 'Cancelar'),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => { closeModal(); done(true); } }, confirmLabel || 'Confirmar'),
        ],
        onClose: () => done(false),
      });
    });
  }

  /* ---------- formulários ---------- */
  /** Lê todos os campos de um formulário como objeto. Checkboxes viram boolean. */
  function readForm(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
        else if (!(el.name in out)) out[el.name] = null;
      } else out[el.name] = el.value;
    }
    return out;
  }

  /** Marca erros de validação nos campos e mostra a mensagem junto de cada um. */
  function showErrors(form, errors) {
    form.querySelectorAll('[data-error-for]').forEach((n) => {
      n.textContent = '';
      n.hidden = true;
    });
    form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const holder = form.querySelector(`[data-error-for="${name}"]`);
      if (holder) {
        holder.textContent = msg;
        holder.hidden = false;
      }
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      }
    });
    if (first) first.focus();
    return !!first;
  }

  /**
   * Campo com rótulo, dica e espaço para erro.
   * `control` é um nó de input/select/textarea com `name` definido.
   */
  function field(label, control, { hint, name, full, error } = {}) {
    const id = `f-${name || Math.random().toString(36).slice(2)}`;
    control.id = id;
    const errId = `${id}-err`;
    return h('div', { class: `field ${full ? 'full' : ''}` },
      h('label', { for: id }, label),
      control,
      hint ? h('p', { class: 'hint' }, hint) : null,
      h('p', { class: 'field-error', 'data-error-for': name, id: errId, hidden: true }),
      error ? h('p', { class: 'field-error' }, error) : null,
    );
  }

  function input(attrs) {
    return h('input', { class: 'input', type: 'text', ...attrs });
  }

  function number(attrs) {
    return h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1', ...attrs });
  }

  function select(attrs, options, value) {
    const el = h('select', { class: 'input', ...attrs },
      options.map((o) => h('option', { value: o.value }, o.label)));
    el.value = value == null ? '' : String(value);
    return el;
  }

  function textarea(attrs) {
    return h('textarea', { class: 'input', rows: 3, ...attrs });
  }

  /** Lista de opções para datalist (sugestões digitáveis). */
  function datalist(id, values) {
    const uniq = [...new Set(values.filter(Boolean))];
    return h('datalist', { id }, uniq.map((v) => h('option', { value: v })));
  }

  /* ---------- peças de layout ---------- */
  const pill = (text, tone) => h('span', { class: `pill ${tone || ''}` }, text);
  const pctTone = (pct) => (pct == null ? 'neutral' : pct < 50 ? 'bad' : pct < 70 ? 'warn' : 'ok');

  function empty(title, text, action) {
    return h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, title),
      text ? h('p', { class: 'muted' }, text) : null,
      action || null);
  }

  function card(title, body, { actions, id, sub, cls } = {}) {
    return h('section', { class: `card ${cls || ''}`, id: id || null },
      title || actions ? h('header', { class: 'card-head' },
        h('div', null,
          title ? h('h3', null, title) : null,
          sub ? h('p', { class: 'muted small' }, sub) : null),
        actions ? h('div', { class: 'card-actions' }, actions) : null) : null,
      body);
  }

  function stat(label, value, sub, tone) {
    return h('div', { class: `stat ${tone || ''}` },
      h('p', { class: 'stat-label' }, label),
      h('p', { class: 'stat-value' }, value),
      sub ? h('p', { class: 'stat-sub muted small' }, sub) : null);
  }

  function progressBar(pct, tone) {
    const v = Math.max(0, Math.min(100, pct || 0));
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(v)) },
      h('div', { class: `progress-fill ${tone || 'primary'}`, style: { width: `${v}%` } }));
  }

  function tabs(items, active, onSelect) {
    return h('div', { class: 'tabs', role: 'tablist' },
      items.map((it) => h('button', {
        class: `tab ${it.id === active ? 'active' : ''}`,
        role: 'tab',
        type: 'button',
        'aria-selected': it.id === active ? 'true' : 'false',
        onclick: () => onSelect(it.id),
      }, it.label)));
  }

  /** Download de texto como arquivo. */
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  Object.assign(ui, {
    h, append, clear, icon, toast, modal, closeModal, confirmDialog,
    readForm, showErrors, field, input, number, select, textarea, datalist,
    pill, pctTone, empty, card, stat, progressBar, tabs, download,
  });
})();
