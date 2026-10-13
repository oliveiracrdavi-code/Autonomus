/* Painel principal: próxima sessão, meta, ritmo, sequência, nível, prioridades e gráficos. Tudo calculado a partir dos registros. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const stats = window.OAB.lib.stats;
  const review = window.OAB.lib.review;
  const an = window.OAB.lib.analytics;
  const charts = ui.charts;

  const enrichedErrors = (state) => state.errors.map((e) => ({ ...e, topicLabel: store.topicLabel(e.topicId) }));

  /* ---------- cartões ---------- */
  function nextCard(now) {
    const active = store.activeSession();
    if (active) {
      const e = store.sessionElapsed(active, now);
      return ui.card(null, h('div', { class: 'next-body' },
        h('p', { class: 'eyebrow' }, active.status === 'ativa' ? 'Sessão em andamento' : 'Sessão pausada'),
        h('h2', null, store.subjectName(active.subjectId)),
        h('p', { class: 'muted' }, `Tempo acumulado ${U.fmtClock(e.total)} · bloco ${store.blockPosition(active.blockId)} de ${store.getState().cycle.length}`),
        active.recovered ? h('p', { class: 'notice' }, 'O app foi reaberto: a sessão ficou pausada e o tempo foi contado até a última atividade.') : null,
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary lg', href: '#/sessao' }, ui.icon('timer'), active.status === 'ativa' ? 'Ir para a sessão' : 'Retomar sessão'))),
        { cls: 'next-card active-session', id: 'proxima' });
    }
    const block = store.cursorBlock();
    if (!block) {
      return ui.card(null, ui.empty('Seu ciclo está vazio', 'Adicione blocos para começar.',
        h('a', { class: 'btn primary', href: '#/ciclo' }, 'Montar ciclo')), { cls: 'next-card' });
    }
    const subjectId = block.subjectId;
    const subject = store.subjectById(subjectId);
    const last = store.lastStudiedTopic(subjectId);
    const next = store.suggestedTopic(subjectId);
    const materials = store.materialsForBlock(block.id);
    const hasTopics = store.topicsOf(subjectId).length > 0;
    return ui.card(null, h('div', { class: 'next-body' },
      h('p', { class: 'eyebrow' }, `Próxima sessão · bloco ${store.blockPosition(block.id)} de ${store.getState().cycle.length}`),
      h('h2', null, store.subjectName(subjectId)),
      subject && subject.archived ? h('p', { class: 'notice warn' }, 'Esta matéria está arquivada. Reative-a ou troque o bloco no ciclo.') : null,
      h('dl', { class: 'kv' },
        h('dt', null, 'Último estudado'), h('dd', null, last ? last.name : h('span', { class: 'muted' }, 'Nenhum ainda')),
        h('dt', null, 'Próximo pendente'), h('dd', null, next ? next.name : h('span', { class: 'muted' }, hasTopics ? 'Todos os assuntos estudados' : 'Nenhum assunto cadastrado'))),
      materials.length ? h('div', { class: 'block-materials' },
        h('p', { class: 'small muted' }, 'Materiais deste bloco'),
        h('ul', null, materials.slice(0, 3).map((m) => h('li', null, h('a', { href: '#/materiais' }, m.title))))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary lg', type: 'button', onclick: () => { store.startSession(next ? next.id : null); window.OAB.app.go('sessao'); } },
          ui.icon('play'), 'Iniciar sessão'),
        h('a', { class: 'btn ghost', href: '#/ciclo' }, 'Ver ciclo')),
      h('p', { class: 'small muted footnote' }, 'O ciclo só avança quando você conclui uma sessão. Dias sem estudo não geram pendências.')),
      { cls: 'next-card', id: 'proxima' });
  }

  function goalCard(state) {
    const g = stats.goalStatus(state.goals, state.simulados);
    if (!g.latest) {
      return ui.card('Meta atual', ui.empty('Sem simulados ainda', 'Registre um simulado para acompanhar a meta.',
        h('a', { class: 'btn', href: '#/simulados' }, 'Ir para simulados')), { cls: 'goal-card' });
    }
    if (!g.current) {
      return ui.card('Meta atual', h('div', null,
        h('p', { class: 'big-num' }, 'Todas as metas atingidas'),
        h('p', { class: 'muted' }, `Melhor resultado: ${g.best} acertos.`)), { cls: 'goal-card' });
    }
    const left = Math.max(0, g.current.target - g.latest.correct);
    return ui.card('Meta atual', h('div', null,
      h('p', { class: 'big-num' }, `${g.current.target} acertos`),
      h('p', { class: 'muted small' }, g.current.label || 'Próxima meta'),
      ui.progressBar(g.progress, 'primary'),
      h('p', { class: 'goal-line' },
        h('strong', null, `${g.latest.correct}`), ` acertos no último simulado (${U.fmtDate(g.latest.date)}). `,
        left > 0 ? `Faltam ${left} para a meta.` : 'Meta alcançada no último simulado.'),
      h('a', { class: 'small', href: '#/simulados' }, 'Ver evolução dos simulados')), { cls: 'goal-card' });
  }

  function sundayBanner(state, today) {
    if (U.weekday(today) !== 0) return null;
    const range = review.periodRange('semana', today);
    const items = review.collectItems(enrichedErrors(state), range);
    const pending = items.filter((i) => i.status === 'pendente').length;
    return h('div', { class: 'banner' },
      h('div', null,
        h('strong', null, 'Hoje é domingo: revisão semanal de erros.'),
        h('p', { class: 'small' }, pending
          ? `${pending} item(ns) desta semana ainda pendente(s) no caderno.`
          : 'Nenhum item pendente nesta semana. A revisão pode ser feita quando você quiser.')),
      h('a', { class: 'btn primary', href: '#/revisao' }, 'Abrir revisão'));
  }

  function streakCard(activity, today, info) {
    const cells = an.heatmapGrid(activity, today, 16);
    const rows = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    const grid = h('div', { class: 'heatmap', role: 'img', 'aria-label': 'Mapa de calor dos últimos 16 semanas' },
      cells.map((c) => h('span', {
        class: `heat-cell l${c.level} ${c.future ? 'future' : ''}`,
        title: c.future ? '' : `${U.fmtDate(c.date)}: ${c.detail ? `${Math.round(c.detail.minutes)} min · ${c.detail.questions} questões · ${c.detail.reviews} revisões` : 'sem atividade'}`,
      })));
    const dayLabels = h('div', { class: 'heat-days', 'aria-hidden': 'true' }, rows.map((r) => h('span', null, r)));
    return ui.card('Sequência de estudo', h('div', { class: 'stack' },
      h('div', { class: 'streak' },
        h('div', null, h('p', { class: 'streak-num' }, String(info.current)),
          h('p', { class: 'small muted' }, info.current === 1 ? 'dia seguido' : 'dias seguidos')),
        h('div', { class: 'streak-side' },
          h('p', { class: 'small' }, h('strong', null, String(info.longest)), ' dias é o seu recorde'),
          h('p', { class: 'tiny muted' }, 'Dias sem estudo apenas zeram a contagem. Nada se acumula.'))),
      h('div', { class: 'heat-wrap' }, dayLabels, grid),
      h('div', { class: 'heat-legend tiny muted' }, 'menos', h('span', { class: 'heat-cell l1' }), h('span', { class: 'heat-cell l2' }), h('span', { class: 'heat-cell l3' }), h('span', { class: 'heat-cell l4' }), 'mais')),
      { sub: 'Minutos cronometrados, questões e revisões por dia' });
  }

  function levelCard(now, state) {
    const info = an.xpInfo(state, now);
    const r = 52;
    const c = 2 * Math.PI * r;
    const ring = h('svg', { class: 'xp-ring', viewBox: '0 0 124 124', role: 'img', 'aria-label': `Nível ${info.level}, ${Math.round(info.progress)}% do próximo nível` },
      h('defs', null, h('linearGradient', { id: 'xpGrad', x1: '0', x2: '1', y1: '0', y2: '1' },
        h('stop', { offset: '0%', 'stop-color': '#4ADE80' }), h('stop', { offset: '100%', 'stop-color': '#7C3AED' }))),
      h('circle', { class: 'ring-bg', cx: 62, cy: 62, r, fill: 'none', 'stroke-width': 10 }),
      h('circle', { class: 'ring-fg', cx: 62, cy: 62, r, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round',
        'stroke-dasharray': `${(info.progress / 100) * c} ${c}`, transform: 'rotate(-90 62 62)' }),
      h('text', { x: 62, y: 62, 'text-anchor': 'middle' }, String(info.level)),
      h('text', { x: 62, y: 80, 'text-anchor': 'middle', class: 'ring-sub' }, 'NÍVEL'));
    return ui.card('Nível e XP', h('div', { class: 'level-wrap' },
      ring,
      h('div', { class: 'stack' },
        h('p', null, h('strong', { class: 'big-small' }, `${U.fmtInt(info.xp)} XP`), h('span', { class: 'muted small' }, ` · faltam ${U.fmtInt(info.nextXp - info.xp)} para o nível ${info.level + 1}`)),
        h('ul', { class: 'rank-list compact small' },
          h('li', null, h('span', null, 'Minutos estudados'), h('strong', null, U.fmtInt(Math.round(info.breakdown.minutes)))),
          h('li', null, h('span', null, 'Questões resolvidas'), h('strong', null, U.fmtInt(info.breakdown.questions))),
          h('li', null, h('span', null, 'Sessões concluídas'), h('strong', null, U.fmtInt(info.breakdown.sessions))),
          h('li', null, h('span', null, 'Revisões feitas'), h('strong', null, U.fmtInt(info.breakdown.reviews)))),
        h('p', { class: 'tiny muted' }, '10 min = 1 XP · questão = 1 XP · sessão concluída = 20 XP · revisão = 3 XP'))),
      { sub: 'Sem pressão: o XP só mede o que você já fez' });
  }

  function rhythmCard(activity, today) {
    const days = an.weekRhythm(activity, today);
    const max = Math.max(60, ...days.map((d) => d.minutes));
    return ui.card('Ritmo dos últimos 7 dias', h('div', { class: 'week-bars' }, days.map((d) => h('div', { class: `week-bar ${d.isToday ? 'today' : ''}` },
      h('span', { class: 'week-bar-value' }, d.minutes ? U.fmtInt(d.minutes) : '—'),
      h('div', { style: { height: '100%', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' } },
        h('div', { class: `week-bar-fill ${d.minutes ? '' : 'empty'}`, style: { height: `${Math.max(4, (d.minutes / max) * 100)}%` }, title: `${U.fmtDate(d.date)}: ${d.minutes} min` })),
      h('span', { class: 'week-bar-label' }, d.label)))),
      { sub: 'Minutos cronometrados por dia. Os dias sem estudo ficam vazios, sem cobrança.' });
  }

  function countdownCard(state, today) {
    const examDate = state.settings.examDate;
    const days = an.countdown(examDate, today);
    if (days === null) {
      const input = ui.input({ type: 'date', 'aria-label': 'Data da 1ª fase' });
      return ui.card('Contagem para a prova', h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Defina a data da 1ª fase para acompanhar quantos dias faltam.'),
        h('div', { class: 'filters' }, input, h('button', { class: 'btn primary sm', type: 'button', onclick: () => {
          if (!U.isISODate(input.value)) return ui.toast('Escolha uma data válida.', 'warn');
          store.setSettings({ examDate: input.value });
          ui.toast('Data da prova salva.', 'ok');
        } }, 'Salvar data'))));
    }
    const past = days < 0;
    return ui.card('Contagem para a prova', h('div', { class: 'countdown' },
      h('p', { class: 'countdown-num' }, past ? 'Passou' : String(days)),
      h('p', { class: 'muted small' }, past ? `Data registrada: ${U.fmtDate(examDate)}.` : `${days === 1 ? 'dia' : 'dias'} até a 1ª fase em ${U.fmtDate(examDate)}`),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { store.setSettings({ examDate: null }); ui.toast('Data removida.'); }, style: { alignSelf: 'flex-start' } }, 'Alterar data')));
  }

  function prioritiesCard(state) {
    const list = an.priorities(state);
    if (!list.length) return ui.card('Foco sugerido', ui.empty('Sem matérias ativas', 'Cadastre disciplinas para receber sugestões.'));
    return ui.card('Foco sugerido', h('ul', { class: 'priority-list' }, list.map((p) => h('li', null,
      h('div', null, h('strong', null, p.name), h('p', { class: 'tiny muted' }, `${p.weight}% no edital · ${p.cycleCount} bloco(s) no ciclo · ${p.reason}`)),
      h('span', { class: 'score' }, `${p.score}/100`),
      ui.progressBar(p.pct == null ? 0 : p.pct, p.pct == null ? 'neutral' : p.pct < 50 ? 'bad' : p.pct < 70 ? 'warn' : 'ok')))),
      { sub: 'Mistura peso, desempenho e presença no ciclo. É só uma sugestão: o ciclo não muda sozinho.' });
  }

  function forecastCard(state) {
    const f = an.forecast(state.simulados);
    if (!f) return ui.card('Previsão de acertos', ui.empty('Ainda sem tendência', 'Com 3 ou mais simulados, mostramos uma previsão linear do próximo resultado.'));
    const trend = f.slope > 0 ? `subindo ~${f.slope} acerto(s) por simulado` : f.slope < 0 ? `caindo ~${Math.abs(f.slope)} acerto(s) por simulado` : 'estável';
    return ui.card('Previsão de acertos', h('div', { class: 'stack' },
      h('p', { class: 'forecast' }, 'Se o ritmo continuar, o próximo simulado fica perto de', h('br'), h('strong', null, `${f.next} acertos`)),
      h('p', { class: 'small muted' }, `Tendência ${trend}, calculada sobre os últimos ${f.points} simulados.`),
      h('p', { class: 'tiny muted' }, 'Estimativa simples. Não substitui o resultado real.')),
      { sub: 'Regressão linear sobre seus simulados' });
  }

  function achievementsCard(state, now, info) {
    const list = an.achievements(state, now, info);
    const unlocked = list.filter((a) => a.unlocked).length;
    return ui.card('Conquistas', h('div', { class: 'badges' }, list.map((a) => h('div', { class: `badge-card ${a.unlocked ? 'unlocked' : 'locked'}` },
      h('span', { class: 'badge-icon' }, ui.icon(a.icon)),
      h('div', null, h('h4', null, a.title), h('p', null, a.desc))))),
      { sub: `${unlocked} de ${list.length} desbloqueadas`, actions: ui.pill(`${unlocked}/${list.length}`, unlocked ? 'ok' : 'neutral') });
  }


  /* ---------- hero cinematográfico, trilha e cobertura ---------- */
  function heroStage(state, now, today, streakInfo, xp) {
    const block = store.cursorBlock();
    const subj = block ? store.subjectName(block.subjectId) : 'Monte seu ciclo';
    const totals = stats.totals(state.logs);
    const cov = coverage(state);
    const active = store.activeSession();
    const next = block ? store.suggestedTopic(block.subjectId) : null;
    const start = h('a', { class: 'btn ghost lg', href: '#proxima' }, ui.icon('arrowDown'), active ? 'Ver sessão em andamento' : 'Ver próxima sessão');
    return h('section', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, `${U.weekdayName(today)}, ${U.fmtDate(today)}`),
        h('h1', { class: 'display-xl' }, streakInfo.current >= 2 ? `${streakInfo.current} dias seguidos.` : 'Um bloco de cada vez.'),
        h('p', { class: 'hero-sub' }, 'Duas horas por dia, uma matéria por bloco. Cada sessão concluída avança o ciclo. Dias sem estudo não geram pendências.'),
        h('div', { class: 'actions' }, start, h('a', { class: 'btn ghost lg', href: '#/questoes' }, 'Registrar questões'))),
      h('div', { class: 'hero-stage', 'aria-hidden': 'true' },
        h('div', { class: 'float-card fc-1' },
          h('p', { class: 'tiny muted' }, 'Próximo bloco'),
          h('strong', { class: 'fc-title' }, subj),
          ui.progressBar(block ? 100 : 0, 'primary')),
        h('div', { class: 'float-card fc-2' },
          h('p', { class: 'tiny muted' }, 'Nível'),
          h('strong', { class: 'fc-big' }, `${xp.level}`),
          h('p', { class: 'tiny muted' }, `${U.fmtInt(xp.xp)} XP`),
          ui.progressBar(xp.progress, 'accent')),
        h('div', { class: 'float-card fc-3' },
          h('p', { class: 'tiny muted' }, cov.total ? 'Cobertura do edital' : 'Aproveitamento'),
          h('strong', { class: 'fc-big' }, cov.total ? U.fmtPct(cov.pct) : U.fmtPct(totals.pct)),
          ui.progressBar(cov.total ? cov.pct : totals.pct || 0, 'ok'))));
  }

  /** Cobertura: assuntos estudados ÷ assuntos cadastrados, por disciplina e no total. */
  function coverage(state) {
    const rows = state.subjects.filter((s) => !s.archived).sort((a, b) => a.order - b.order).map((s) => {
      const ts = state.topics.filter((t) => t.subjectId === s.id);
      const done = ts.filter((t) => t.status === 'estudado').length;
      return { id: s.id, name: s.name, total: ts.length, done, pct: ts.length ? (done / ts.length) * 100 : null };
    });
    const withTopics = rows.filter((r) => r.total > 0);
    const total = withTopics.reduce((n, r) => n + r.total, 0);
    const done = withTopics.reduce((n, r) => n + r.done, 0);
    return { rows, withTopics, total, done, pct: total ? (done / total) * 100 : null };
  }

  function coverageCard(state) {
    const cov = coverage(state);
    if (!cov.withTopics.length) {
      return ui.card('Cobertura do edital', ui.empty('Cadastre os assuntos', 'Em Matérias, cadastre os assuntos de cada disciplina para acompanhar a cobertura do edital.',
        h('a', { class: 'btn sm', href: '#/materias' }, 'Ir para matérias')));
    }
    return ui.card('Cobertura do edital', h('div', { class: 'stack' },
      h('p', { class: 'coverage-total' }, h('strong', null, U.fmtPct(cov.pct)), h('span', { class: 'muted small' }, ` · ${cov.done} de ${cov.total} assuntos estudados`)),
      h('ul', { class: 'coverage-list' }, cov.withTopics.map((r) => h('li', null,
        h('div', { class: 'row-between' }, h('span', null, r.name), h('span', { class: 'small muted' }, `${r.done}/${r.total}`)),
        ui.progressBar(r.pct, r.pct === 100 ? 'ok' : 'primary'))))),
      { sub: 'Percentual de assuntos marcados como estudados' });
  }

  function trailCard(state) {
    const cycle = state.cycle;
    if (!cycle.length) return ui.card('Trilha do ciclo', ui.empty('Ciclo vazio', 'Monte o ciclo para ver a trilha.'));
    const i = Math.max(0, cycle.findIndex((b) => b.id === state.cursorId));
    const n = Math.min(12, cycle.length);
    const nodes = Array.from({ length: n }, (_, k) => ({ block: cycle[(i + k) % cycle.length], pos: ((i + k) % cycle.length) + 1 }));
    const runs = an.blockRuns(cycle, i, n);
    const block = runs.maxRun >= 2
      ? h('p', { class: 'notice warn' }, h('strong', null, `Bloqueio: ${runs.maxRun} blocos seguidos de ${store.subjectName(runs.subjectId)}.`), ' Intercalar outra matéria ajuda a fixar a diferença entre institutos parecidos.')
      : null;
    return ui.card('Trilha do ciclo', h('div', { class: 'stack' }, block, h('ol', { class: 'trail' }, nodes.map((node, k) => h('li', { class: `trail-node ${k === 0 ? 'is-next' : ''}` },
      h('span', { class: 'trail-dot' }, String(node.pos)),
      h('span', { class: 'trail-name' }, store.subjectName(node.block.subjectId)),
      k === 0 ? h('span', { class: 'tiny' }, 'próximo') : null)))),
      { sub: `Os próximos ${n} blocos de ${cycle.length}. O primeiro é o da próxima sessão.`, actions: h('a', { class: 'small', href: '#/ciclo' }, 'Editar ciclo') });
  }


  /* ---------- meta de hoje e previsão do ciclo ---------- */
  function dailyGoalCard(state, activity, today) {
    const p = window.OAB.lib.planner.dailyProgress(activity, today, state.settings.dailyGoal);
    return ui.card('Meta de hoje', h('div', { class: 'stack' },
      p.done ? h('p', { class: 'notice ok' }, 'Meta de hoje cumprida. Bom trabalho.') : null,
      h('ul', { class: 'goal-bars' }, p.rows.map((r) => h('li', null,
        h('div', { class: 'row-between' },
          h('span', null, r.label),
          h('span', { class: 'small muted' }, `${U.fmtInt(r.value)} de ${U.fmtInt(r.target)} ${r.unit}`)),
        ui.progressBar(r.pct, r.pct >= 100 ? 'ok' : 'primary')))),
      (() => { const floor = window.OAB.lib.planner.suggestedFloor(activity, today); return floor ? h('p', { class: 'small muted' }, `Piso sugerido para dias difíceis: ${floor} min (metade do seu ritmo recente). Constância vale mais que perfeição.`) : null; })(),
      h('a', { class: 'small', href: '#/config' }, 'Ajustar metas diárias')),
      { sub: 'Hoje. Dias sem estudo não geram cobrança nem acúmulo.' });
  }

  function cycleForecastCard(state, today) {
    const f = window.OAB.lib.planner.cycleForecast(state.sessions, state.cycle, state.cursorId, today);
    if (!f.ready) {
      return ui.card('Previsão do ciclo', h('div', { class: 'stack' },
        h('p', { class: 'forecast' }, `Faltam ${f.leftInLoop} bloco(s) para fechar esta volta.`),
        h('p', { class: 'small muted' }, 'Conclua algumas sessões: a previsão usa o seu ritmo real das últimas 4 semanas.')),
        { sub: 'Projeção a partir do ritmo registrado' });
    }
    return ui.card('Previsão do ciclo', h('div', { class: 'stack' },
      h('p', { class: 'forecast' }, 'Esta volta termina em ', h('strong', null, U.fmtDate(f.dateLoop))),
      h('p', { class: 'small muted' }, `${f.leftInLoop} bloco(s) restantes · cerca de ${f.daysLoop} dia(s) no ritmo atual`),
      h('p', { class: 'forecast' }, 'Ciclo completo em ', h('strong', null, U.fmtDate(f.dateFull))),
      h('p', { class: 'tiny muted' }, `Ritmo: ${String(f.perWeek).replace('.', ',')} sessão(ões) por semana, nas últimas 4 semanas.`)),
      { sub: 'Projeção a partir do ritmo registrado' });
  }

  /* ---------- matriz de certeza e flashcards ---------- */
  function certaintyCard(state) {
    const m = stats.certaintyMatrix(state.logs);
    if (!m.total) {
      return ui.card('Matriz de certeza', ui.empty('Ainda sem dados de certeza', 'Ao registrar uma questão individual, marque se teve certeza, dúvida ou chutou. A matriz mostra onde está a convicção errada.',
        h('a', { class: 'btn sm', href: '#/questoes' }, 'Registrar questão')));
    }
    const rows = [['certeza', 'Certeza'], ['duvida', 'Dúvida'], ['chute', 'Chute']];
    const cell = (kind, key) => {
      const c = m.cells[kind];
      const n = c[key];
      const danger = kind === 'certeza' && key === 'erro';
      return h('div', { class: `matrix-cell ${danger ? 'danger' : key === 'acerto' ? 'good' : ''}` },
        h('strong', null, String(n)),
        h('span', { class: 'tiny muted' }, danger ? 'convicção errada' : key === 'acerto' ? 'acertou' : 'errou'));
    };
    return ui.card('Matriz de certeza', h('div', { class: 'stack' },
      h('div', { class: 'matrix' },
        h('span', null), h('span', { class: 'tiny muted center' }, 'Acertou'), h('span', { class: 'tiny muted center' }, 'Errou'),
        rows.flatMap(([kind, label]) => [h('span', { class: 'matrix-row' }, label), cell(kind, 'acerto'), cell(kind, 'erro')])),
      m.convictionWrong
        ? h('p', { class: 'notice bad' }, h('strong', null, `${m.convictionWrong} erro(s) com certeza.`), ' Comece a revisão por eles: são as regras em que você mais confia e erra.')
        : h('p', { class: 'small muted' }, 'Nenhuma convicção errada registrada. Continue marcando a certeza de cada questão.')),
      { sub: 'Certeza × resultado nas questões individuais' });
  }

  function flashCard(state) {
    const today = U.todayISO();
    const sum = window.OAB.lib.flashcards.summary(state.errors, state.cards, today);
    return ui.card('Revisão de hoje', h('div', { class: 'stack' },
      h('p', { class: 'big-num' }, sum.total ? `${sum.due} cartão(ões)` : 'Sem cartões'),
      h('p', { class: 'small muted' }, sum.total
        ? `${sum.mastered} dominado(s) de ${sum.total}. Cartões vencem conforme você lembra ou esquece.`
        : 'Um item do caderno vira cartão quando tem a regra correta preenchida.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary sm', href: '#/flashcards' }, ui.icon('cards'), sum.due ? 'Revisar agora' : 'Abrir flashcards'))),
      { sub: 'Repetição espaçada a partir do caderno' });
  }

  /* ---------- tela ---------- */
  function marquee() {
    const words = ['Ciclo de estudos', 'Questões', 'Caderno de erros', 'Revisão semanal', 'Simulados', 'Metas', 'PDFs', 'Foco'];
    const row = () => words.map((w) => h('span', null, w));
    return h('div', { class: 'marquee', 'aria-hidden': 'true' }, h('div', { class: 'marquee-track' }, row(), row()));
  }

  function view() {
    const state = store.getState();
    const now = Date.now();
    const today = U.todayISO();
    const totals = stats.totals(state.logs);
    const sess = stats.sessionSummary(state.sessions, (x) => store.sessionElapsed(x, now));
    const bySubject = stats.bySubject(state.logs, state.subjects);
    const withData = bySubject.filter((r) => r.total > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0) || b.total - a.total);
    const hours = stats.hoursBySubject(state.sessions, (x) => store.sessionElapsed(x, now));
    const hourRows = Object.entries(hours).filter(([, ms]) => ms > 0).map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms);
    const timeline = stats.timelineByWeek(state.logs).map((w) => ({ label: w.label, value: w.pct, title: `${w.label}: ${w.correct} de ${w.total} (${U.fmtPct(w.pct)})` }));
    const recurring = stats.recurringGroups(enrichedErrors(state));
    const ranks = stats.rankSubjects(bySubject, 3);
    const activity = an.activityByDay(state, now);
    const streakInfo = an.streak(an.activeDays(activity), today);
    const xp = an.xpInfo(state, now);

    const kpis = h('div', { class: 'kpis' },
      ui.stat('Horas estudadas', U.fmtHours(sess.totalMs), `${sess.count} sessão(ões) registradas`),
      ui.stat('Sessões concluídas', U.fmtInt(sess.concluded), 'Só contam as finalizadas'),
      ui.stat('Questões resolvidas', U.fmtInt(totals.total), `${U.fmtInt(state.logs.length)} registro(s)`),
      ui.stat('Aproveitamento', U.fmtPct(totals.pct), totals.total ? `${U.fmtInt(totals.correct)} acertos de ${U.fmtInt(totals.total)}` : 'Sem questões ainda', ui.pctTone(totals.pct)),
      ui.stat('Erros em aberto', U.fmtInt(store.openErrorsCount()), 'Itens do caderno não revisados', store.openErrorsCount() ? 'warn' : ''),
      ui.stat('Sequência', `${streakInfo.current} ${streakInfo.current === 1 ? 'dia' : 'dias'}`, `recorde: ${streakInfo.longest}`, streakInfo.current ? 'ok' : ''));

    const bestWorst = ui.card('Melhores e piores desempenhos', ranks.enoughData
        ? h('div', { class: 'best-worst' },
          h('div', null, h('p', { class: 'eyebrow ok' }, 'Melhores'),
            h('ul', { class: 'rank-list compact' }, ranks.best.map((r) => h('li', null, h('span', null, r.name), h('strong', { class: 'ok-text' }, U.fmtPct(r.pct)))))),
          h('div', null, h('p', { class: 'eyebrow bad' }, 'Piores'),
            h('ul', { class: 'rank-list compact' }, ranks.worst.map((r) => h('li', null, h('span', null, r.name), h('strong', { class: 'bad-text' }, U.fmtPct(r.pct)))))))
        : ui.empty('Dados insuficientes', 'Precisamos de pelo menos duas disciplinas com 5 ou mais questões resolvidas.'),
        { sub: 'Considera disciplinas com 5 ou mais questões' });

    const chartsGrid = h('div', { class: 'grid-charts' },
      ui.card('Desempenho por disciplina', charts.hbars(withData.map((r) => ({
        label: r.name,
        sub: `${U.fmtInt(r.total)} q${r.smallSample ? ' · amostra pequena' : ''}`,
        value: r.pct, display: U.fmtPct(r.pct), tone: charts.toneOf(r.pct), soft: r.smallSample,
      })), { max: 100, emptyText: 'Registre questões para comparar as disciplinas.' }),
        { sub: 'Verde ≥ 70% · Âmbar 50–69% · Vermelho < 50%', cls: 'span-2' }),
      ui.card('Evolução dos acertos', charts.line(timeline, { yMin: 0, yMax: 100, unit: '%' }), { sub: 'Aproveitamento por semana (seg–dom)' }),
      ui.card('Certas × erradas', charts.donut([
        { label: 'Certas', value: totals.correct, color: charts.COLORS.ok },
        { label: 'Erradas', value: totals.wrong, color: charts.COLORS.bad },
        { label: 'Em branco', value: totals.blank, color: charts.COLORS.blank },
      ], { centerValue: U.fmtPct(totals.pct), centerLabel: 'acerto' }), { sub: 'Todos os registros' }),
      ui.card('Horas por disciplina', charts.hbars(hourRows.map((r) => ({
        label: store.subjectName(r.id), value: r.ms / 3600000, display: U.fmtHours(r.ms), tone: 'primary',
      })), { emptyText: 'As horas aparecem quando você realiza sessões de estudo.' }), { sub: 'Tempo cronometrado nas sessões' }),
      ui.card('Erros que se repetem', recurring.length
        ? h('ul', { class: 'rank-list' }, recurring.slice(0, 6).map((g) => h('li', null,
          h('div', null, h('strong', null, g.label), h('p', { class: 'small muted' }, store.subjectName(g.subjectId))),
          h('span', { class: 'pill bad' }, `${g.errorCount} erro(s)${g.flagged ? ` · ${g.flagged} recorrente(s)` : ''}`))))
        : ui.empty('Nenhum erro repetido', 'Um assunto aparece aqui quando acumula 2 ou mais erros no caderno.'),
        { sub: 'Mesmo assunto com 2+ erros, ou marcado como recorrente', actions: h('a', { class: 'small', href: '#/caderno' }, 'Abrir caderno') }));

    return h('div', { class: 'page dashboard' },
      heroStage(state, now, today, streakInfo, xp),
      marquee(),
      sundayBanner(state, today),
      h('div', { class: 'grid-hero' }, nextCard(now), goalCard(state)),
      trailCard(state),
      kpis,
      h('div', { class: 'grid-3' }, streakCard(activity, today, streakInfo), rhythmCard(activity, today), levelCard(now, state)),
      h('div', { class: 'grid-3' }, countdownCard(state, today), prioritiesCard(state), forecastCard(state)),
      h('div', { class: 'grid-2' }, dailyGoalCard(state, activity, today), cycleForecastCard(state, today)),
      h('div', { class: 'grid-2' }, certaintyCard(state), flashCard(state)),
      h('div', { class: 'grid-2' }, coverageCard(state), bestWorst),
      chartsGrid,
      achievementsCard(state, now, streakInfo));
  }

  window.OAB.views.inicio = view;
})();
