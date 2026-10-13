/* Tutor de estudo: modos de conversa, contexto do estudante (opcional e agregado), montagem das mensagens
 * e roteiro do resumo em áudio. Tudo puro, testável em Node. Nenhum dado pessoal é enviado sem permissão. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const stats = typeof require === 'function' ? require('./stats') : window.OAB.lib.stats;
  const lib = factory(U, stats);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.tutor = lib;
})(function (U, stats) {
  const MODES = {
    tutor: {
      id: 'tutor',
      label: 'Tutor',
      system:
        'Você é um tutor de direito para a 1ª fase do Exame da OAB. Explique com clareza, em português do Brasil, ' +
        'em linguagem direta. Sempre que citar uma regra, indique o artigo e a lei (ex.: art. 25 do Código Penal) e ' +
        'lembre que a lei vigente e a jurisprudência prevalecem. Quando não tiver certeza de um dispositivo, diga isso ' +
        'claramente em vez de inventar. Termine com uma pergunta curta para checar a compreensão.',
    },
    socratico: {
      id: 'socratico',
      label: 'Socrático',
      system:
        'Você é um tutor socrático. Não entregue a resposta de imediato: faça perguntas que levem o estudante a ' +
        'raciocinar, uma ou duas por vez, e confirme os passos corretos. Só explique a regra completa quando o ' +
        'estudante pedir ou após duas tentativas. Use português do Brasil e cite a base legal quando for útil.',
    },
    banca: {
      id: 'banca',
      label: 'Chefe de banca',
      system:
        'Você é um examinador experiente de uma banca de concurso jurídico. Faça UMA questão de múltipla escolha ' +
        'por vez, no estilo da 1ª fase da OAB (enunciado objetivo, cinco alternativas A a E, com pegadinhas comuns ' +
        'de banca). Aguarde a resposta do estudante. Depois, diga se acertou, explique por que cada alternativa está ' +
        'certa ou errada e indique o artigo da lei. Diga claramente quando a questão for criada por você, não oficial.',
    },
    feynman: {
      id: 'feynman',
      label: 'Feynman (explique em voz)',
      system:
        'Você avalia explicações feitas pelo próprio estudante, no método de Feynman. Não corrija de imediato: ' +
        'primeiro identifique, com precisão, o que está correto, o que está impreciso (conceito trocado, termo mal ' +
        'usado, exceção esquecida) e o que faltou. Faça no máximo duas perguntas de aprofundamento. Depois dê uma ' +
        'nota de clareza e uma de precisão, de 0 a 10, e diga a lacuna mais importante para revisar. Cite o artigo ' +
        'quando a precisão depender da lei. Em português do Brasil.',
    },
    resumo: {
      id: 'resumo',
      label: 'Resumo em áudio',
      system:
        'Você escreve roteiros de áudio curtos para estudo. Escreva em português do Brasil, em frases curtas e naturais, ' +
        'sem listas, sem markdown e sem símbolos. Comece com uma saudação breve e termine com uma dica de revisão. ' +
        'Máximo de 900 caracteres.',
    },
  };

  /**
   * Contexto agregado do estudante. Não tem nome, e-mail nem texto livre das anotações.
   * Devolve null quando não há dados suficientes.
   */
  function studentContext(state, now) {
    const totals = stats.totals(state.logs);
    if (!totals.total) return null;
    const rows = stats.bySubject(state.logs, state.subjects).filter((r) => !r.archived && r.total >= stats.MIN_SAMPLE);
    const weak = rows.filter((r) => r.pct < 60).sort((a, b) => a.pct - b.pct).slice(0, 3);
    const strong = rows.filter((r) => r.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 3);
    const open = state.errors.filter((e) => e.status !== 'revisado');
    const recurring = stats.recurringGroups(state.errors.map((e) => ({ ...e, topicLabel: '' }))).slice(0, 3);
    const lines = [
      `Questões resolvidas: ${totals.total}; aproveitamento geral: ${U.fmtPct(totals.pct)}.`,
      weak.length ? `Disciplinas que mais precisam de atenção: ${weak.map((r) => `${r.name} (${U.fmtPct(r.pct)} em ${r.total} questões)`).join('; ')}.` : null,
      strong.length ? `Disciplinas mais fortes: ${strong.map((r) => `${r.name} (${U.fmtPct(r.pct)})`).join('; ')}.` : null,
      open.length ? `Itens em aberto no caderno de erros: ${open.length}.` : null,
      recurring.length ? `Matérias com erros repetidos: ${recurring.map((g) => `${subjectNameOf(state, g.subjectId)} (${g.errorCount + g.flagged} erros)`).join('; ')}.` : null,
    ].filter(Boolean);
    return lines.join(' ');
  }

  function subjectNameOf(state, subjectId) {
    const s = state.subjects.find((x) => x.id === subjectId);
    return s ? s.name : 'matéria';
  }

  /** Monta as mensagens para a API: system (modo + contexto opcional), histórico recente e a nova pergunta. */
  function buildMessages({ mode = 'tutor', history = [], userText, context = null, attachments = [], maxTurns = 12 }) {
    const base = (MODES[mode] || MODES.tutor).system;
    const system = context ? `${base}\n\nContexto do estudante (agregado, use para personalizar): ${context}` : base;
    const recent = history.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-maxTurns * 2);
    const attached = attachments.map((a) => `--- Anexo: ${a.name}${a.truncated ? ' (texto cortado: só o início foi enviado)' : ''} ---\n${a.text}`).join('\n\n');
    const user = [attached, userText].filter(Boolean).join('\n\n');
    return [
      { role: 'system', content: system },
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: user },
    ];
  }

  /** Lê um anexo de texto (.txt, .md, .csv, .json). Limita o tamanho para não estourar o contexto. */
  function prepareAttachment(name, content, limit = 40000) {
    const clean = String(content || '');
    const cut = clean.length > limit;
    return { name, text: cut ? clean.slice(0, limit) : clean, truncated: cut };
  }

  /** Mensagem pronta para pedir uma explicação de um item do caderno de erros. */
  function explainErrorText(entry, subjectName, topicName) {
    const where = [subjectName, topicName || entry.subtopic, entry.ref].filter(Boolean).join(' · ');
    const parts = [`Explique esta regra com calma, como se eu fosse fazer a prova amanhã. Tópico: ${where}.`];
    if (entry.rule) parts.push(`Regra que eu anotei: ${entry.rule}`);
    if (entry.reason) parts.push(`Por que eu errei: ${entry.reason}`);
    if (entry.note) parts.push(`Minha anotação: ${entry.note}`);
    parts.push('Depois, crie um mnemônico curto e uma pergunta para eu testar a memória.');
    return parts.join('\n');
  }

  /** Pedido do roteiro do resumo em áudio da semana, a partir dos itens do caderno (sem nomes pessoais). */
  function weeklyScriptText(items, periodLabel) {
    const lines = items.slice(0, 12).map((i) => `- ${i.subjectName}${i.topicName ? `, ${i.topicName}` : ''}: ${i.rule || i.reason || 'revisar'} (${i.status})`);
    return `Período: ${periodLabel}. Itens da revisão:\n${lines.join('\n') || '- nenhum item'}\nEscreva o roteiro de áudio com os pontos principais e o que revisar primeiro.`;
  }

  /** Limite de texto que vale a pena enviar para voz (evita áudios muito longos). */
  function speechText(reply, limit = 900) {
    const clean = String(reply || '').replace(/[*#`_>]+/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    const cut = clean.slice(0, limit);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    return end > limit / 2 ? cut.slice(0, end + 1) : cut;
  }

  /** Escapa HTML. Toda resposta do modelo passa por aqui antes de virar marcação. */
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Formatação inline depois do escape: **negrito**, *itálico* e `código`. Links não são criados. */
  function inline(escaped) {
    return escaped
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  }

  /**
   * Markdown mínimo e seguro para respostas do tutor: títulos, listas, tabelas, negrito, itálico e código.
   * Sempre escapa antes; o resultado é HTML seguro para innerHTML.
   */
  function renderMarkdown(text) {
    const lines = escapeHtml(text).replace(/\r/g, '').split('\n');
    const out = [];
    let list = null;
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1] || '';
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(next)) {
        flushPara(); closeList();
        const head = line.trim().slice(1, -1).split('|').map((c) => `<th>${inline(c.trim())}</th>`).join('');
        const rows = [];
        let j = i + 2;
        while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
          rows.push(`<tr>${lines[j].trim().slice(1, -1).split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`);
          j += 1;
        }
        out.push(`<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
        i = j - 1;
        continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { flushPara(); closeList(); const lvl = Math.min(4, h[1].length + 2); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }
      const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
      const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        flushPara();
        const kind = ul ? 'ul' : 'ol';
        if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
        continue;
      }
      if (!line.trim()) { flushPara(); closeList(); continue; }
      closeList();
      para.push(line);
    }
    flushPara();
    closeList();
    return out.join('');
  }

  return { MODES, studentContext, buildMessages, prepareAttachment, explainErrorText, weeklyScriptText, speechText, renderMarkdown, escapeHtml };
});
