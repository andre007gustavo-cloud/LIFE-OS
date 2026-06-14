/**
 * ===================== APP STATE =====================
 * Single, central place where all mutable application state lives.
 *
 * - DB: persistent data (tasks, areas, projects, finance)
 * - UI state: which view, which filter, which item is being edited
 * - setDB(): used by real-time sync to replace the entire DB without triggering a save
 */

const AppState = (() => {

  /** The database — loaded from storage on boot, persisted via Storage.save() */
  let DB = Storage.load();

  /** ===== UI state ===== */
  const ui = {
    // Task editing
    editTaskId: null,
    inboxEditId: null,
    areaEditId: null,
    editProjectId: null,
    editNoteId: null,

    // Finance modal type: 'saida' | 'entrada' | 'transferencia'
    finType: 'saida',

    // Calendar
    calView: 'month',
    calDate: new Date(),
    miniCalDate: new Date(),
    calFilters: { areas: new Set(), project: 'all' },

    // Task list (TickTick layout)
    ttList: 'hoje',
    ttDetailId: null,
    ttQuickPri: 'nenhuma',
    ttQuickSched: { date: '', dateend: '', start: '', end: '', recurrence: '' },
    ttqPriIdx: 0,

    // Projects workspace
    activeProjectId: null,
    activeProjTab: 'overview',

    // Habits
    habitEditId: null,

    // Modo dia difícil: listas expandidas via "ver tudo" (só nesta sessão)
    hardExpandedDash: false,
    hardExpandedTasks: false,

    // Color pickers
    areaColorSel: Constants.COLORS[0],
    npColorSel: Constants.COLORS[0],
    habitColorSel: Constants.COLORS[0],

    // Day-popover state
    popoverDate: '',
    popoverPri: 'nenhuma',
    popoverPriIdx: 0,
    popoverArea: '',
    popoverSched: { date: '', dateend: '', start: '', end: '', recurrence: '' }
  };

  function getDB() { return DB; }

  /** True enquanto aplicamos dados vindos da nuvem (sync). */
  let _applyingRemote = false;

  /** Replace DB in memory (from remote sync). Does NOT trigger a save to cloud. */
  function setDB(newDB) {
    DB = newDB;
    // Atualiza cache local (sem enviar pro cloud)
    localStorage.setItem(Constants.STORAGE_KEY, JSON.stringify(DB));
  }

  /**
   * Aplica um estado vindo da nuvem e roda o render, sem que NADA disso seja
   * regravado na nuvem. Render do sync pode disparar persist() incidental
   * (ex.: ActivityService.refresh) — isso gravaria o estado recém-recebido de
   * volta e, se ele estivesse atrasado, apagaria mudanças locais (loop que
   * fazia lançamentos sumirem). Por isso persist() é suprimido aqui.
   */
  function applyRemote(newDB, afterFn) {
    _applyingRemote = true;
    try {
      setDB(newDB);
      if (afterFn) afterFn();
    } finally {
      _applyingRemote = false;
    }
  }

  /**
   * Save current state to localStorage + cloud (debounced).
   * Carimba a data da última atividade — toda mutação passa por aqui, então é
   * o único ponto de onde o "recomeço sem culpa" mede a ausência do usuário.
   */
  function persist() {
    if (_applyingRemote) return; // não regrava na nuvem o que acabou de chegar dela
    if (!DB.meta) DB.meta = {};
    DB.meta.lastActivity = Utils.today();
    Storage.save(DB);
  }

  /** Reload from local storage */
  function reload() { DB = Storage.load(); }

  return { DB: () => DB, getDB, setDB, applyRemote, persist, reload, ui };
})();
