/* Operações puras sobre o ciclo de estudos.
 * O ciclo é uma lista ordenada de blocos ({ id, subjectId }). O ponteiro `cursorId` aponta para o
 * PRÓXIMO bloco a estudar e é guardado pelo id do bloco, então reordenar ou editar não "desloca" a posição. */
(function (factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else window.OAB.lib.cycle = lib;
})(function () {
  const indexOf = (cycle, blockId) => cycle.findIndex((b) => b.id === blockId);

  /** Índice do bloco apontado pelo cursor (cai no 1º bloco se o cursor estiver inválido). */
  function cursorIndex(cycle, cursorId) {
    if (!cycle.length) return -1;
    const i = indexOf(cycle, cursorId);
    return i < 0 ? 0 : i;
  }

  /** Id do bloco que vem depois de `blockId` (com volta ao início). `null` se o bloco não existe. */
  function successorId(cycle, blockId) {
    const i = indexOf(cycle, blockId);
    if (i < 0 || !cycle.length) return null;
    return cycle[(i + 1) % cycle.length].id;
  }

  /** Quantas vezes cada matéria aparece no ciclo. */
  function countBySubject(cycle) {
    const counts = {};
    for (const b of cycle) counts[b.subjectId] = (counts[b.subjectId] || 0) + 1;
    return counts;
  }

  /** Insere um bloco após `afterId` (ou no fim). Retorna um novo array. */
  function addBlock(cycle, subjectId, makeId, afterId) {
    const copy = cycle.slice();
    const block = { id: makeId(), subjectId };
    const i = afterId ? indexOf(copy, afterId) : -1;
    if (i < 0) copy.push(block);
    else copy.splice(i + 1, 0, block);
    return { cycle: copy, block };
  }

  /** Duplica o bloco logo abaixo do original. */
  function duplicateBlock(cycle, blockId, makeId) {
    const i = indexOf(cycle, blockId);
    if (i < 0) return { cycle: cycle.slice(), block: null };
    const block = { id: makeId(), subjectId: cycle[i].subjectId };
    const copy = cycle.slice();
    copy.splice(i + 1, 0, block);
    return { cycle: copy, block };
  }

  /**
   * Remove um bloco. Se ele era o próximo (cursor), o cursor passa para o bloco que vinha depois,
   * como se o ciclo tivesse sido percorrido normalmente.
   */
  function removeBlock(cycle, cursorId, blockId) {
    const i = indexOf(cycle, blockId);
    if (i < 0) return { cycle: cycle.slice(), cursorId };
    const copy = cycle.slice();
    copy.splice(i, 1);
    if (!copy.length) return { cycle: copy, cursorId: null };
    let nextCursor = cursorId;
    if (cursorId === blockId) nextCursor = copy[i % copy.length].id;
    return { cycle: copy, cursorId: nextCursor };
  }

  /** Move um bloco para a posição `toIndex` (0-based). O cursor não muda: ele segue o bloco apontado. */
  function moveBlock(cycle, blockId, toIndex) {
    const from = indexOf(cycle, blockId);
    if (from < 0) return cycle.slice();
    const copy = cycle.slice();
    const [block] = copy.splice(from, 1);
    const to = Math.max(0, Math.min(copy.length, toIndex));
    copy.splice(to, 0, block);
    return copy;
  }

  /** Muda a matéria de um bloco existente. */
  function setBlockSubject(cycle, blockId, subjectId) {
    return cycle.map((b) => (b.id === blockId ? { ...b, subjectId } : b));
  }

  /**
   * Ajusta quantas vezes uma matéria aparece. Acrescenta após a última ocorrência (ou no fim)
   * e remove a partir da última ocorrência, sem remover o bloco que está como próximo.
   * `shortfall` informa quantas remoções não foram possíveis por causa disso.
   */
  function setSubjectCount(cycle, cursorId, subjectId, target, makeId) {
    const wanted = Math.max(0, Math.floor(target));
    const copy = cycle.slice();
    const occurrences = [];
    copy.forEach((b, i) => {
      if (b.subjectId === subjectId) occurrences.push(i);
    });
    let shortfall = 0;
    if (wanted > occurrences.length) {
      const insertAt = occurrences.length ? occurrences[occurrences.length - 1] + 1 : copy.length;
      const extra = Array.from({ length: wanted - occurrences.length }, () => ({ id: makeId(), subjectId }));
      copy.splice(insertAt, 0, ...extra);
    } else if (wanted < occurrences.length) {
      let toRemove = occurrences.length - wanted;
      for (let k = occurrences.length - 1; k >= 0 && toRemove > 0; k--) {
        const idx = occurrences[k];
        if (copy[idx].id === cursorId) continue;
        copy.splice(idx, 1);
        toRemove -= 1;
      }
      shortfall = toRemove;
    }
    const cursorStillThere = copy.some((b) => b.id === cursorId);
    return { cycle: copy, cursorId: cursorStillThere ? cursorId : (copy[0] && copy[0].id) || null, shortfall };
  }

  /** Garante que o cursor aponta para um bloco existente. */
  function sanitizeCursor(cycle, cursorId) {
    if (!cycle.length) return null;
    return indexOf(cycle, cursorId) >= 0 ? cursorId : cycle[0].id;
  }

  return {
    cursorIndex, successorId, countBySubject,
    addBlock, duplicateBlock, removeBlock, moveBlock, setBlockSubject, setSubjectCount, sanitizeCursor,
  };
});
