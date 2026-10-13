/* Utilitários puros: datas, formatação, identificadores e catálogos.
 * Funciona como módulo CommonJS (testes) e como script comum no navegador. */
(function (factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else {
    window.OAB = window.OAB || { lib: {}, views: {}, ui: {} };
    window.OAB.lib.util = lib;
  }
})(function () {
  const DAY_MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  let seq = 0;
  function uid(prefix) {
    seq = (seq + 1) % 1679616;
    return `${prefix || 'id'}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /* ---------- datas (strings YYYY-MM-DD; aritmética em UTC para evitar fuso/horário de verão) ---------- */
  function todayISO(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  const toUTC = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const fromUTC = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const addDays = (iso, n) => fromUTC(toUTC(iso) + n * DAY_MS);
  const diffDays = (fromIso, toIso) => Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY_MS);
  const weekday = (iso) => new Date(toUTC(iso)).getUTCDay(); // 0 = domingo
  const weekStart = (iso) => addDays(iso, -((weekday(iso) + 6) % 7)); // segunda-feira
  const weekRange = (iso) => {
    const from = weekStart(iso);
    return { from, to: addDays(from, 6) };
  };

  /* ---------- formatação (pt-BR) ---------- */
  const nfPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const nfInt = new Intl.NumberFormat('pt-BR');
  const nfHours = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  const fmtPct = (v) => (v == null || Number.isNaN(v) ? '—' : `${nfPct.format(v)}%`);
  const fmtInt = (v) => (v == null || Number.isNaN(v) ? '—' : nfInt.format(v));
  const fmtDate = (iso) => {
    if (!isISODate(iso)) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const fmtDayMonth = (iso) => (isISODate(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
  const fmtDateTime = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${fmtDate(todayISO(d))} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtMinutes = (ms) => {
    const totalMin = Math.round(Math.max(0, ms || 0) / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h}h ${pad(m)}min` : `${m} min`;
  };
  const fmtClock = (ms) => {
    const s = Math.floor(Math.max(0, ms || 0) / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const fmtHours = (ms) => `${nfHours.format((ms || 0) / 3600000)} h`;
  const fmtSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };
  const weekdayName = (iso) => ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][weekday(iso)];

  /* ---------- números e texto ---------- */
  const pctOf = (part, total) => (total > 0 ? (part / total) * 100 : null);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const normalize = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });

  /* ---------- catálogos ---------- */
  const PRIORITIES = [
    { id: 'alta', label: 'Alta', order: 0 },
    { id: 'media', label: 'Média', order: 1 },
    { id: 'baixa', label: 'Baixa', order: 2 },
  ];
  const TOPIC_STATUS = [
    { id: 'pendente', label: 'Pendente' },
    { id: 'estudando', label: 'Em estudo' },
    { id: 'estudado', label: 'Estudado' },
  ];
  const ORIGINS = [
    { id: 'gran', label: 'Gran Curso' },
    { id: 'estrategia', label: 'Estratégia' },
    { id: 'qconcursos', label: 'QConcursos' },
    { id: 'outra', label: 'Outra plataforma' },
    { id: 'prova_anterior', label: 'Prova anterior' },
    { id: 'simulado', label: 'Simulado' },
  ];
  const MATERIAL_SOURCES = [
    { id: 'gran', label: 'Gran Curso' },
    { id: 'estrategia', label: 'Estratégia' },
    { id: 'outro', label: 'Outro' },
  ];
  const MATERIAL_STATUS = [
    { id: 'nao_iniciado', label: 'Não iniciado' },
    { id: 'em_andamento', label: 'Em andamento' },
    { id: 'concluido', label: 'Concluído' },
  ];
  const ERROR_STATUS = [
    { id: 'pendente', label: 'Pendente' },
    { id: 'revisado', label: 'Revisado' },
    { id: 'recorrente', label: 'Erro recorrente' },
  ];
  const ERROR_KIND = [
    { id: 'erro', label: 'Erro' },
    { id: 'duvida', label: 'Acerto por chute / dúvida' },
  ];
  const CHECKLIST = [
    { key: 'teoria', label: 'Estudei a teoria' },
    { key: 'questoes', label: 'Resolvi questões' },
    { key: 'registros', label: 'Registrei acertos e erros' },
    { key: 'caderno', label: 'Atualizei o caderno de erros' },
    { key: 'material', label: 'Registrei o material utilizado' },
  ];

  const labelOf = (list, id, fallback) => {
    const found = list.find((x) => x.id === id);
    return found ? found.label : fallback || '—';
  };

  return {
    DAY_MS, pad, uid,
    todayISO, isISODate, addDays, diffDays, weekday, weekStart, weekRange, toUTC, fromUTC,
    fmtPct, fmtInt, fmtDate, fmtDayMonth, fmtDateTime, fmtMinutes, fmtClock, fmtHours, fmtSize, weekdayName,
    pctOf, clamp, normalize, compareText,
    PRIORITIES, TOPIC_STATUS, ORIGINS, MATERIAL_SOURCES, MATERIAL_STATUS, ERROR_STATUS, ERROR_KIND, CHECKLIST,
    labelOf,
  };
});
