/* Quebra de texto para síntese de voz: trechos curtos evitam cortes no áudio (o Magpie recomenda até ~400 caracteres por frase). */
'use strict';

/** Divide o texto em trechos de até `max` caracteres, preferindo quebrar em pontuação. */
function chunkText(text, max = 350) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const out = [];
  let cur = '';
  const push = () => { if (cur) out.push(cur); cur = ''; };
  for (let s of sentences) {
    while (s.length > max) {
      // frase longa demais: quebra no último separador antes do limite (vírgula, ponto e vírgula ou espaço)
      let cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max), s.lastIndexOf(' ', max));
      if (cut < max / 3) cut = max;
      const piece = s.slice(0, cut).trim();
      s = s.slice(cut).trim();
      if (cur && (cur + ' ' + piece).length > max) push();
      cur = cur ? `${cur} ${piece}` : piece;
      push();
    }
    if (!s) continue;
    if (cur && (cur + ' ' + s).length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

module.exports = { chunkText };
