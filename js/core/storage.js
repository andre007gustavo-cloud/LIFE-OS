/**
 * ===================== STORAGE =====================
 * Repository pattern abstracting localStorage.
 * Application code never touches localStorage directly — always goes through here.
 * This means we could swap to IndexedDB, an API, etc. without touching business logic.
 */

const Storage = (() => {

  function load() {
    try {
      const raw = localStorage.getItem(Constants.STORAGE_KEY);
      return JSON.parse(raw) || cloneSeedData();
    } catch {
      return cloneSeedData();
    }
  }

  function save(db) {
    localStorage.setItem(Constants.STORAGE_KEY, JSON.stringify(db));
  }

  function cloneSeedData() {
    return JSON.parse(JSON.stringify(Constants.SEED_DATA));
  }

  // ===== Theme persistence (separate key) =====

  function loadTheme() {
    return localStorage.getItem(Constants.THEME_KEY) || 'dark';
  }

  function saveTheme(theme) {
    localStorage.setItem(Constants.THEME_KEY, theme);
  }

  return { load, save, loadTheme, saveTheme };
})();
