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

    // Finance modal type
    finType: 'despesa',
    finTab: 'resumo',

    // Calendar
    calView: 'day',
    calDate: new Date(),
    miniCalDate: new Date(),
    calFilters: { areas: new Set(), project: 'all' },

    // Task list (TickTick layout)
    ttList: 'hoje',
    ttDetailId: null,
    ttQuickPri: 'nenhuma',
    ttQuickDate: '',
    ttQuickTime: '',
    ttqPriIdx: 0,

    // Projects workspace
    activeProjectId: null,
    activeProjTab: 'overview',

    // Color pickers
    areaColorSel: Constants.COLORS[0],
    npColorSel: Constants.COLORS[0],

    // Day-popover state
    popoverDate: '',
    popoverPri: 'nenhuma',
    popoverPriIdx: 0
  };

  function getDB() { return DB; }

  /** Replace DB in memory (from remote sync). Does NOT trigger a save to cloud. */
  function setDB(newDB) {
    DB = newDB;
    // Atualiza cache local (sem enviar pro cloud)
    localStorage.setItem(Constants.STORAGE_KEY, JSON.stringify(DB));
  }

  /** Save current state to localStorage + cloud (debounced) */
  function persist() { Storage.save(DB); }

  /** Reload from local storage */
  function reload() { DB = Storage.load(); }

  return { DB: () => DB, getDB, setDB, persist, reload, ui };
})();
