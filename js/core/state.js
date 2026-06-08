/**
 * ===================== APP STATE =====================
 * Single, central place where all mutable application state lives.
 * Anywhere else that needs to read/write state goes through here.
 *
 * - DB: persistent data (tasks, areas, projects, finance)
 * - UI state: which view, which filter, which item is being edited
 */

const AppState = (() => {

  /** The database — loaded from storage on boot, persisted via Storage.save() */
  let DB = Storage.load();

  /** ===== UI state ===== */
  const ui = {
    // Task editing
    editTaskId: null,
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

  function persist() { Storage.save(DB); }

  /** Reload from storage — used after external mutations (rare) */
  function reload() { DB = Storage.load(); }

  return { DB: () => DB, getDB, persist, reload, ui };
})();
