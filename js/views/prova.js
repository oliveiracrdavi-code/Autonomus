/* Modo prova: simulado cronometrado com gabarito C/E/B. O cronômetro é um lembrete, não encerra a prova sozinho. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const P = window.OAB.lib.prova;

  const MARK_LABEL = { C: 'Certa', E: 'Errada', B: 'Em branco' };

  function setupView() {
    const s = store.getState();
    const name = ui.input({ name: 'name', value: 'Simulado cronometrado', 'aria-label': 'Nome do simulado' });
    const total = ui.number({ name: 'total', min: '10', max: '200', value: s.settings.provaQuestions || 80, 'aria-label': 'Número de questões' });
    const limit = ui.number({ name: 'limit', min: '10', max: '720', value: s.settings.provaMin || 300, 'aria-label': 'Tempo limite em minutos' });
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); start(); } },
      ui.field('Nome', name, { name: 'name', full: true }),
      ui.field('Número de questões', total, { name: 'total', hint: 'Use o número da prova que você vai simular.' }),
      ui.field('Tempo limite (min)', limit, { name: 'limit', hint: 'Ajustável. Você pode mudar o padrão em Configurações.' }));
    function start() {
      const t = parseInt(total.value, 10);
      const m = parseInt(limit.value, 10);
      if (!(t >= 10 && t <= 200)) return ui.toast('Use entre 10 e 200 questões.', 'warn');
      if (!(m >= 10 && m <= 720)) return ui.toast('Use entre 10 e 720 minutos.', 'warn');
      store.update((st) => { st.settings.provaQuestions = t; st.settings.provaMin = m; });
      store.startDraft({ name: name.value.trim() || 'Simulado cronometrado', total: t, limitMin: m });
      ui.toast('Prova iniciada. Marque C, E ou B conforme responde.', 'ok');
    }
    return ui.card('Nova prova cronometrada', h('div', { class: 'stack' },
      form,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary lg', type: 'button', onclick: start }, ui.icon('play'), 'Iniciar prova')),
      h('p', { class: 'small muted footnote' }, 'Ao concluir, o resultado vira um simulado na tela de Simulados, com o total por resposta. O rascunho fica salvo se você fechar o app.')),
      { sub: 'Cronômetro, gabarito e salvamento automático' });
  }

  function openPaste(draft) {
    const area = ui.textarea({ rows: 4, placeholder: 'Ex.: CCEBCCECBE…  (C = certa, E = errada, B = em branco)', 'aria-label': 'Gabarito colado' });
    const info = h('p', { class: 'small muted' });
    area.addEventListener('input', () => {
      const g = P.parseGabarito(area.value, draft.total);
      info.textContent = `${g.read} questão(ões) lidas.${g.invalid.length ? ` Caracteres ignorados: ${g.invalid.join(' ')}.` : ''}${g.extra ? ` ${g.extra} caractere(s) além do total serão ignorados.` : ''}`;
    });
    ui.modal({
      title: 'Colar gabarito',
      subtitle: 'Cole sequências de C, E e B. Os espaços são ignorados.',
      content: h('div', { class: 'stack' }, area, info),
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          const g = P.parseGabarito(area.value, draft.total);
          if (!g.read) return ui.toast('Nada para aplicar.', 'warn');
          store.setDraftAnswers(g.answers);
          ui.closeModal();
          ui.toast(`${g.read} marcação(ões) aplicadas.`, 'ok');
        } }, 'Aplicar'),
      ],
    });
  }

  function finishFlow(draft) {
    const t = P.totals(draft.answers, draft.total);
    const body = h('div', { class: 'stack' },
      h('div', { class: 'finish-summary' },
        h('div', null, h('span', { class: 'muted small' }, 'Certas'), h('strong', { class: 'ok-text' }, String(t.correct))),
        h('div', null, h('span', { class: 'muted small' }, 'Erradas'), h('strong', { class: 'bad-text' }, String(t.wrong))),
        h('div', null, h('span', { class: 'muted small' }, 'Em branco'), h('strong', null, String(t.blankFinal)))),
      h('p', { class: 'muted' }, `Aproveitamento: ${U.fmtPct(U.pctOf(t.correct, draft.total))}.`),
      t.unmarked ? h('p', { class: 'notice warn' }, `${t.unmarked} questão(ões) não marcada(s) vão contar como em branco.`) : null);
    ui.modal({
      title: 'Concluir prova?',
      subtitle: draft.name,
      content: body,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Voltar à prova'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          const res = store.finishDraft();
          ui.closeModal();
          if (res) ui.toast(`Simulado salvo: ${res.totals.correct} acertos de ${draft.total}.`, 'ok');
          window.OAB.app.go('simulados');
        } }, ui.icon('check'), 'Concluir e salvar'),
      ],
    });
  }

  function runView(draft, ctx) {
    const total = draft.total;
    const tiles = [];
    const counters = {};
    const clock = h('p', { class: 'clock prova-clock' }, '00:00:00');
    const status = ui.pill('', 'ok');
    const pauseBtn = h('button', { class: 'btn', type: 'button', onclick: () => { store.toggleDraftRunning(); } });
    const countBox = h('div', { class: 'prova-counts' },
      ['C', 'E', 'B', null].map((k) => {
        const el = h('strong', null, '0');
        counters[k || 'U'] = el;
        return h('div', null, h('span', { class: 'muted small' }, k ? MARK_LABEL[k] : 'Não marcadas'), el);
      }));
    const progress = ui.progressBar(0, 'primary');

    const grid = h('div', { class: 'prova-grid', role: 'group', 'aria-label': 'Questões' });
    for (let n = 1; n <= total; n++) {
      const btn = h('button', {
        type: 'button', class: 'prova-tile', 'data-n': n,
        'aria-label': `Questão ${n}`,
        onclick: () => { store.setDraftMarkQuiet(n, P.nextMark(store.getState().draft.answers[n])); paint(); },
        onkeydown: (ev) => {
          const k = ev.key.toLowerCase();
          if (k === 'c' || k === 'e' || k === 'b') { ev.preventDefault(); store.setDraftMarkQuiet(n, k.toUpperCase()); paint(); focusTile(n + 1); }
          else if (k === 'backspace' || k === 'delete' || k === '0') { ev.preventDefault(); store.setDraftMarkQuiet(n, null); paint(); }
          else if (k === 'arrowright') { ev.preventDefault(); focusTile(n + 1); }
          else if (k === 'arrowleft') { ev.preventDefault(); focusTile(n - 1); }
        },
      }, String(n));
      tiles.push(btn);
      grid.appendChild(btn);
    }
    const focusTile = (n) => { const el = grid.querySelector(`[data-n="${n}"]`); if (el) el.focus(); };

    const paint = () => {
      const cur = store.getState().draft;
      if (!cur || cur.id !== draft.id) return;
      const now = Date.now();
      const elapsedMs = P.elapsed(cur, now);
      const limitMs = cur.limitMin * 60000;
      const remaining = limitMs - elapsedMs;
      clock.textContent = remaining >= 0 ? U.fmtClock(remaining) : `+${U.fmtClock(-remaining)}`;
      clock.classList.toggle('overtime', remaining < 0);
      clock.classList.toggle('low', remaining >= 0 && remaining < limitMs * 0.1);
      status.textContent = cur.runningSince != null ? 'Rodando' : 'Pausada';
      status.className = `pill ${cur.runningSince != null ? 'ok' : 'warn'}`;
      pauseBtn.textContent = cur.runningSince != null ? 'Pausar' : 'Retomar';
      const t = P.totals(cur.answers, total);
      counters.C.textContent = String(t.correct);
      counters.E.textContent = String(t.wrong);
      counters.B.textContent = String(t.blank);
      counters.U.textContent = String(t.unmarked);
      progress.firstChild.style.width = `${Math.round((t.marked / total) * 100)}%`;
      tiles.forEach((btn, i) => {
        const m = cur.answers[i + 1] || '';
        btn.className = `prova-tile ${m ? `m-${m}` : ''}`;
        btn.setAttribute('aria-label', `Questão ${i + 1}: ${m ? MARK_LABEL[m] : 'não marcada'}`);
      });
    };

    const page = h('div', { class: 'page prova-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Modo prova'),
          h('h1', { class: 'display-sm' }, draft.name),
          h('p', { class: 'muted' }, `${total} questões · limite de ${draft.limitMin} min · marque C, E ou B. Atalhos: C, E, B e setas.`)),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => openPaste(draft) }, 'Colar gabarito'),
          h('button', { class: 'btn ghost danger-text', type: 'button', onclick: async () => {
            const ok = await ui.confirmDialog({ title: 'Descartar prova?', message: 'As marcações e o tempo desta prova serão apagados.', confirmLabel: 'Descartar', danger: true });
            if (ok) store.discardDraft();
          } }, 'Descartar'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => finishFlow(draft) }, ui.icon('check'), 'Concluir prova'))),
      h('div', { class: 'prova-layout' },
        h('section', { class: 'card prova-timer' },
          h('div', { class: 'timer-head' }, status, h('span', { class: 'muted small' }, `Iniciada em ${U.fmtDateTime(draft.startedAt)}`)),
          clock,
          h('p', { class: 'small muted' }, 'O tempo é um lembrete. Ao passar do limite, a contagem continua em +.'),
          progress,
          countBox,
          h('div', { class: 'actions' }, pauseBtn)),
        h('section', { class: 'card' },
          h('div', { class: 'prova-legend' },
            h('span', { class: 'pill ok' }, 'C certa'), h('span', { class: 'pill bad' }, 'E errada'), h('span', { class: 'pill neutral' }, 'B em branco')),
          grid)));

    paint();
    const tick = setInterval(paint, 1000);
    ctx.onLeave(() => clearInterval(tick));
    return page;
  }

  function view(params, ctx) {
    const draft = store.getState().draft;
    if (!draft) {
      return h('div', { class: 'page' },
        h('div', { class: 'page-head' }, h('div', null,
          h('p', { class: 'eyebrow' }, 'Desempenho'),
          h('h1', { class: 'display-sm' }, 'Modo prova'),
          h('p', { class: 'muted' }, 'Simule a prova de verdade: tempo, marcações e resultado no mesmo lugar.'))),
        setupView());
    }
    return runView(draft, ctx);
  }

  window.OAB.views.prova = view;
})();
