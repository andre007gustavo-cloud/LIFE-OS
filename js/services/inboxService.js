/**
 * ===================== INBOX SERVICE =====================
 * Caixa de entrada universal (GTD): capturas rápidas ainda não processadas.
 * Item: { id, text, createdAt (epoch ms), source: 'texto' | 'voz' }
 * Knows nothing about the DOM.
 */

const InboxService = (() => {

  /** Garante o array — DBs criados antes da feature não têm a chave inbox */
  function _items() {
    const db = AppState.getDB();
    if (!db.inbox) db.inbox = [];
    return db.inbox;
  }

  function getAll() {
    return _items();
  }

  function getById(id) {
    return _items().find(i => i.id === id);
  }

  function count() {
    return _items().length;
  }

  function add(text, source = 'texto') {
    const item = {
      id: Utils.uid(),
      text: String(text || '').trim(),
      createdAt: Date.now(),
      source
    };
    if (!item.text) return null;
    _items().push(item);
    AppState.persist();
    return item;
  }

  function update(id, text) {
    const item = getById(id);
    if (!item) return null;
    item.text = String(text || '').trim();
    AppState.persist();
    return item;
  }

  function remove(id) {
    const db = AppState.getDB();
    db.inbox = _items().filter(i => i.id !== id);
    AppState.persist();
  }

  /** Datas de captura ainda pendentes — sinal de atividade para a sequência
   *  global. Itens processados são removidos; a captura é o rastro durável. */
  function capturedDates() {
    return _items().map(i => Utils.toISO(new Date(i.createdAt)));
  }

  return { getAll, getById, count, add, update, remove, capturedDates };
})();
