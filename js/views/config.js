/* Configurações: plano de sessão, backup, armazenamento e regras do método. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;

  function view() {
    const s = store.getState();
    const dataSize = new Blob([store.exportBackup()]).size;

    const theory = ui.number({ min: '5', max: '240', value: s.settings.plannedTheoryMin, 'aria-label': 'Minutos de teoria por sessão' });
    const questions = ui.number({ min: '5', max: '240', value: s.settings.plannedQuestionsMin, 'aria-label': 'Minutos de questões por sessão' });
    const savePlan = () => {
      const t = parseInt(theory.value, 10);
      const q = parseInt(questions.value, 10);
      if (!(t >= 5 && t <= 240 && q >= 5 && q <= 240)) return ui.toast('Use valores entre 5 e 240 minutos.', 'warn');
      store.setSettings({ plannedTheoryMin: t, plannedQuestionsMin: q });
      ui.toast('Plano de sessão atualizado.', 'ok');
    };

    const gDaily = s.settings.dailyGoal || { minutes: 120, questions: 40, reviews: 10 };
    const gMin = ui.number({ min: '0', max: '600', value: gDaily.minutes, 'aria-label': 'Meta diária de minutos' });
    const gQ = ui.number({ min: '0', max: '1000', value: gDaily.questions, 'aria-label': 'Meta diária de questões' });
    const gR = ui.number({ min: '0', max: '500', value: gDaily.reviews, 'aria-label': 'Meta diária de revisões' });
    const pMin = ui.number({ min: '10', max: '720', value: s.settings.provaMin || 300, 'aria-label': 'Tempo padrão da prova' });
    const pQ = ui.number({ min: '10', max: '200', value: s.settings.provaQuestions || 80, 'aria-label': 'Questões padrão da prova' });
    const saveGoals = () => {
      const v = [gMin, gQ, gR].map((x) => parseInt(x.value, 10));
      const p = [pMin, pQ].map((x) => parseInt(x.value, 10));
      if (v.some((x) => !(x >= 0)) || !(p[0] >= 10 && p[0] <= 720) || !(p[1] >= 10 && p[1] <= 200)) return ui.toast('Confira os valores das metas e da prova.', 'warn');
      store.setSettings({ dailyGoal: { minutes: v[0], questions: v[1], reviews: v[2] }, provaMin: p[0], provaQuestions: p[1] });
      ui.toast('Metas e padrões atualizados.', 'ok');
    };
    const goalCard = ui.card('Metas diárias e modo prova', h('div', { class: 'stack' },
      h('div', { class: 'count-grid' },
        ui.field('Minutos por dia', gMin, { name: 'gm', hint: 'Sessão padrão: 120' }),
        ui.field('Questões por dia', gQ, { name: 'gq' }),
        ui.field('Revisões por dia', gR, { name: 'gr' }),
        h('span', null)),
      h('div', { class: 'two-col' },
        ui.field('Prova: tempo padrão (min)', pMin, { name: 'pm', hint: 'Ajustável. Você escolhe a cada prova.' }),
        ui.field('Prova: questões padrão', pQ, { name: 'pq' })),
      h('button', { class: 'btn primary', type: 'button', onclick: saveGoals }, 'Salvar metas e padrões')),
      { sub: 'Metas aparecem no painel como progresso de hoje' });

    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true',
      onchange: async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const text = await file.text();
        const ok = await ui.confirmDialog({ title: 'Importar backup?', message: 'Os dados atuais serão substituídos pelo conteúdo do arquivo. Faça um backup antes, se necessário.', confirmLabel: 'Importar', danger: true });
        if (!ok) return;
        const res = store.importBackup(text);
        ui.toast(res.ok ? 'Backup importado.' : res.reason, res.ok ? 'ok' : 'warn');
      } });

    const counts = [
      ['Registros de questões', s.logs.length],
      ['Itens no caderno', s.errors.length],
      ['Simulados', s.simulados.length],
      ['Sessões', s.sessions.length],
      ['Materiais (com PDF)', `${s.materials.length} (${s.materials.filter((m) => m.hasFile).length})`],
      ['Disciplinas e assuntos', `${s.subjects.length} · ${s.topics.length}`],
    ];

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Sistema'),
          h('h1', { class: 'display-sm' }, 'Configurações'))),
      h('div', { class: 'grid-2' },
        ui.card('Plano de sessão', h('div', null,
          h('p', { class: 'muted small' }, 'Sessão padrão de 2 horas: uma matéria por bloco, com teoria e questões. Os tempos são lembretes, não avançam o ciclo.'),
          h('div', { class: 'two-col' },
            ui.field('Teoria (min)', theory, { name: 'theory' }),
            ui.field('Questões (min)', questions, { name: 'questions' })),
          h('button', { class: 'btn primary', type: 'button', onclick: savePlan }, 'Salvar plano')), { sub: 'Padrão: 60 + 60 minutos' }),
        ui.card('Regras do método', h('ul', { class: 'rules' },
          h('li', null, 'O ciclo avança somente quando você conclui uma sessão.'),
          h('li', null, 'Dias sem estudo não geram pendências nem sessões acumuladas.'),
          h('li', null, 'Domingo é dia de revisão dos erros; ela não altera o ciclo.'),
          h('li', null, 'Editar ordem, quantidade ou matérias não apaga o histórico.'),
          h('li', null, 'Os registros valem para todas as disciplinas e assuntos cadastrados.')))),
      goalCard,
      h('div', { class: 'grid-2' },
        ui.card('Backup e dados', h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, `Dados neste navegador: ${(dataSize / 1024).toFixed(1).replace('.', ',')} KB. Exporte regularmente. Os PDFs não entram no backup.`),
          h('div', { class: 'page-actions' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => {
              ui.download(`oab-estudos-backup-${U.todayISO()}.json`, store.exportBackup());
              ui.toast('Backup exportado.', 'ok');
            } }, ui.icon('file'), 'Exportar backup'),
            h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Importar backup'),
            fileInput))),
        ui.card('Armazenamento', h('dl', { class: 'kv' }, counts.map(([k, v]) => [h('dt', null, k), h('dd', null, String(v))]))),
      ),
      ui.card('Zona de risco', h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Estas ações apagam dados. Exporte um backup antes.'),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            const ok = await ui.confirmDialog({ title: 'Apagar registros?', message: 'Questões, caderno, simulados e sessões serão apagados. Disciplinas, assuntos, materiais e ciclo são mantidos.', confirmLabel: 'Apagar registros', danger: true });
            if (ok) { store.clearRecords(); ui.toast('Registros apagados. Matérias e ciclo foram mantidos.', 'ok'); }
          } }, 'Apagar registros'),
          h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            const ok = await ui.confirmDialog({ title: 'Restaurar dados iniciais?', message: 'Tudo volta ao estado inicial: 23 disciplinas, ciclo de 30 blocos, diagnóstico OAB 47. Os registros atuais serão perdidos.', confirmLabel: 'Restaurar', danger: true });
            if (ok) { store.resetToSeed(); ui.toast('Dados iniciais restaurados.', 'ok'); }
          } }, 'Restaurar dados iniciais')))));
  }

  window.OAB.views.config = view;
})();
