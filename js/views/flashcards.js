/* Flashcards: revisão diária do que está no caderno de erros, com repetição espaçada. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const F = window.OAB.lib.flashcards;

  const revealed = new Set(); // cartões com a regra aberta nesta sessão de revisão

  function promptOf(e) {
    const topic = store.topicLabel(e.topicId);
    const subject = store.subjectName(e.subjectId);
    const target = [topic, e.subtopic].filter(Boolean)[0] || e.ref || 'este tema';
    return { subject, target, ref: e.ref };
  }

  function answerFor(e, correct) {
    store.answerCard(e.id, correct);
    revealed.delete(e.id);
    ui.toast(correct ? 'Boa. Essa revisão foi para mais adiante.' : 'Sem problema: volta amanhã.', correct ? 'ok' : 'warn');
  }

  function boxBars(byBox) {
    const max = Math.max(1, ...byBox);
    return h('div', { class: 'boxes' }, byBox.map((n, i) => h('div', { class: 'box' },
      h('span', { class: 'box-count' }, String(n)),
      h('div', { class: 'box-track' }, h('div', { class: 'box-fill', style: { height: `${Math.max(6, (n / max) * 100)}%` } })),
      h('span', { class: 'box-label' }, `Caixa ${i + 1}`),
      h('span', { class: 'tiny muted' }, `${F.INTERVALS[i]} d`))));
  }

  function view() {
    const s = store.getState();
    const today = U.todayISO();
    const sum = F.summary(s.errors, s.cards, today);
    const due = F.dueToday(s.errors, s.cards, today);
    const current = due[0] || null;

    let session;
    if (current) {
      const e = current.entry;
      const p = promptOf(e);
      const open = revealed.has(e.id);
      session = h('article', { class: 'flashcard' },
        h('div', { class: 'flash-meta' },
          ui.pill(`Caixa ${current.card.box}`, current.card.box >= 4 ? 'ok' : current.card.box >= 2 ? 'warn' : 'bad'),
          h('span', { class: 'small muted' }, `${p.subject}${e.ref ? ` · ${e.ref}` : ''}`),
          h('span', { class: 'small muted flash-count' }, `${due.length} hoje`)),
        h('h2', { class: 'flash-front' }, `O que a regra diz sobre ${p.target}?`),
        e.reason ? h('p', { class: 'small muted' }, h('strong', null, 'Motivo do erro anterior: '), e.reason) : null,
        open
          ? h('div', { class: 'flash-back' },
            h('p', { class: 'eyebrow' }, 'Regra correta'),
            h('p', { class: 'flash-rule' }, e.rule),
            e.note ? h('p', { class: 'small muted' }, `Anotação: ${e.note}`) : null)
          : null,
        open
          ? h('div', { class: 'flash-actions' },
            h('button', { class: 'btn danger', type: 'button', onclick: () => answerFor(e, false) }, 'Esqueci (revisar amanhã)'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => answerFor(e, true) }, ui.icon('check'), 'Lembrei'))
          : h('div', { class: 'flash-actions' },
            h('button', { class: 'btn primary lg', type: 'button', onclick: () => { revealed.add(e.id); window.OAB.app.refresh(); } }, 'Mostrar a regra'),
            h('span', { class: 'tiny muted' }, 'Tente lembrar antes de abrir.')));
    } else {
      const next = s.errors
        .filter(F.isCandidate)
        .map((e) => F.cardState(e.id, s.cards, today).due)
        .filter((d) => d > today)
        .sort()[0];
      session = sum.total
        ? ui.empty('Nada para revisar hoje', next ? `Próximo cartão vence em ${U.diffDays(today, next)} dia(s), em ${U.fmtDate(next)}.` : 'Tudo em dia.')
        : ui.empty('Nenhum cartão ainda', 'Um item vira cartão quando tem a regra correta preenchida no caderno de erros.',
          h('a', { class: 'btn', href: '#/caderno' }, 'Ir para o caderno de erros'));
    }

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Repetição espaçada'),
          h('h1', { class: 'display-sm' }, 'Flashcards do caderno'),
          h('p', { class: 'muted' }, 'Cada regra que você errou volta para revisão no momento certo: se lembrar, espaça; se esquecer, volta amanhã.'))),
      h('div', { class: 'kpis' },
        ui.stat('Cartões', U.fmtInt(sum.total), `${sum.withoutRule} item(ns) sem regra`),
        ui.stat('Vencem hoje', U.fmtInt(sum.due), 'Para revisar agora', sum.due ? 'warn' : 'ok'),
        ui.stat('Dominados', U.fmtInt(sum.mastered), 'Na caixa mais alta', sum.mastered ? 'ok' : '')),
      h('div', { class: 'grid-2' },
        ui.card('Sessão de revisão', session, { cls: 'flash-card-wrap' }),
        ui.card('Caixas', sum.total ? boxBars(sum.byBox) : ui.empty('Sem cartões', 'As caixas aparecem quando houver cartões.'),
          { sub: 'Quanto mais alta a caixa, mais espaçada a revisão' })),
      h('p', { class: 'small muted center' }, 'Atalhos na revisão: Espaço mostra a regra · L lembrei · E esqueci'));
  }

  // atalhos: Espaço revela, L marca lembrei, E marca esqueci (só quando há um cartão aberto)
  document.addEventListener('keydown', (ev) => {
    if (!document.getElementById('view') || !document.querySelector('.flashcard')) return;
    if (/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
    const s = window.OAB.store.getState();
    const today = U.todayISO();
    const due = F.dueToday(s.errors, s.cards, today);
    const cur = due[0];
    if (!cur) return;
    if (ev.key === ' ' && !revealed.has(cur.entry.id)) {
      ev.preventDefault();
      revealed.add(cur.entry.id);
      window.OAB.app.refresh();
    } else if (revealed.has(cur.entry.id) && (ev.key === 'l' || ev.key === 'L')) answerFor(cur.entry, true);
    else if (revealed.has(cur.entry.id) && (ev.key === 'e' || ev.key === 'E')) answerFor(cur.entry, false);
  });

  window.OAB.views.flashcards = view;
})();
