/**
 * ===================== STORAGE =====================
 * Repository pattern: localStorage (cache rápido) + Firestore (nuvem).
 *
 * - save() grava local + envia pra nuvem com debounce (1.5s)
 * - loadFromCloud() carrega dados do Firestore
 * - listenForChanges() escuta atualizações em tempo real de outros dispositivos
 */

const Storage = (() => {

  let _saveTimer = null;
  let _unsubscribe = null;
  let _isSaving = false;
  const DEBOUNCE_MS = 1500;

  // ===== LOCAL (cache) =====

  function load() {
    try {
      const raw = localStorage.getItem(Constants.STORAGE_KEY);
      return JSON.parse(raw) || cloneSeedData();
    } catch {
      return cloneSeedData();
    }
  }

  function save(db) {
    // Salva local imediatamente (rápido)
    localStorage.setItem(Constants.STORAGE_KEY, JSON.stringify(db));
    // Envia pra nuvem com debounce
    _debounceSaveToCloud(db);
  }

  // ===== CLOUD (Firestore) =====

  async function loadFromCloud() {
    const docRef = FirebaseApp.getUserDoc();
    if (!docRef) return null;
    try {
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        return {
          tasks: data.tasks || [],
          areas: data.areas || [],
          projects: data.projects || [],
          finance: data.finance || [],
          finCats: data.finCats || []
        };
      }
    } catch (err) {
      console.warn('Erro ao carregar do Firestore:', err);
    }
    return null;
  }

  async function saveToCloud(db) {
    const docRef = FirebaseApp.getUserDoc();
    if (!docRef) return;
    _isSaving = true;
    try {
      await docRef.set({
        tasks: db.tasks || [],
        areas: db.areas || [],
        projects: db.projects || [],
        finance: db.finance || [],
        finCats: db.finCats || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.warn('Erro ao salvar no Firestore:', err);
    } finally {
      // Aguarda um pouco antes de voltar a escutar updates remotos
      setTimeout(() => { _isSaving = false; }, 1000);
    }
  }

  function _debounceSaveToCloud(db) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => saveToCloud(db), DEBOUNCE_MS);
  }

  // ===== REAL-TIME SYNC =====

  /** Escuta mudanças do Firestore (outros dispositivos) e chama callback com os dados */
  function listenForChanges(callback) {
    stopListening();
    const docRef = FirebaseApp.getUserDoc();
    if (!docRef) return;

    _unsubscribe = docRef.onSnapshot(snap => {
      // Ignora se estamos salvando (evita loop)
      if (_isSaving) return;
      // Ignora escritas locais pendentes
      if (snap.metadata.hasPendingWrites) return;

      if (snap.exists) {
        const data = snap.data();
        callback({
          tasks: data.tasks || [],
          areas: data.areas || [],
          projects: data.projects || [],
          finance: data.finance || [],
          finCats: data.finCats || []
        });
      }
    });
  }

  function stopListening() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
  }

  // ===== SEED / THEME =====

  function cloneSeedData() {
    return JSON.parse(JSON.stringify(Constants.SEED_DATA));
  }

  function loadTheme() {
    return localStorage.getItem(Constants.THEME_KEY) || 'dark';
  }

  function saveTheme(theme) {
    localStorage.setItem(Constants.THEME_KEY, theme);
  }

  return {
    load, save,
    loadFromCloud, saveToCloud,
    listenForChanges, stopListening,
    cloneSeedData,
    loadTheme, saveTheme
  };
})();
