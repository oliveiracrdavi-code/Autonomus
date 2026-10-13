/* Gráficos sem dependências: barras em CSS, linha e rosca em SVG. Todos recebem dados já calculados. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const U = window.OAB.lib.util;
  const NS = 'http://www.w3.org/2000/svg';

  const COLORS = {
    ok: '#16a34a',
    warn: '#d97706',
    bad: '#dc2626',
    primary: '#4f46e5',
    blank: '#cbd5e1',
    muted: '#64748b',
    grid: '#e2e8f0',
  };
  const toneOf = (pct) => (pct == null ? 'neutral' : pct < 50 ? 'bad' : pct < 70 ? 'warn' : 'ok');

  /**
   * Barras horizontais.
   * rows: [{ label, sub, value, max?, display, tone }]
   */
  function hbars(rows, { max, emptyText } = {}) {
    if (!rows.length) return ui.empty('Sem dados ainda', emptyText || 'Registre questões ou sessões para ver este gráfico.');
    const top = max || Math.max(...rows.map((r) => r.value), 1);
    return h('div', { class: 'hbars' }, rows.map((r) => {
      const width = Math.max(0, Math.min(100, (r.value / top) * 100));
      return h('div', { class: `hbar-row ${r.soft ? 'soft' : ''}`, title: r.soft ? 'Amostra pequena: interprete com cuidado' : null },
        h('div', { class: 'hbar-label' },
          h('span', { class: 'hbar-name', title: r.label }, r.label),
          r.sub ? h('span', { class: 'hbar-sub muted small' }, r.sub) : null),
        h('div', { class: 'hbar-track' },
          h('div', { class: `hbar-fill tone-${r.tone || 'primary'}`, style: { width: `${width}%` } })),
        h('div', { class: 'hbar-value' }, r.display));
    }));
  }

  /**
   * Linha com pontos.
   * points: [{ label, value, title }]; yMax/yMin fixos; refLines: [{ value, label }] linhas pontilhadas.
   */
  function line(points, { yMin = 0, yMax = 100, unit = '%', refLines = [], height = 240 } = {}) {
    if (!points.length) return ui.empty('Sem dados ainda', 'Os pontos aparecem quando houver registros com data.');
    const W = 640;
    const H = height;
    const padL = 44;
    const padR = 16;
    const padT = 16;
    const padB = 34;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const yFor = (v) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    const xFor = (i) => (points.length === 1 ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW);
    const el = (name, attrs, text) => {
      const n = document.createElementNS(NS, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      if (text != null) n.textContent = text;
      return n;
    };

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet' });
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = yMin + ((yMax - yMin) * t) / ticks;
      const y = yFor(v);
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: COLORS.grid }));
      svg.appendChild(el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-text' }, `${Math.round(v)}${unit}`));
    }
    refLines.forEach((ref) => {
      const y = yFor(ref.value);
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: COLORS.warn, 'stroke-dasharray': '6 5' }));
      svg.appendChild(el('text', { x: W - padR, y: y - 5, 'text-anchor': 'end', class: 'ref-text' }, ref.label));
    });

    const step = Math.ceil(points.length / 8);
    points.forEach((p, i) => {
      if (i % step === 0 || i === points.length - 1) {
        svg.appendChild(el('text', { x: xFor(i), y: H - 10, 'text-anchor': 'middle', class: 'axis-text' }, p.label));
      }
    });

    if (points.length > 1) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: COLORS.primary, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    }
    points.forEach((p, i) => {
      const c = el('circle', { cx: xFor(i), cy: yFor(p.value), r: 5, fill: '#fff', stroke: COLORS.primary, 'stroke-width': 2.5 });
      const title = el('title', {}, p.title || `${p.label}: ${p.value}`);
      c.appendChild(title);
      svg.appendChild(c);
    });

    return h('div', { class: 'chart-wrap' }, svg);
  }

  /**
   * Rosca com legenda.
   * parts: [{ label, value, color }]
   */
  function donut(parts, { centerValue, centerLabel } = {}) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) return ui.empty('Sem dados ainda', 'Registre questões para ver a proporção entre certas e erradas.');
    const R = 52;
    const C = 2 * Math.PI * R;
    let offset = 0;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 140 140');
    svg.setAttribute('class', 'donut-svg');
    svg.setAttribute('role', 'img');
    const bg = document.createElementNS(NS, 'circle');
    bg.setAttribute('cx', 70); bg.setAttribute('cy', 70); bg.setAttribute('r', R);
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', COLORS.grid); bg.setAttribute('stroke-width', 16);
    svg.appendChild(bg);
    parts.filter((p) => p.value > 0).forEach((p) => {
      const len = (p.value / total) * C;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', 70); c.setAttribute('cy', 70); c.setAttribute('r', R);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', p.color); c.setAttribute('stroke-width', 16);
      c.setAttribute('stroke-dasharray', `${len} ${C - len}`);
      c.setAttribute('stroke-dashoffset', String(-offset));
      c.setAttribute('transform', 'rotate(-90 70 70)');
      const t = document.createElementNS(NS, 'title');
      t.textContent = `${p.label}: ${p.value} (${((p.value / total) * 100).toFixed(1).replace('.', ',')}%)`;
      c.appendChild(t);
      svg.appendChild(c);
      offset += len;
    });
    const center = document.createElementNS(NS, 'text');
    center.setAttribute('x', 70); center.setAttribute('y', 68); center.setAttribute('text-anchor', 'middle');
    center.setAttribute('class', 'donut-center');
    center.textContent = centerValue != null ? centerValue : U.fmtInt(total);
    svg.appendChild(center);
    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', 70); sub.setAttribute('y', 86); sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('class', 'donut-sub');
    sub.textContent = centerLabel || 'questões';
    svg.appendChild(sub);

    return h('div', { class: 'donut' },
      svg,
      h('ul', { class: 'legend' }, parts.map((p) => h('li', null,
        h('span', { class: 'swatch', style: { background: p.color } }),
        h('span', { class: 'legend-label' }, p.label),
        h('strong', null, U.fmtInt(p.value)),
        h('span', { class: 'muted small' }, ` · ${((p.value / total) * 100).toFixed(1).replace('.', ',')}%`)))));
  }

  Object.assign(ui, { charts: { hbars, line, donut, toneOf, COLORS } });
})();
