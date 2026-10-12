/* Sessão de estudo: cronômetro por fase, pausa/retomada, checklist de conclusão.
 * O tempo previsto apenas sinaliza; nunca troca de fase nem avança o ciclo sozinho. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const S = window.OAB.lib.session;

  const PHASE_LABEL = { teoria: 'Teoria', questoes: 'Questões' };

  /** Próximo bloco depois do bloco desta sessão (para mostrar no fechamento). */
  function nextBlockAfter(blockId) {
    const cycle = store.getState().cycle;
    const i = cycle.findIndex((b) => b.id === blockId);
    if (i < 0 || !cycle.length) return null;
    return cycle[(i + 1) % cycle.length];
  }

  function materialsForSession(s) {
    const state = store.getState();
    const byBlock = store.materialsForBlock(s.blockId);
    const bySubject = state.materials.filter((m) => m.subjectId === s.subjectId);
    const seen = new Set();
    return [...byBlock, ...bySubject].filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
  }

  function openFinishModal(s) {
    const state = store.getState();
    const logCount = state.logs.filter((l) => l.sessionId === s.id).length;
    const errorCount = state.errors.filter((e) => e.sessionId === s.id).length;
    const suggestion = S.suggestChecklist(s, { logCount, errorCount });
    const topics = store.topicsOf(s.subjectId);
    const materials = materialsForSession(s);
    const selectedMats = new Set(s.materialIds || []);
    const next = nextBlockAfter(s.blockId);
    const pendingBox = h('div', { class: 'pending-box' });

    const checklistItems = U.CHECKLIST.map((item) => h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', name: item.key, checked: suggestion[item.key] || null }),
      h('span', null, item.label)));

    const matItems = materials.length
      ? materials.map((m) => h('label', { class: 'check-row' },
        h('input', { type: 'checkbox', name: `mat_${m.id}`, checked: selectedMats.has(m.id) || null }),
        h('span', null, m.title)))
      : [h('p', { class: 'muted small' }, 'Nenhum material cadastrado para esta matéria. Você pode cadastrar em Materiais.')];

    const topicSelect = ui.select({ name: 'topicId' }, [
      { value: '', label: '— sem assunto —' },
      ...topics.map((t) => ({ value: t.id, label: t.name })),
    ], s.topicId || '');

    const form = h('form', { class: 'finish-form', novalidate: true },
      h('div', { class: 'finish-summary' },
        h('div', null, h('span', { class: 'muted small' }, 'Teoria'), h('strong', null, U.fmtMinutes(store.sessionElapsed(s).teoria))),
        h('div', null, h('span', { class: 'muted small' }, 'Questões'), h('strong', null, U.fmtMinutes(store.sessionElapsed(s).questoes))),
        h('div', null, h('span', { class: 'muted small' }, 'Total'), h('strong', null, U.fmtMinutes(store.sessionElapsed(s).total)))),
      h('div', { class: 'two-col' },
        h('div', null,
          h('h4', null, 'Checklist da sessão'),
          h('p', { class: 'muted small' }, 'Sugerido com base no que já foi registrado. Você pode ajustar.'),
          h('div', { class: 'checks' }, checklistItems)),
        h('div', null,
          h('h4', null, 'Materiais utilizados'),
          h('div', { class: 'checks' }, matItems))),
      pendingBox,
      h('div', { class: 'two-col' },
        ui.field('Assunto estudado', topicSelect, { name: 'topicId', full: false }),
        h('label', { class: 'check-row align-end' },
          h('input', { type: 'checkbox', name: 'markTopicStudied' }),
          h('span', null, 'Marcar este assunto como estudado'))),
      ui.field('Anotações da sessão', ui.textarea({ name: 'notes', value: s.notes || '' }), { name: 'notes', full: true }),
      h('p', { class: 'notice' },
        'Ao concluir, o ciclo avança para o próximo bloco',
        next ? h('strong', null, ` — ${store.subjectName(next.subjectId)} (bloco ${store.blockPosition(next.id)})`) : '',
        '. Pendências ficam registradas no histórico, sem impedir a conclusão.'),
    );

    const paintPending = () => {
      const values = ui.readForm(form);
      const pend = S.pendingChecklist(Object.fromEntries(U.CHECKLIST.map((i) => [i.key, !!values[i.key]])));
      ui.clear(pendingBox);
      if (pend.length) {
        pendingBox.appendChild(h('p', { class: 'small' }, h('strong', null, 'Ficará pendente: '), pend.join(' · ')));
      } else {
        pendingBox.appendChild(h('p', { class: 'small ok-text' }, 'Todas as atividades do checklist estão marcadas.'));
      }
    };
    form.addEventListener('change', paintPending);
    paintPending();

    const submit = () => {
      const v = ui.readForm(form);
      const checklist = Object.fromEntries(U.CHECKLIST.map((i) => [i.key, !!v[i.key]]));
      const mats = materials.filter((m) => v[`mat_${m.id}`]).map((m) => m.id);
      store.setSessionMaterials(mats);
      store.finishSession({
        checklist,
        topicId: v.topicId || null,
        notes: v.notes,
        markTopicStudied: !!v.markTopicStudied && !!v.topicId,
      });
      ui.closeModal();
      const nextNow = store.cursorBlock();
      ui.toast(nextNow ? `Sessão concluída. Próximo: ${store.subjectName(nextNow.subjectId)} (bloco ${store.blockPosition(nextNow.id)}).` : 'Sessão concluída.', 'ok');
      window.OAB.app.go('inicio');
    };

    ui.modal({
      title: 'Concluir sessão',
      subtitle: store.subjectName(s.subjectId),
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Continuar estudando'),
        h('button', { class: 'btn primary', type: 'button', onclick: submit }, ui.icon('check'), 'Concluir e avançar ciclo'),
      ],
    });
  }

  function view(params, ctx) {
    const s = store.activeSession();
    if (!s) return noSession();

    const subject = store.subjectById(s.subjectId);
    const block = store.getState().cycle.find((b) => b.id === s.blockId);
    const topics = store.topicsOf(s.subjectId);
    const pm = s.plannedMin || {};
    const planned = { teoria: Number(pm.teoria) || 60, questoes: Number(pm.questoes) || 60 };
    const plannedTotal = (planned.teoria + planned.questoes) * 60000;
    const phaseRefs = {};

    const clockTotal = h('p', { class: 'clock', 'aria-live': 'off' }, U.fmtClock(0));
    const totalBar = ui.progressBar(0, 'primary');
    const statusPill = ui.pill('', 'ok');

    const phaseCard = (phase) => {
      const refs = {
        clock: h('p', { class: 'phase-clock' }, '00:00:00'),
        bar: ui.progressBar(0, phase === 'teoria' ? 'primary' : 'accent'),
        goal: h('p', { class: 'small muted' }),
        btn: h('button', {
          class: 'btn sm',
          type: 'button',
          onclick: () => {
            if (store.activeSession() && store.activeSession().phase !== phase) store.switchSessionPhase(phase);
          },
        }),
      };
      phaseRefs[phase] = refs;
      return h('div', { class: `phase-card phase-${phase}`, dataset: { phase } },
        h('div', { class: 'phase-head' },
          h('h3', null, PHASE_LABEL[phase]),
          h('span', { class: 'muted small' }, `Previsto: ${planned[phase]} min`)),
        refs.clock,
        refs.bar,
        refs.goal,
        refs.btn);
    };

    const pauseBtn = h('button', { class: 'btn lg', type: 'button', onclick: () => { store.pauseSession(); ui.toast('Sessão pausada. O tempo ficou registrado.'); } }, ui.icon('pause'), 'Pausar');
    const resumeBtn = h('button', { class: 'btn primary lg', type: 'button', onclick: () => { store.resumeSession(); } }, ui.icon('play'), 'Retomar');
    const controls = h('div', { class: 'session-controls' },
      s.status === 'ativa' ? pauseBtn : resumeBtn,
      h('button', { class: 'btn accent lg', type: 'button', onclick: () => openFinishModal(s) }, ui.icon('check'), 'Finalizar sessão'));

    const notesField = ui.textarea({ name: 'sessNotes', value: s.notes || '', rows: 3, placeholder: 'Anote o que estudou, dúvidas e o que quer revisar.' });
    notesField.addEventListener('change', () => store.setSessionNotes(notesField.value));

    const topicSelect = ui.select({ name: 'sessTopic' }, [
      { value: '', label: '— sem assunto —' },
      ...topics.map((t) => ({ value: t.id, label: t.name })),
    ], s.topicId || '');
    topicSelect.addEventListener('change', () => store.setSessionTopic(topicSelect.value || null));

    const mats = materialsForSession(s);

    const setFocus = (on) => document.body.classList.toggle('focus-mode', on);
    const focusExit = h('div', { class: 'focus-float' },
      h('span', { class: 'muted small' }, 'Modo foco ativo'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => setFocus(false) }, 'Sair do modo foco'));
    ctx.onLeave(() => document.body.classList.remove('focus-mode'));

    const page = h('div', { class: 'page session-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Sessão de estudo'),
          h('p', { class: 'muted' }, `${subject ? subject.name : 'Matéria removida'} · bloco ${block ? store.blockPosition(block.id) : '—'} de ${store.getState().cycle.length}`)),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => setFocus(true) }, ui.icon('play'), 'Modo foco'),
          h('button', { class: 'btn ghost danger-text', type: 'button', onclick: async () => {
            const ok = await ui.confirmDialog({
              title: 'Descartar sessão?',
              message: 'O tempo desta sessão será apagado e o ciclo não avança. Esta ação não pode ser desfeita.',
              confirmLabel: 'Descartar',
              danger: true,
            });
            if (ok) store.discardSession();
          } }, 'Descartar sessão'),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            store.pauseSession();
            window.OAB.app.go('inicio');
            ui.toast('Sessão salva em pausa. Você pode retomar quando quiser.');
          } }, 'Salvar e sair'))),
      h('div', { class: 'session-grid' },
        h('section', { class: 'card timer-card' },
          h('div', { class: 'timer-head' }, statusPill,
            h('span', { class: 'muted small' }, `Iniciada em ${U.fmtDateTime(s.startedAt)}`)),
          s.recovered ? h('p', { class: 'notice' }, 'O app foi reaberto e a sessão ficou pausada. O tempo foi contado até a última atividade. Clique em Retomar para continuar.') : null,
          clockTotal,
          h('p', { class: 'muted small center' }, `Tempo previsto: ${planned.teoria + planned.questoes} min (teoria + questões)`),
          totalBar,
          h('div', { class: 'phase-grid' }, phaseCard('teoria'), phaseCard('questoes')),
          controls),
        h('aside', { class: 'card' },
          h('h3', null, 'Contexto'),
          h('dl', { class: 'kv' },
            h('dt', null, 'Matéria'),
            h('dd', null, subject ? h('a', { href: `#/materias/${subject.id}` }, subject.name) : 'Removida'),
            h('dt', null, 'Assunto'),
            h('dd', null, topicSelect)),
          mats.length ? h('div', { class: 'block-materials' },
            h('p', { class: 'small muted' }, 'Materiais'),
            h('ul', null, mats.slice(0, 5).map((m) => h('li', null, h('a', { href: '#/materiais' }, m.title))))) : null,
          h('div', { class: 'stack' },
            h('button', { class: 'btn', type: 'button', onclick: () => window.OAB.forms.log({ mode: 'bloco', subjectId: s.subjectId, topicId: s.topicId }) }, ui.icon('plus'), 'Registrar questões desta sessão'),
            h('a', { class: 'btn ghost', href: '#/materiais' }, ui.icon('file'), 'Abrir biblioteca de PDFs')),
          h('h4', { class: 'mt' }, 'Anotações'),
          notesField,
          h('p', { class: 'small muted footnote' }, 'O tempo previsto é só um lembrete. Nada muda de fase ou de bloco sem a sua ação.'))),
    );

    const refresh = () => {
      const cur = store.activeSession();
      if (!cur || cur.id !== s.id) return;
      const now = Date.now();
      const e = S.elapsed(cur, now);
      clockTotal.textContent = U.fmtClock(e.total);
      totalBar.firstChild.style.width = `${Math.min(100, (e.total / plannedTotal) * 100)}%`;
      statusPill.textContent = cur.status === 'ativa' ? 'Em andamento' : 'Pausada';
      statusPill.className = `pill ${cur.status === 'ativa' ? 'ok' : 'warn'}`;
      ['teoria', 'questoes'].forEach((phase) => {
        const r = phaseRefs[phase];
        const ms = e[phase];
        const plannedMs = planned[phase] * 60000;
        const isCurrent = cur.phase === phase;
        r.clock.textContent = U.fmtClock(ms);
        r.bar.firstChild.style.width = `${Math.min(100, (ms / plannedMs) * 100)}%`;
        r.goal.textContent = ms >= plannedMs
          ? 'Tempo previsto atingido. Você decide quando trocar ou concluir.'
          : `Faltam ${U.fmtMinutes(plannedMs - ms)} para o previsto.`;
        r.btn.textContent = isCurrent ? 'Fase atual' : `Ir para ${PHASE_LABEL[phase].toLowerCase()}`;
        r.btn.disabled = isCurrent;
        r.btn.classList.toggle('primary', isCurrent);
        r.btn.parentNode.classList.toggle('current', isCurrent);
      });
    };
    page.appendChild(focusExit);
    refresh();
    const tick = setInterval(refresh, 1000);
    ctx.onLeave(() => clearInterval(tick));
    return page;
  }

  function noSession() {
    const block = store.cursorBlock();
    const page = h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', null,
        h('h1', null, 'Sessão de estudo'),
        h('p', { class: 'muted' }, 'Nenhuma sessão em andamento.'))));
    if (!block) {
      page.appendChild(ui.empty('Ciclo vazio', 'Monte o ciclo antes de iniciar uma sessão.',
        h('a', { class: 'btn primary', href: '#/ciclo' }, 'Ir para o ciclo')));
      return page;
    }
    const next = store.suggestedTopic(block.subjectId);
    page.appendChild(ui.card('Próximo bloco', h('div', { class: 'next-body' },
      h('h2', null, store.subjectName(block.subjectId)),
      h('p', { class: 'muted' }, `Bloco ${store.blockPosition(block.id)} de ${store.getState().cycle.length} · ${next ? `Próximo assunto: ${next.name}` : 'Sem assunto pendente cadastrado'}`),
      h('p', { class: 'small muted' }, 'Sessão padrão: 60 min de teoria e 60 min de questões. O cronômetro é opcional.'),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn primary lg',
          type: 'button',
          onclick: () => store.startSession(next ? next.id : null),
        }, ui.icon('play'), 'Iniciar sessão')))));
    return page;
  }

  window.OAB.views.sessao = view;
  window.OAB.views.sessaoFinish = openFinishModal;
})();
