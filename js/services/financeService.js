/**
 * ===================== FINANCE SERVICE =====================
 * Manages financial entries (receitas/despesas) and categories.
 */

const FinanceService = (() => {

  function getAll() {
    return AppState.getDB().finance;
  }

  function getCategories() {
    return AppState.getDB().finCats;
  }

  function getCategoryById(id) {
    return AppState.getDB().finCats.find(c => c.id === id);
  }

  function create({ type, desc, value, date, cat }) {
    const entry = {
      id: Utils.uid(),
      type, desc, value, date, cat
    };
    AppState.getDB().finance.push(entry);
    AppState.persist();
    return entry;
  }

  function remove(id) {
    AppState.getDB().finance = AppState.getDB().finance.filter(e => e.id !== id);
    AppState.persist();
  }

  // ===== Aggregations =====

  /** Returns finance entries for the given YYYY-MM month prefix */
  function forMonth(monthPrefix) {
    return getAll().filter(e => e.date.startsWith(monthPrefix));
  }

  function currentMonthPrefix() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Returns { receitas, despesas, saldo, pctComprometido } for given entries */
  function summarize(entries) {
    const receitas = entries
      .filter(e => e.type === 'receita')
      .reduce((s, e) => s + e.value, 0);
    const despesas = entries
      .filter(e => e.type === 'despesa')
      .reduce((s, e) => s + e.value, 0);
    const saldo = receitas - despesas;
    const pctComprometido = receitas > 0
      ? Math.min(100, despesas / receitas * 100)
      : (despesas > 0 ? 100 : 0);
    return { receitas, despesas, saldo, pctComprometido };
  }

  /** Datas com algum lançamento — sinal de atividade para a sequência global. */
  function entryDates() {
    return getAll().filter(e => e.date).map(e => e.date);
  }

  /** Returns per-category totals for given entries */
  function byCategory(entries) {
    return getCategories().map(c => {
      const ents = entries.filter(e => e.cat === c.id);
      return {
        ...c,
        total: ents.reduce((s, e) => s + e.value, 0),
        isRec: ents.some(e => e.type === 'receita')
      };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  }

  return {
    getAll, getCategories, getCategoryById,
    create, remove,
    forMonth, currentMonthPrefix, summarize, byCategory, entryDates
  };
})();
