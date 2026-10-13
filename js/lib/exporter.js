/* Exportação para CSV (separador ponto e vírgula, aberto direto no Excel em português) e geração do relatório. */
(function (factory) {
  const U = typeof require === 'function' ? require('./util') : window.OAB.lib.util;
  const lib = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.exporter = lib;
})(function (U) {
  const SEP = ';';

  /** Escapa um campo: aspas duplicadas, e o campo entre aspas se tiver separador, aspas ou quebra de linha. */
  function cell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** Monta o CSV com BOM (para o Excel reconhecer acentos). */
  function toCSV(headers, rows) {
    const lines = [headers.map(cell).join(SEP), ...rows.map((r) => r.map(cell).join(SEP))];
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function logsCSV(logs, names) {
    const headers = ['Data', 'Disciplina', 'Assunto cadastrado', 'Subtópico', 'Banca', 'Prova', 'Origem', 'Total', 'Acertos', 'Erros', 'Brancos', 'Aproveitamento (%)', 'Tempo (min)', 'Observações'];
    const rows = logs
      .slice()
      .sort((a, b) => U.compareText(a.date, b.date))
      .map((l) => [
        U.fmtDate(l.date), names.subject(l.subjectId), names.topic(l.topicId), l.subtopic, l.banca, l.prova,
        U.labelOf(U.ORIGINS, l.origem), l.total, l.correct, l.wrong, l.blank,
        l.total ? String(Math.round((l.correct / l.total) * 10000) / 100).replace('.', ',') : '',
        l.minutes == null ? '' : l.minutes, l.notes,
      ]);
    return toCSV(headers, rows);
  }

  function errorsCSV(errors, names) {
    const headers = ['Data', 'Disciplina', 'Assunto cadastrado', 'Subtópico', 'Questão', 'Tipo', 'Status', 'Origem', 'Motivo', 'Regra correta', 'Anotação', 'Tentativas', 'Última tentativa'];
    const rows = errors
      .slice()
      .sort((a, b) => U.compareText(a.date, b.date))
      .map((e) => {
        const last = (e.attempts || [])[(e.attempts || []).length - 1];
        return [
          U.fmtDate(e.date), names.subject(e.subjectId), names.topic(e.topicId), e.subtopic, e.ref,
          U.labelOf(U.ERROR_KIND, e.kind), U.labelOf(U.ERROR_STATUS, e.status), U.labelOf(U.ORIGINS, e.origem),
          e.reason, e.rule, e.note, (e.attempts || []).length, last ? `${U.fmtDate(last.date)} · ${last.result === 'acerto' ? 'acertei' : 'errei'}` : '',
        ];
      });
    return toCSV(headers, rows);
  }

  function sessionsCSV(sessions, names, elapsedFn) {
    const headers = ['Início', 'Fim', 'Disciplina', 'Assunto', 'Status', 'Teoria (min)', 'Questões (min)', 'Total (min)', 'Pendências', 'Anotações'];
    const rows = sessions
      .slice()
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .map((s) => {
        const e = elapsedFn(s);
        return [
          U.fmtDateTime(s.startedAt), s.endedAt ? U.fmtDateTime(s.endedAt) : '', names.subject(s.subjectId), names.topic(s.topicId),
          s.status, Math.round(e.teoria / 60000), Math.round(e.questoes / 60000), Math.round(e.total / 60000),
          (s.pendencias || []).join(' / '), s.notes,
        ];
      });
    return toCSV(headers, rows);
  }

  /** Relatório consolidado para impressão: recebe os indicadores já calculados pela tela. */
  function reportModel({ period, totals, subjects, simulados, sessions, errorsOpen, goals }) {
    return { period, totals, subjects, simulados, sessions, errorsOpen, goals };
  }

  return { cell, toCSV, logsCSV, errorsCSV, sessionsCSV, reportModel, SEP };
});
