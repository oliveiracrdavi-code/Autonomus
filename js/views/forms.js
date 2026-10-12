/* Formulários em modal, usados pelas telas. Toda validação passa pelas regras de lib/records.js. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const U = window.OAB.lib.util;
  const R = window.OAB.lib.records;

  const MOTIVOS = [
    'Falta de leitura da lei / jurisprudência',
    'Interpretação do enunciado',
    'Pegadinha / alternativa distratora',
    'Conteúdo não estudado',
    'Confusão entre conceitos parecidos',
    'Desatenção',
  ];

  const emptyOption = (label) => ({ value: '', label });
  const subjectOpts = (currentId) => [
    emptyOption('Escolha a disciplina'),
    ...store.sortedSubjects()
      .filter((s) => !s.archived || s.id === currentId)
      .map((s) => ({ value: s.id, label: s.archived ? `${s.name} (arquivada)` : s.name })),
  ];
  const topicOpts = (subjectId) => [
    emptyOption('— sem assunto cadastrado —'),
    ...store.topicsOf(subjectId).map((t) => ({ value: t.id, label: t.name })),
  ];
  const originOpts = () => U.ORIGINS.map((o) => ({ value: o.id, label: o.label }));

  /** Atualiza as opções de assunto quando a disciplina muda. */
  function linkTopicSelect(subjectSel, topicSel) {
    subjectSel.addEventListener('change', () => {
      const keep = topicSel.value;
      ui.clear(topicSel);
      topicOpts(subjectSel.value).forEach((o) => topicSel.appendChild(h('option', { value: o.value }, o.label)));
      topicSel.value = topicOpts(subjectSel.value).some((o) => o.value === keep) ? keep : '';
    });
  }

  function subtopicsOf(subjectId) {
    return [...new Set(store.getState().logs.filter((l) => l.subjectId === subjectId && l.subtopic).map((l) => l.subtopic))];
  }

  /* ---------- Registro de questões (bloco ou individual) ---------- */
  function openLogForm(existing, opts) {
    const isEdit = !!existing;
    const today = U.todayISO();
    let mode = existing ? (existing.mode === 'individual' ? 'individual' : 'bloco') : (opts && opts.mode) || 'bloco';
    const container = h('div', { class: 'log-form' });
    let form = null;
    const warnBox = h('div', { class: 'warn-box', hidden: true });
    const previewBox = h('div', { class: 'preview', 'aria-live': 'polite' });
    const allLogs = store.getState().logs;
    const allBancas = [...new Set(allLogs.map((l) => l.banca).filter(Boolean))];
    const allMotivos = [...new Set([...MOTIVOS, ...store.getState().errors.map((e) => e.reason).filter(Boolean)])];

    function buildForm(vals) {
      const v = (name, fallback) => (vals && vals[name] !== undefined && vals[name] !== null ? vals[name] : fallback);
      const base = existing || {};
      const subjectId = v('subjectId', base.subjectId || (opts && opts.subjectId) || '');
      const topicId = v('topicId', base.topicId || (opts && opts.topicId) || '');
      const sSel = ui.select({ name: 'subjectId' }, subjectOpts(base.subjectId), subjectId);
      const tSel = ui.select({ name: 'topicId' }, topicOpts(subjectId), topicId);
      linkTopicSelect(sSel, tSel);

      const commonFields = [
        ui.field('Data', ui.input({ type: 'date', name: 'date', value: v('date', base.date || today), required: true }), { name: 'date' }),
        ui.field('Disciplina', sSel, { name: 'subjectId' }),
        ui.field('Assunto cadastrado', tSel, { name: 'topicId', hint: 'Opcional. Cadastre assuntos em Matérias.' }),
        ui.field('Subtópico / assunto livre', ui.input({ name: 'subtopic', list: 'dl-subtopics', value: v('subtopic', base.subtopic || ''), placeholder: 'Ex.: Atos administrativos' }), { name: 'subtopic' }),
        ui.field('Banca', ui.input({ name: 'banca', list: 'dl-bancas', value: v('banca', base.banca || ''), placeholder: 'Ex.: FGV' }), { name: 'banca' }),
        ui.field('Prova ou exame', ui.input({ name: 'prova', value: v('prova', base.prova || ''), placeholder: 'Ex.: OAB 48 · 1ª fase' }), { name: 'prova' }),
        ui.field('Origem da questão', ui.select({ name: 'origem' }, originOpts(), v('origem', base.origem || 'outra')), { name: 'origem' }),
        ui.field('Tempo gasto (min)', ui.number({ name: 'minutes', value: v('minutes', base.minutes == null ? '' : base.minutes), placeholder: 'Opcional' }), { name: 'minutes' }),
      ];

      let specific;
      if (mode === 'bloco') {
        specific = [
          h('div', { class: 'count-grid full' },
            ui.field('Total de questões', ui.number({ name: 'total', min: '1', value: v('total', base.total ?? ''), required: true }), { name: 'total' }),
            ui.field('Acertos', ui.number({ name: 'correct', min: '0', value: v('correct', base.correct ?? '') }), { name: 'correct' }),
            ui.field('Erros', ui.number({ name: 'wrong', min: '0', value: v('wrong', base.wrong ?? ''), placeholder: 'calculado' }), { name: 'wrong', hint: 'Informe dois de acertos, erros e brancos; o terceiro é calculado.' }),
            ui.field('Em branco', ui.number({ name: 'blank', min: '0', value: v('blank', base.blank ?? '') }), { name: 'blank' })),
          h('div', { class: 'two-col' },
            ui.field('Nºs das questões erradas', ui.input({ name: 'wrongNumbers', value: v('wrongNumbers', ''), placeholder: 'Ex.: 3, 7, 12-14' }), { name: 'wrongNumbers', hint: 'Opcional. Cada número vira um item no caderno de erros.' }),
            ui.field('Nºs acertados por chute / dúvida', ui.input({ name: 'doubtNumbers', value: v('doubtNumbers', ''), placeholder: 'Ex.: 5' }), { name: 'doubtNumbers', hint: 'Opcional. Também viram itens no caderno.' })),
        ];
      } else {
        const result = v('result', base.correct === 1 ? 'acerto' : base.wrong === 1 ? 'erro' : base.blank === 1 ? 'branco' : null);
        const radios = [['acerto', 'Acertei'], ['erro', 'Errei'], ['branco', 'Em branco']].map(([val, label]) =>
          h('label', { class: 'radio-chip' },
            h('input', { type: 'radio', name: 'result', value: val, checked: result === val || null }),
            h('span', null, label)));
        specific = [
          h('div', { class: 'two-col' },
            ui.field('Nº ou identificador da questão', ui.input({ name: 'ref', value: v('ref', ''), placeholder: 'Ex.: 14 ou identificação da prova' }), { name: 'ref' }),
            ui.field('Resultado', h('div', { class: 'radio-row' }, radios), { name: 'result' })),
          ui.field('Nível de certeza', h('div', { class: 'radio-row' }, [['certeza', 'Tinha certeza'], ['duvida', 'Tive dúvida'], ['chute', 'Chutei']].map(([val, label]) => h('label', { class: 'radio-chip' },
            h('input', { type: 'radio', name: 'certainty', value: val, checked: (v('certainty', base.certainty || 'certeza') === val) || null }),
            h('span', null, label)))), { name: 'certainty', hint: 'Acerto com dúvida ou chute vai para a revisão do caderno. Erro com certeza entra na matriz de certeza.' }),
          h('div', { class: 'two-col' },
            ui.field('Motivo do erro', ui.input({ name: 'motivo', list: 'dl-motivos', value: v('motivo', base.motivo || ''), placeholder: 'Escolha ou escreva' }), { name: 'motivo' }),
            ui.field('Regra correta', ui.textarea({ name: 'regra', rows: 2, value: v('regra', base.rule || '') }), { name: 'regra' })),
        ];
      }

      const notesField = ui.field(mode === 'bloco' ? 'Observações' : 'Anotação curta para revisão',
        ui.textarea({ name: mode === 'bloco' ? 'notes' : 'anotacao', rows: 2, value: v(mode === 'bloco' ? 'notes' : 'anotacao', mode === 'bloco' ? base.notes || '' : base.notes || '') }),
        { name: mode === 'bloco' ? 'notes' : 'anotacao', full: true });

      const f = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
        ...commonFields, ...specific, notesField,
        h('datalist', { id: 'dl-subtopics' }, [...new Set(store.getState().logs.map((l) => l.subtopic).filter(Boolean))].map((x) => h('option', { value: x }))),
        ui.datalist('dl-bancas', allBancas),
        ui.datalist('dl-motivos', allMotivos));
      f.addEventListener('input', updatePreview);
      f.addEventListener('change', updatePreview);
      return f;
    }

    function currentValues() {
      return form ? ui.readForm(form) : {};
    }

    function updatePreview() {
      if (!form) return;
      const values = ui.readForm(form);
      const r = R.validateLog({ ...values, mode, result: values.result });
      ui.clear(previewBox);
      if (mode === 'individual') {
        previewBox.appendChild(h('span', null, values.result === 'acerto' ? 'Questão marcada como acerto.' : values.result === 'erro' ? 'Questão marcada como erro: vai para o caderno.' : 'Marque o resultado da questão.'));
        return;
      }
      if (!r.ok && !r.value.total) {
        previewBox.appendChild(h('span', { class: 'muted' }, 'Informe o total e os números para ver o aproveitamento.'));
        return;
      }
      const v = r.value;
      const pct = U.pctOf(v.correct, v.total);
      previewBox.appendChild(h('span', null,
        h('strong', null, `Aproveitamento: ${U.fmtPct(pct)}`),
        r.ok ? ` · ${v.correct} acertos, ${v.wrong} erros, ${v.blank} em branco` : ' · confira os números abaixo'));
    }

    function render(vals) {
      ui.clear(container);
      if (!isEdit) {
        container.appendChild(ui.tabs([
          { id: 'bloco', label: 'Bloco de questões' },
          { id: 'individual', label: 'Questão individual' },
        ], mode, (id) => {
          const cur = currentValues();
          mode = id;
          render(cur);
        }));
      }
      form = buildForm(vals || {});
      container.appendChild(warnBox);
      container.appendChild(previewBox);
      container.appendChild(form);
      updatePreview();
    }

    function submit() {
      const values = ui.readForm(form);
      values.mode = mode;
      if (mode === 'individual') {
        values.total = 1;
        values.notes = values.notes || values.anotacao || '';
      }
      const r = R.validateLog(values);
      if (!r.ok) {
        ui.showErrors(form, r.errors);
        ui.toast('Revise os campos destacados.', 'warn');
        return;
      }
      if (mode === 'individual') r.value.notes = values.anotacao || '';
      if (isEdit) {
        store.updateLog(existing.id, r.value);
        ui.closeModal();
        ui.toast('Registro atualizado. Itens do caderno gerados antes não foram alterados.', 'ok');
        return;
      }
      const session = store.activeSession();
      r.value.sessionId = session ? session.id : null;
      const res = store.addLog(r.value);
      ui.closeModal();
      const extra = res.entries.length ? ` ${res.entries.length} item(ns) foram para o caderno de erros.` : '';
      ui.toast(`Registro salvo.${extra}`, 'ok');
    }

    ui.modal({
      title: isEdit ? 'Editar registro' : 'Novo registro de questões',
      subtitle: isEdit ? 'Edite os números deste registro.' : 'Registre um bloco de questões ou uma questão individual.',
      wide: true,
      content: container,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: submit }, isEdit ? 'Salvar alterações' : 'Salvar registro'),
      ],
    });
    render(null);
  }

  /* ---------- Caderno de erros ---------- */
  function openErrorForm(existing, prefill) {
    const isEdit = !!existing;
    const base = { ...(prefill || {}), ...(existing || {}) };
    const sSel = ui.select({ name: 'subjectId' }, subjectOpts(base.subjectId), base.subjectId || '');
    const tSel = ui.select({ name: 'topicId' }, topicOpts(base.subjectId || ''), base.topicId || '');
    linkTopicSelect(sSel, tSel);
    const kind = h('div', { class: 'radio-row' }, U.ERROR_KIND.map((k) => h('label', { class: 'radio-chip' },
      h('input', { type: 'radio', name: 'kind', value: k.id, checked: (base.kind || 'erro') === k.id || null }),
      h('span', null, k.label))));
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Data', ui.input({ type: 'date', name: 'date', value: base.date || U.todayISO() }), { name: 'date' }),
      ui.field('Disciplina', sSel, { name: 'subjectId' }),
      ui.field('Assunto cadastrado', tSel, { name: 'topicId' }),
      ui.field('Subtópico', ui.input({ name: 'subtopic', value: base.subtopic || '', list: 'dl-subtopics' }), { name: 'subtopic' }),
      ui.field('Questão ou identificador', ui.input({ name: 'ref', value: base.ref || '', placeholder: 'Ex.: Q14' }), { name: 'ref' }),
      ui.field('Origem', ui.select({ name: 'origem' }, originOpts(), base.origem || 'outra'), { name: 'origem' }),
      ui.field('Tipo', kind, { name: 'kind', full: false }),
      isEdit ? ui.field('Status', ui.select({ name: 'status' }, U.ERROR_STATUS.map((s) => ({ value: s.id, label: s.label })), base.status || 'pendente'), { name: 'status' }) : null,
      ui.field('Motivo do erro', ui.input({ name: 'reason', list: 'dl-motivos', value: base.reason || '' }), { name: 'reason' }),
      ui.field('Anotação curta', ui.input({ name: 'note', value: base.note || '' }), { name: 'note' }),
      ui.field('Regra correta', ui.textarea({ name: 'rule', rows: 3, value: base.rule || '' }), { name: 'rule', full: true }),
      ui.datalist('dl-subtopics', [...new Set(store.getState().logs.map((l) => l.subtopic).filter(Boolean))]),
      ui.datalist('dl-motivos', MOTIVOS));

    function save() {
      const v = ui.readForm(form);
      const r = R.validateErrorEntry({ ...v, status: isEdit ? v.status : 'pendente' });
      if (!r.ok) {
        ui.showErrors(form, r.errors);
        return;
      }
      if (isEdit) store.updateError(existing.id, { ...r.value, status: r.value.status });
      else store.addError(r.value);
      ui.closeModal();
      ui.toast(isEdit ? 'Item atualizado.' : 'Item adicionado ao caderno de erros.', 'ok');
    }

    ui.modal({
      title: isEdit ? 'Editar item do caderno' : 'Novo item no caderno de erros',
      subtitle: 'Anote o motivo e a regra correta para revisar depois.',
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, isEdit ? 'Salvar' : 'Adicionar'),
      ],
    });
  }

  /* ---------- Simulados ---------- */
  function openSimuladoForm(existing) {
    const isEdit = !!existing;
    const breakdownExisting = isEdit ? store.simuladoBreakdown(existing.id) : [];
    const byId = new Map(breakdownExisting.map((r) => [r.subjectId, r]));
    const hasBreakdown = breakdownExisting.some((r) => r.subjectId);
    const rowsSubjects = store.sortedSubjects().filter((s) => !s.archived || byId.has(s.id));

    const breakdownRows = rowsSubjects.map((s) => {
      const r = byId.get(s.id);
      return {
        s,
        total: ui.number({ 'data-col': 'total', 'aria-label': `Questões de ${s.name}`, value: r ? r.total : '', min: '0' }),
        correct: ui.number({ 'data-col': 'correct', 'aria-label': `Acertos de ${s.name}`, value: r ? r.correct : '', min: '0' }),
        blank: ui.number({ 'data-col': 'blank', 'aria-label': `Brancos de ${s.name}`, value: r ? r.blank : '', min: '0' }),
      };
    });
    const sumsBox = h('p', { class: 'small muted', 'aria-live': 'polite' });
    const table = h('div', { class: 'table-wrap breakdown', hidden: !hasBreakdown },
      h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, h('th', null, 'Disciplina'), h('th', null, 'Questões'), h('th', null, 'Acertos'), h('th', null, 'Brancos'))),
        h('tbody', null, breakdownRows.map((row) => h('tr', null,
          h('td', null, row.s.name),
          h('td', null, row.total), h('td', null, row.correct), h('td', null, row.blank))))),
      sumsBox);

    const toggle = h('input', { type: 'checkbox', name: 'useBreakdown', checked: hasBreakdown || null });
    const totals = {
      name: ui.input({ name: 'name', value: isEdit ? existing.name : '', placeholder: 'Ex.: Simulado OAB 48 · 1ª fase' }),
      date: ui.input({ type: 'date', name: 'date', value: isEdit ? existing.date : U.todayISO() }),
      total: ui.number({ name: 'total', min: '1', value: isEdit ? existing.total : '' }),
      correct: ui.number({ name: 'correct', min: '0', value: isEdit ? existing.correct : '' }),
      blank: ui.number({ name: 'blank', min: '0', value: isEdit ? existing.blank || 0 : 0 }),
      minutes: ui.number({ name: 'minutes', min: '0', value: isEdit && existing.minutes != null ? existing.minutes : '' }),
      notes: ui.textarea({ name: 'notes', rows: 2, value: isEdit ? existing.notes || '' : '' }),
    };

    const sumUp = () => {
      const sums = { t: 0, c: 0, b: 0, n: 0 };
      breakdownRows.forEach((row) => {
        const t = parseInt(row.total.value, 10);
        if (Number.isFinite(t)) {
          sums.n += 1;
          sums.t += t;
          sums.c += parseInt(row.correct.value, 10) || 0;
          sums.b += parseInt(row.blank.value, 10) || 0;
        }
      });
      const tot = parseInt(totals.total.value, 10) || 0;
      const cor = parseInt(totals.correct.value, 10) || 0;
      const bl = parseInt(totals.blank.value, 10) || 0;
      const ok = sums.t === tot && sums.c === cor && sums.b === bl;
      sumsBox.textContent = `Soma por disciplina: ${sums.t} questões, ${sums.c} acertos, ${sums.b} brancos. Total do simulado: ${tot}, ${cor}, ${bl}. ${sums.n ? (ok ? '✓ Confere.' : 'Ainda não confere.') : ''}`;
      sumsBox.className = `small ${ok || !sums.n ? 'muted' : 'bad-text'}`;
    };
    table.addEventListener('input', sumUp);
    Object.values(totals).forEach((el) => el.addEventListener('input', sumUp));
    toggle.addEventListener('change', () => { table.hidden = !toggle.checked; });
    sumUp();

    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Nome do simulado', totals.name, { name: 'name' }),
      ui.field('Data', totals.date, { name: 'date' }),
      ui.field('Total de questões', totals.total, { name: 'total' }),
      ui.field('Acertos', totals.correct, { name: 'correct' }),
      ui.field('Em branco', totals.blank, { name: 'blank' }),
      ui.field('Tempo de prova (min)', totals.minutes, { name: 'minutes', hint: 'Opcional' }),
      ui.field('Observações', totals.notes, { name: 'notes', full: true }),
      h('label', { class: 'check-row full' }, toggle, h('span', null, 'Dividir resultado por disciplina (opcional)')),
      table,
    );

    function save() {
      const rows = toggle.checked
        ? breakdownRows.map((row) => ({ subjectId: row.s.id, total: row.total.value, correct: row.correct.value, blank: row.blank.value }))
        : [];
      const v = { name: totals.name.value, date: totals.date.value, total: totals.total.value, correct: totals.correct.value, blank: totals.blank.value, minutes: totals.minutes.value, notes: totals.notes.value, breakdown: rows };
      const r = R.validateSimulado(v);
      if (!r.ok) {
        const map = { ...r.errors };
        if (r.errors.breakdown) ui.toast(r.errors.breakdown, 'warn');
        const first = Object.keys(map).find((k) => k !== 'breakdown');
        if (first) ui.showErrors(form, { [first]: map[first] });
        return;
      }
      if (isEdit) store.updateSimulado(existing.id, r.value);
      else store.addSimulado(r.value);
      ui.closeModal();
      ui.toast(isEdit ? 'Simulado atualizado.' : 'Simulado salvo.', 'ok');
    }

    ui.modal({
      title: isEdit ? 'Editar simulado' : 'Novo simulado',
      subtitle: 'Totais gerais são obrigatórios. A divisão por disciplina é opcional.',
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, isEdit ? 'Salvar' : 'Salvar simulado'),
      ],
    });
  }

  /** Metas de acertos (editáveis). */
  function openGoalsForm() {
    let goals = store.getState().goals.slice().sort((a, b) => a.target - b.target).map((g) => ({ ...g }));
    const list = h('div', { class: 'goal-list' });
    const draw = () => {
      ui.clear(list);
      goals.forEach((g, i) => {
        const target = ui.number({ value: g.target, min: '1', 'aria-label': `Meta ${i + 1} em acertos`, 'data-goal': i, 'data-field': 'target' });
        const label = ui.input({ value: g.label || '', 'aria-label': `Nome da meta ${i + 1}`, 'data-goal': i, 'data-field': 'label', placeholder: 'Ex.: Meta 2' });
        list.appendChild(h('div', { class: 'goal-row' },
          h('label', null, 'Acertos', target),
          h('label', null, 'Nome', label),
          h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Remover meta', onclick: () => { sync(); goals.splice(i, 1); draw(); } }, ui.icon('trash'))));
      });
      if (!goals.length) list.appendChild(ui.empty('Sem metas', 'Adicione uma meta de acertos.'));
    };
    const sync = () => {
      list.querySelectorAll('[data-goal]').forEach((el) => {
        const i = Number(el.dataset.goal);
        if (!goals[i]) return;
        goals[i][el.dataset.field] = el.dataset.field === 'target' ? el.value : el.value;
      });
    };
    draw();
    const wrap = h('div', null, list,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => {
        sync();
        goals.push({ id: U.uid('goal'), target: '', label: `Meta ${goals.length + 1}` });
        draw();
      } }, ui.icon('plus'), 'Adicionar meta'));
    const save = () => {
      sync();
      const parsed = goals.map((g) => ({ ...g, r: R.validateGoal({ target: g.target, label: g.label }) }));
      const bad = parsed.find((p) => !p.r.ok);
      if (bad) return ui.toast('Cada meta precisa de um número de acertos entre 1 e 500.', 'warn');
      const seen = new Set();
      const dup = parsed.find((p) => (seen.has(p.r.value.target) ? true : (seen.add(p.r.value.target), false)));
      if (dup) return ui.toast('Não repita o mesmo número de acertos em duas metas.', 'warn');
      store.setGoals(parsed.map((p) => ({ id: p.id || U.uid('goal'), target: p.r.value.target, label: p.r.value.label })).sort((a, b) => a.target - b.target));
      ui.closeModal();
      ui.toast('Metas atualizadas.', 'ok');
    };
    ui.modal({
      title: 'Metas de acertos',
      subtitle: 'Nº de acertos em um simulado de 80 questões. Ajuste quando quiser.',
      content: wrap,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salvar metas'),
      ],
    });
  }

  /* ---------- Disciplinas e assuntos ---------- */
  function openSubjectForm(existing) {
    const isEdit = !!existing;
    const name = ui.input({ name: 'name', value: isEdit ? existing.name : '', placeholder: 'Ex.: Direito Financeiro' });
    const weight = ui.number({ name: 'weight', step: '0.1', value: isEdit ? existing.weight : '', placeholder: '0' });
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Nome', name, { name: 'name', full: true }),
      ui.field('Peso informado (%)', weight, { name: 'weight', hint: 'Usado apenas como referência. Pode ser editado a qualquer momento.' }));
    function save() {
      const v = ui.readForm(form);
      const r = R.validateSubject({ name: v.name, weight: v.weight, id: isEdit ? existing.id : null }, store.getState().subjects);
      if (!r.ok) return ui.showErrors(form, r.errors);
      if (isEdit) store.updateSubject(existing.id, r.value);
      else store.addSubject(r.value);
      ui.closeModal();
      ui.toast(isEdit ? 'Disciplina atualizada.' : 'Disciplina criada.', 'ok');
    }
    ui.modal({
      title: isEdit ? 'Editar disciplina' : 'Nova disciplina',
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salvar'),
      ],
    });
  }

  function openTopicForm(existing, subjectId) {
    const isEdit = !!existing;
    const sid = isEdit ? existing.subjectId : subjectId;
    const materials = store.getState().materials.filter((m) => !sid || m.subjectId === sid);
    const priority = ui.select({ name: 'priority' }, U.PRIORITIES.map((p) => ({ value: p.id, label: p.label })), isEdit ? existing.priority : 'media');
    const status = ui.select({ name: 'status' }, U.TOPIC_STATUS.map((s) => ({ value: s.id, label: s.label })), isEdit ? existing.status : 'pendente');
    const mat = ui.select({ name: 'materialId' }, [emptyOption('— nenhum —'), ...materials.map((m) => ({ value: m.id, label: m.title }))], isEdit ? existing.materialId || '' : '');
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Nome do assunto', ui.input({ name: 'name', value: isEdit ? existing.name : '', placeholder: 'Ex.: Atos administrativos' }), { name: 'name', full: true }),
      ui.field('Prioridade', priority, { name: 'priority' }),
      ui.field('Status de estudo', status, { name: 'status' }),
      ui.field('Fonte teórica', ui.input({ name: 'source', value: isEdit ? existing.source || '' : '', placeholder: 'Ex.: Gran Curso · Aula 3' }), { name: 'source' }),
      ui.field('PDF associado', mat, { name: 'materialId', hint: 'Escolha um material cadastrado na biblioteca.' }),
      ui.field('Observações', ui.textarea({ name: 'notes', rows: 2, value: isEdit ? existing.notes || '' : '' }), { name: 'notes', full: true }));
    function save() {
      const v = ui.readForm(form);
      const r = R.validateTopic({ ...v, subjectId: sid });
      if (!r.ok) return ui.showErrors(form, r.errors);
      if (isEdit) store.updateTopic(existing.id, r.value);
      else store.addTopic(r.value);
      ui.closeModal();
      ui.toast(isEdit ? 'Assunto atualizado.' : 'Assunto cadastrado.', 'ok');
    }
    ui.modal({
      title: isEdit ? 'Editar assunto' : 'Novo assunto',
      subtitle: store.subjectName(sid),
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salvar'),
      ],
    });
  }

  /* ---------- Materiais ---------- */
  function materialFields(m, subjectDefault) {
    const subj = ui.select({ name: 'subjectId' }, [emptyOption('Sem matéria'), ...store.sortedSubjects().filter((s) => !s.archived || (m && m.subjectId === s.id)).map((s) => ({ value: s.id, label: s.name }))], m ? m.subjectId || '' : subjectDefault || '');
    const topic = ui.select({ name: 'topicId' }, topicOpts(subj.value), m ? m.topicId || '' : '');
    subj.addEventListener('change', () => {
      const keep = topic.value;
      ui.clear(topic);
      topicOpts(subj.value).forEach((o) => topic.appendChild(h('option', { value: o.value }, o.label)));
      topic.value = topicOpts(subj.value).some((o) => o.value === keep) ? keep : '';
    });
    return { subj, topic };
  }

  function openMaterialForm(existing) {
    const m = existing;
    const { subj, topic } = materialFields(m, null);
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Título', ui.input({ name: 'title', value: m ? m.title : '' }), { name: 'title', full: true }),
      ui.field('Descrição', ui.textarea({ name: 'description', rows: 2, value: m ? m.description || '' : '' }), { name: 'description', full: true }),
      ui.field('Origem', ui.select({ name: 'source' }, U.MATERIAL_SOURCES.map((s) => ({ value: s.id, label: s.label })), m ? m.source : 'gran'), { name: 'source' }),
      ui.field('Disciplina', subj, { name: 'subjectId' }),
      ui.field('Assunto', topic, { name: 'topicId' }),
      ui.field('Status', ui.select({ name: 'status' }, U.MATERIAL_STATUS.map((s) => ({ value: s.id, label: s.label })), m ? m.status : 'nao_iniciado'), { name: 'status' }),
      ui.field('Página em que parei', ui.number({ name: 'lastPage', min: '0', value: m && m.lastPage != null ? m.lastPage : '' }), { name: 'lastPage' }),
      ui.field('Páginas ou capítulos pendentes', ui.textarea({ name: 'pendingPages', rows: 2, value: m ? m.pendingPages || '' : '', placeholder: 'Ex.: pp. 40–55; cap. 7' }), { name: 'pendingPages', full: true }),
      ui.field('Anotações', ui.textarea({ name: 'notes', rows: 3, value: m ? m.notes || '' : '' }), { name: 'notes', full: true }));
    async function save() {
      const v = ui.readForm(form);
      const r = R.validateMaterial(v);
      if (!r.ok) return ui.showErrors(form, r.errors);
      const value = { ...r.value, subjectId: v.subjectId || null, topicId: v.topicId || null };
      if (m) store.updateMaterial(m.id, value);
      else await store.addMaterial(value, null);
      ui.closeModal();
      ui.toast(m ? 'Material atualizado.' : 'Material cadastrado.', 'ok');
    }
    ui.modal({
      title: m ? 'Editar material' : 'Cadastrar material',
      subtitle: m && m.hasFile ? m.fileName : 'Cadastro manual (sem arquivo PDF).',
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salvar'),
      ],
    });
  }

  /** Importação de um ou mais PDFs: a origem, disciplina e assunto valem para todos. */
  function openUploadForm(files, defaults) {
    const list = Array.from(files).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!list.length) {
      ui.toast('Selecione arquivos PDF.', 'warn');
      return;
    }
    const { subj, topic } = materialFields(null, defaults && defaults.subjectId);
    const source = ui.select({ name: 'source' }, U.MATERIAL_SOURCES.map((s) => ({ value: s.id, label: s.label })), (defaults && defaults.source) || 'gran');
    const status = ui.select({ name: 'status' }, U.MATERIAL_STATUS.map((s) => ({ value: s.id, label: s.label })), 'nao_iniciado');
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'file-list full' }, h('p', { class: 'small muted' }, `${list.length} arquivo(s) selecionado(s):`),
        h('ul', null, list.slice(0, 8).map((f) => h('li', null, `${f.name} · ${U.fmtSize(f.size)}`)),
          list.length > 8 ? h('li', { class: 'muted' }, `… e mais ${list.length - 8}`) : null)),
      ui.field('Origem', source, { name: 'source', hint: 'Gran Curso, Estratégia ou outro material.' }),
      ui.field('Disciplina', subj, { name: 'subjectId' }),
      ui.field('Assunto', topic, { name: 'topicId' }),
      ui.field('Status inicial', status, { name: 'status' }));
    let busy = false;
    async function save() {
      if (busy) return;
      busy = true;
      let ok = 0;
      for (const f of list) {
        const title = f.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Material sem título';
        try {
          await store.addMaterial({
            title,
            description: '',
            source: source.value,
            subjectId: subj.value || null,
            topicId: topic.value || null,
            lastPage: null,
            pendingPages: '',
            status: status.value,
            notes: '',
          }, f);
          ok += 1;
        } catch (e) {
          ui.toast(`Não foi possível guardar “${f.name}” neste navegador.`, 'warn');
        }
      }
      busy = false;
      ui.closeModal();
      if (ok) ui.toast(`${ok} PDF(s) importado(s). Ajuste título e descrição, se quiser.`, 'ok');
    }
    ui.modal({
      title: 'Importar PDFs',
      subtitle: 'Os arquivos ficam guardados apenas neste navegador.',
      wide: true,
      content: form,
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ui.closeModal() }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, ui.icon('plus'), 'Importar'),
      ],
    });
  }

  window.OAB.forms = {
    log: openLogForm,
    errorEntry: openErrorForm,
    simulado: openSimuladoForm,
    goals: openGoalsForm,
    subject: openSubjectForm,
    topic: openTopicForm,
    material: openMaterialForm,
    upload: openUploadForm,
    subtopicsOf,
    MOTIVOS,
  };
})();
