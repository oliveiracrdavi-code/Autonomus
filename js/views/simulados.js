/* Simulados: resultados, comparação a cada duas semanas ("uma semana sim e uma não") e metas de acertos. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const forms = () => window.OAB.forms;

  function trendBadge(x) {
    if (!x.compare) return h('span', { class: 'muted small' }, 'Sem simulado 14+ dias antes');
    const d = x.compare.deltaCorrect;
    const pctD = x.compare.deltaPct;
    if (x.compare.trend === 'evoluiu') return ui.pill(`▲ +${d} acertos${pctD != null ? ` (${U.fmtPct(pctD).replace('%', ' p.p.')})` : ''}`, 'ok');
    if (x.compare.trend === 'caiu') return ui.pill(`▼ ${d} acertos${pctD != null ? ` (${U.fmtPct(pctD).replace('%', ' p.p.')})` : ''}`, 'bad');
    return ui.pill('= Estável', 'neutral');
  }

  function breakdownModal(sim) {
    const rows = store.simuladoBreakdown(sim.id);
    const content = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, h('th', null, 'Disciplina'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Acertos'), h('th', { class: 'num' }, 'Erros'), h('th', { class: 'num' }, '%'))),
      h('tbody', null, rows.map((r) => {
        const p = U.pctOf(r.correct, r.total);
        return h('tr', null, h('td', null, store.subjectName(r.subjectId)), h('td', { class: 'num' }, U.fmtInt(r.total)),
          h('td', { class: 'num' }, U.fmtInt(r.correct)), h('td', { class: 'num' }, U.fmtInt(r.wrong)), h('td', { class: 'num' }, ui.pill(U.fmtPct(p), ui.pctTone(p))));
      })))) : ui.empty('Sem divisão por disciplina', 'Este simulado foi registrado só com o total geral.');
    ui.modal({ title: sim.name, subtitle: `${U.fmtDate(sim.date)} · ${sim.total} questões`, wide: true, content,
      footer: [h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Fechar')] });
  }

  function view() {
    const s = store.getState();
    const g = stats.goalStatus(s.goals, s.simulados);
    const series = g.latest ? stats.simuladoSeries(s.simulados) : [];
    const desc = series.slice().reverse();
    const withCmp = desc.find((x) => x.compare);
    const maxTotal = Math.max(80, ...s.simulados.map((x) => x.total), ...s.goals.map((x) => x.target));
    const yMax = Math.ceil(maxTotal / 10) * 10;

    const chart = ui.charts.line(series.map((x) => ({
      label: U.fmtDayMonth(x.date),
      value: x.correct,
      title: `${x.name}: ${x.correct} acertos (${U.fmtPct(x.pct)})`,
    })), { yMin: 0, yMax, unit: '', refLines: g.goals.map((x) => ({ value: x.target, label: `meta ${x.target}` })), height: 260 });

    const evolution = !series.length
      ? ui.empty('Sem simulados ainda', 'Cadastre o diagnóstico ou um simulado para acompanhar a evolução.')
      : withCmp
        ? h('p', { class: 'lead' },
          `Comparando ${U.fmtDate(withCmp.date)} com ${U.fmtDate(withCmp.compare.date)} (a cada duas semanas): `,
          h('strong', { class: withCmp.compare.trend === 'evoluiu' ? 'ok-text' : withCmp.compare.trend === 'caiu' ? 'bad-text' : '' },
            withCmp.compare.trend === 'evoluiu' ? `você evoluiu ${withCmp.compare.deltaCorrect} acerto(s).`
              : withCmp.compare.trend === 'caiu' ? `caiu ${Math.abs(withCmp.compare.deltaCorrect)} acerto(s).`
                : 'seu resultado ficou estável.'))
        : h('p', { class: 'lead muted' }, 'Ainda não há dois simulados separados por pelo menos 14 dias. A comparação aparece automaticamente quando houver.');

    const goalsBox = g.goals.length ? h('ul', { class: 'goal-stack' }, g.goals.map((x) => {
      const p = Math.min(100, (g.best / x.target) * 100);
      return h('li', { class: x.achieved ? 'achieved' : '' },
        h('div', { class: 'row-between' },
          h('strong', null, `${x.target} acertos`),
          x.achieved ? ui.pill(`Atingida${x.achievedOn ? ` em ${U.fmtDate(x.achievedOn)}` : ''}`, 'ok') : ui.pill('Em busca', 'neutral')),
        h('p', { class: 'small muted' }, x.label || ''),
        ui.progressBar(p, x.achieved ? 'ok' : 'accent'));
    })) : ui.empty('Sem metas', 'Defina metas de acertos.');

    const table = series.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', null, 'Data'), h('th', null, 'Simulado'), h('th', { class: 'num' }, 'Questões'), h('th', { class: 'num' }, 'Acertos'),
        h('th', { class: 'num' }, 'Erros'), h('th', { class: 'num' }, 'Brancos'), h('th', { class: 'num' }, '%'),
        h('th', null, 'Comparado com'), h('th', null, 'Evolução'), h('th', null, ''))),
      h('tbody', null, desc.map((x) => {
        const sim = s.simulados.find((y) => y.id === x.id);
        return h('tr', null,
          h('td', { class: 'nowrap' }, U.fmtDate(x.date)),
          h('td', null, h('strong', null, x.name), x.notes ? h('p', { class: 'tiny muted' }, x.notes) : null),
          h('td', { class: 'num' }, U.fmtInt(x.total)),
          h('td', { class: 'num ok-text' }, U.fmtInt(x.correct)),
          h('td', { class: 'num bad-text' }, U.fmtInt(x.wrong)),
          h('td', { class: 'num' }, U.fmtInt(x.blank || 0)),
          h('td', { class: 'num' }, ui.pill(U.fmtPct(x.pct), ui.pctTone(x.pct))),
          h('td', null, x.compare ? h('span', { class: 'small' }, `${x.compare.name} · ${U.fmtDate(x.compare.date)}`) : h('span', { class: 'muted small' }, '—')),
          h('td', null, trendBadge(x)),
          h('td', { class: 'row-actions' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ver divisão por disciplina', title: 'Divisão', onclick: () => breakdownModal(sim) }, ui.icon('list')),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar simulado', title: 'Editar', onclick: () => forms().simulado(sim) }, ui.icon('edit')),
            h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Excluir simulado', title: 'Excluir', onclick: async () => {
              const ok = await ui.confirmDialog({ title: 'Excluir simulado?', message: 'Os registros de questões gerados por ele também serão apagados.', confirmLabel: 'Excluir', danger: true });
              if (ok) store.deleteSimulado(sim.id);
            } }, ui.icon('trash'))));
      })))) : null;

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Desempenho'),
          h('h1', { class: 'display-sm' }, 'Simulados e metas'),
          h('p', { class: 'muted' }, 'Acompanhe a evolução a cada duas semanas e avance meta por meta.')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => forms().goals() }, ui.icon('target'), 'Editar metas'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => forms().simulado(null) }, ui.icon('plus'), 'Novo simulado'))),
      h('div', { class: 'kpis' },
        ui.stat('Melhor resultado', g.best ? `${g.best} acertos` : '—', g.best && s.simulados.length ? `${U.fmtPct(U.pctOf(g.best, 80))} em 80 questões` : 'Sem simulados'),
        ui.stat('Último simulado', g.latest ? `${g.latest.correct} acertos` : '—', g.latest ? `${g.latest.name}` : ''),
        ui.stat('Meta atual', g.current ? `${g.current.target} acertos` : 'Todas atingidas', g.current && g.latest ? `Faltam ${Math.max(0, g.current.target - g.latest.correct)}` : ''),
        ui.stat('Metas atingidas', `${g.achievedCount} de ${g.goals.length}`, 'Pela melhor marca')),
      h('div', { class: 'grid-2' },
        ui.card('Evolução dos acertos', h('div', null, evolution, chart), { sub: 'Linhas tracejadas: metas de acertos' }),
        ui.card('Metas', goalsBox, { sub: 'Progresso com base no melhor resultado' })),
      ui.card('Comparação a cada duas semanas', table || ui.empty('Nenhum simulado', 'Registre o diagnóstico (OAB 47) ou um novo simulado.'), { sub: 'Cada simulado é comparado com o último feito pelo menos 14 dias antes' }));
  }

  window.OAB.views.simulados = view;
})();
