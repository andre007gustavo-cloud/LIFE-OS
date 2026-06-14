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
  let _pendingDB = null;
  let _unsubscribe = null;
  let _isSaving = false;
  const DEBOUNCE_MS = 1500;

  // ===== Sync state observer ('synced' | 'saving' | 'offline') =====
  // Permite à UI (indicador na nav) reagir sem conhecer o storage por dentro.

  const _syncListeners = [];
  let _syncState = navigator.onLine ? 'synced' : 'offline';

  /** Registra callback de estado de sync; chama imediatamente com o estado atual */
  function onSyncStateChange(callback) {
    _syncListeners.push(callback);
    callback(_syncState);
  }

  function _setSyncState(state) {
    if (state === _syncState) return;
    _syncState = state;
    _syncListeners.forEach(cb => cb(state));
  }

  window.addEventListener('offline', () => _setSyncState('offline'));
  window.addEventListener('online', () =>
    _setSyncState(_saveTimer || _pendingDB || _isSaving ? 'saving' : 'synced'));

  // Fechar/minimizar a aba antes do debounce de 1.5s perderia o sync na nuvem.
  // O Firestore (com persistence ativa) enfileira a escrita e completa depois.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSave();
  });
  window.addEventListener('beforeunload', flushPendingSave);

  function flushPendingSave() {
    if (!_saveTimer) return;
    clearTimeout(_saveTimer);
    _saveTimer = null;
    if (_pendingDB) saveToCloud(_pendingDB);
  }

  // ===== LOCAL (cache) =====

  function load() {
    try {
      const raw = localStorage.getItem(Constants.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // Preenche chaves novas ausentes (ex.: contas/categorias/transacoes da
      // Fase 1) sem sobrescrever os dados já existentes do usuário.
      return parsed ? { ...cloneSeedData(), ...parsed } : cloneSeedData();
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
          finCats: data.finCats || [],
          contas: data.contas || [],
          categorias: data.categorias || [],
          transacoes: data.transacoes || [],
          inbox: data.inbox || [],
          habits: data.habits || [],
          habitLogs: data.habitLogs || [],
          hardModeDates: data.hardModeDates || [],
          weeklyGoals: data.weeklyGoals || [],
          reviewLogs: data.reviewLogs || [],
          events: data.events || [],
          activityShields: data.activityShields || { available: 0, history: [] },
          activityRecord: data.activityRecord || { max: 0, achievedAt: '' },
          meta: data.meta || {}
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
    _pendingDB = null;
    // Offline, o set() fica enfileirado pelo Firestore — indica vermelho, não "salvando"
    _setSyncState(navigator.onLine ? 'saving' : 'offline');
    try {
      await docRef.set({
        tasks: db.tasks || [],
        areas: db.areas || [],
        projects: db.projects || [],
        finance: db.finance || [],
        finCats: db.finCats || [],
        contas: db.contas || [],
        categorias: db.categorias || [],
        transacoes: db.transacoes || [],
        inbox: db.inbox || [],
        habits: db.habits || [],
        habitLogs: db.habitLogs || [],
        hardModeDates: db.hardModeDates || [],
        weeklyGoals: db.weeklyGoals || [],
        reviewLogs: db.reviewLogs || [],
        events: db.events || [],
        activityShields: db.activityShields || { available: 0, history: [] },
        activityRecord: db.activityRecord || { max: 0, achievedAt: '' },
        meta: db.meta || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }); // não deixa um cliente que omite um campo (ex.: versão
      // antiga sem 'transacoes') apagá-lo; clientes atuais enviam tudo
      _setSyncState('synced');
      // Aguarda um pouco antes de voltar a escutar updates remotos
      setTimeout(() => { _isSaving = false; }, 1000);
    } catch (err) {
      console.error('Erro ao salvar no Firestore:', err);
      _isSaving = false;
      _setSyncState('offline');
      _notifySyncError();
    }
  }

  function _debounceSaveToCloud(db) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _pendingDB = db;
    _setSyncState(navigator.onLine ? 'saving' : 'offline');
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      saveToCloud(db);
    }, DEBOUNCE_MS);
  }

  /** Toast discreto quando o save na nuvem falha (dados continuam no dispositivo) */
  function _notifySyncError() {
    if (document.getElementById('sync-error-toast')) return;
    const el = document.createElement('div');
    el.id = 'sync-error-toast';
    el.textContent = '⚠️ Falha ao sincronizar com a nuvem — os dados estão salvos neste dispositivo';
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);'
      + 'background:#7f1d1d;color:#fff;padding:10px 16px;border-radius:10px;'
      + 'font-size:13px;z-index:9999;max-width:calc(100vw - 32px);text-align:center;'
      + 'box-shadow:0 4px 16px #00000066';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  // ===== REAL-TIME SYNC =====

  /** Escuta mudanças do Firestore (outros dispositivos) e chama callback com os dados */
  function listenForChanges(callback) {
    stopListening();
    const docRef = FirebaseApp.getUserDoc();
    if (!docRef) return;

    _unsubscribe = docRef.onSnapshot({ includeMetadataChanges: false }, snap => {
      // Só reage a mudanças CONFIRMADAS pelo servidor (outros dispositivos).
      // O cache local do Firestore pode emitir um snapshot com estado ANTIGO
      // (ex.: transacoes=0 guardado de antes), que sobrescreveria os dados bons
      // recém-salvos — era o que apagava lançamentos logo após criá-los.
      if (snap.metadata.fromCache) return;
      // Ignora enquanto há escrita local em andamento OU pendente (debounce)
      if (_isSaving || _saveTimer || _pendingDB) return;
      // Ignora escritas locais ainda não confirmadas
      if (snap.metadata.hasPendingWrites) return;

      if (snap.exists) {
        const data = snap.data();
        callback({
          tasks: data.tasks || [],
          areas: data.areas || [],
          projects: data.projects || [],
          finance: data.finance || [],
          finCats: data.finCats || [],
          contas: data.contas || [],
          categorias: data.categorias || [],
          transacoes: data.transacoes || [],
          inbox: data.inbox || [],
          habits: data.habits || [],
          habitLogs: data.habitLogs || [],
          hardModeDates: data.hardModeDates || [],
          weeklyGoals: data.weeklyGoals || [],
          reviewLogs: data.reviewLogs || [],
          events: data.events || [],
          activityShields: data.activityShields || { available: 0, history: [] },
          activityRecord: data.activityRecord || { max: 0, achievedAt: '' },
          meta: data.meta || {}
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
    onSyncStateChange,
    cloneSeedData,
    loadTheme, saveTheme
  };
})();
