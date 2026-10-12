/* Relatório de estudos: versão limpa para imprimir ou salvar em PDF, com exportações CSV. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const planner = window.OAB.lib.planner;
  const EX = window.OAB.lib.exporter;

  const period = { id: 'tudo' };

  function periodRange(id, today) {
    if (id === '30d') return { from: U.addDays(today, -29), to: today, label: 'Últimos 30 dias' };
    if (id === 'mes') return { from: `${today.slice(0, 8)}01`, to: today, label: 'Este mês' };
    return { from: '0000-00-00', to: '9999-12-31', label: 'Todo o período' };
  }

  const inRange = (date, r) => U.isISODate(date) && date >= r.from && date <= r.to;

  function names() {
    return {
      subject: (id) => store.subjectName(id),
      topic: (id) => store.topicLabel(id),
    };
  }

  function download(name, text) {
    ui.download(name, text, 'text/csv;charset=utf-8');
    ui.toast('Arquivo CSV gerado.', 'ok');
  }

  function view() {
    const s = store.getState();
    const now = Date.now();
    const today = U.todayISO();
    const r = periodRange(period.id, today);
    const logs = s.logs.filter((l) => inRange(l.date, r));
    const errors = s.errors.filter((e) => inRange(e.date, r));
    const sessions = s.sessions.filter((x) => inRange(U.todayISO(new Date(x.startedAt)), r));
    const sims = s.simulados.filter((x) => inRange(x.date, r)).sort((a, b) => U.compareText(a.date, b.date));
    const totals = stats.totals(logs);
    const sum = stats.sessionSummary(sessions, (x) => store.sessionElapsed(x, now));
    const bySubject = stats.bySubject(logs, s.subjects).filter((x) => x.total > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const recurring = stats.recurringGroups(errors.map((e) => ({ ...e, topicLabel: store.topicLabel(e.topicId) }))).slice(0, 6);
    const forecast = planner.cycleForecast(s.sessions, s.cycle, s.cursorId, today);
    const goals = stats.goalStatus(s.goals, s.simulados);

    const select = ui.select({ 'aria-label': 'Período do relatório', onchange: (e) => { period.id = e.target.value; window.OAB.app.refresh(); } },
      [{ value: 'tudo', label: 'Todo o período' }, { value: '30d', label: 'Últimos 30 dias' }, { value: 'mes', label: 'Este mês' }], period.id);

    const doc = h('article', { class: 'report-doc' },
      h('header', { class: 'report-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Relatório de estudos · OAB 1ª fase'),
          h('h1', { class: 'display-sm report-title' }, 'Desempenho e rotina'),
          h('p', { class: 'muted' }, `${r.label}${period.id !== 'tudo' ? ` · ${U.fmtDate(r.from)} a ${U.fmtDate(r.to)}` : ''} · emitido em ${U.fmtDate(today)}`))),
      h('div', { class: 'kpis report-kpis' },
        ui.stat('Questões', U.fmtInt(totals.total), `${U.fmtInt(totals.correct)} certas · ${U.fmtInt(totals.wrong)} erradas`),
        ui.stat('Aproveitamento', U.fmtPct(totals.pct), 'acertos ÷ total', ui.pctTone(totals.pct)),
        ui.stat('Horas', U.fmtHours(sum.totalMs), `${sum.concluded} sessão(ões) concluída(s)`),
        ui.stat('Erros em aberto', U.fmtInt(errors.filter((e) => e.status !== 'revisado').length), 'do caderno neste período')),
      h('section', { class: 'report-block' },
        h('h3', null, 'Aproveitamento por disciplina'),
        bySubject.length
          ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Disciplina'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Acertos'), h('th', { class: 'num' }, 'Aproveitamento'))),
            h('tbody', null, bySubject.map((x) => h('tr', null, h('td', null, x.name), h('td', { class: 'num' }, U.fmtInt(x.total)), h('td', { class: 'num' }, U.fmtInt(x.correct)), h('td', { class: 'num' }, U.fmtPct(x.pct)))))))
          : h('p', { class: 'muted small' }, 'Sem questões no período.')),
      h('section', { class: 'report-block' },
        h('h3', null, 'Simulados no período'),
        sims.length
          ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Simulado'), h('th', { class: 'num' }, 'Acertos'), h('th', { class: 'num' }, '%'))),
            h('tbody', null, sims.map((x) => h('tr', null, h('td', null, U.fmtDate(x.date)), h('td', null, x.name), h('td', { class: 'num' }, `${x.correct}/${x.total}`), h('td', { class: 'num' }, U.fmtPct(U.pctOf(x.correct, x.total))))))))
          : h('p', { class: 'muted small' }, 'Nenhum simulado no período.')),
      h('section', { class: 'report-block report-two' },
        h('div', null,
          h('h3', null, 'Rotina'),
          h('ul', { class: 'rules' },
            h('li', null, `Próximo bloco: ${store.cursorBlock() ? `${store.blockPosition(store.cursorBlock().id)}º — ${store.subjectName(store.cursorBlock().subjectId)}` : '—'}`),
            h('li', null, `Ciclos completos: ${s.completedLoops}`),
            h('li', null, forecast.ready
              ? `Previsão no ritmo atual: esta volta termina em ${U.fmtDate(forecast.dateLoop)}; o ciclo completo, em ${U.fmtDate(forecast.dateFull)}.`
              : 'Previsão: conclua algumas sessões para estimar o fim da volta.'),
            h('li', null, goals.current ? `Meta atual: ${goals.current.target} acertos (melhor: ${goals.best}).` : `Metas atingidas: ${goals.achievedCount} de ${goals.goals.length}.`))),
        h('div', null,
          h('h3', null, 'Erros que se repetem'),
          recurring.length
            ? h('ul', { class: 'rules' }, recurring.map((g) => h('li', null, `${g.label} (${store.subjectName(g.subjectId)}): ${g.errorCount} erro(s)`)))
            : h('p', { class: 'muted small' }, 'Nenhum erro repetido no período.'))),
      h('footer', { class: 'report-foot small muted' }, 'Gerado pelo OAB Estudos a partir dos registros salvos neste navegador.'));

    return h('div', { class: 'page relatorio' },
      h('div', { class: 'page-head no-print' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Exportar'),
          h('h1', { class: 'display-sm' }, 'Relatório'),
          h('p', { class: 'muted' }, 'Imprima ou salve em PDF pelo navegador (Ctrl P → Salvar como PDF). Os CSVs abrem no Excel.')),
        h('div', { class: 'page-actions' },
          select,
          h('button', { class: 'btn primary', type: 'button', onclick: () => window.print() }, ui.icon('file'), 'Imprimir / PDF'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`questoes-${today}.csv`, EX.logsCSV(logs, names())) }, 'CSV questões'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`caderno-${today}.csv`, EX.errorsCSV(errors, names())) }, 'CSV caderno'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`sessoes-${today}.csv`, EX.sessionsCSV(sessions, names(), (x) => store.sessionElapsed(x, now))) }, 'CSV sessões'))),
      doc);
  }

  window.OAB.views.relatorio = view;
})();
