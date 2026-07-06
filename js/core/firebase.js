/**
 * ===================== FIREBASE =====================
 * Inicializa Firebase e expõe auth + Firestore.
 * Nenhum outro módulo importa Firebase diretamente — tudo passa por aqui.
 */

const FirebaseApp = (() => {

  const config = {
    apiKey: "AIzaSyB0Y05VF7v4B-tjGgNc877iCqm9564hni4",
    authDomain: "life-os-ag.firebaseapp.com",
    projectId: "life-os-ag",
    storageBucket: "life-os-ag.firebasestorage.app",
    messagingSenderId: "779620319312",
    appId: "1:779620319312:web:2bffdeea56416b39e19155"
  };

  firebase.initializeApp(config);

  const auth = firebase.auth();
  const db = firebase.firestore();
  // Storage é opcional: se o SDK não carregou (CDN fora do ar, precache
  // desatualizado no PWA), não pode derrubar auth/firestore. Uploads de imagem
  // ficam desabilitados até o SDK voltar; o resto do app segue vivo.
  let storage = null;
  try { storage = firebase.storage(); }
  catch (err) { console.warn('[Firebase] Storage SDK indisponível:', err.message); }

  // Habilita cache offline do Firestore
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  // Processa resultado de qualquer redirect pendente (fallback seguro)
  auth.getRedirectResult().catch(() => {});

  /** Retorna referência ao documento do usuário logado */
  function getUserDoc() {
    const user = auth.currentUser;
    if (!user) return null;
    return db.collection('users').doc(user.uid);
  }

  /** Retorna referência a um caminho dentro da pasta do usuário no Storage. */
  function getUserStorageRef(path) {
    const user = auth.currentUser;
    if (!user || !storage) return null;
    return storage.ref(`users/${user.uid}/${path}`);
  }

  /** Referência do Storage a partir da URL pública (para deletar). */
  function storageRefFromUrl(url) {
    if (!storage) return null;
    return storage.refFromURL(url);
  }

  /** true se o SDK do Storage subiu — permite ao imageService falhar rápido. */
  function isStorageAvailable() {
    return storage !== null;
  }

  /** Login com conta Google */
  async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // signInWithPopup funciona em desktop e iOS Safari (acionado por gesto do usuário)
    // signInWithRedirect é bloqueado pelo ITP do Safari no iOS
    return auth.signInWithPopup(provider);
  }

  /** Logout */
  async function logout() {
    return auth.signOut();
  }

  /** Escuta mudanças no estado de autenticação */
  function onAuthChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }

  /** Retorna o usuário atual */
  function currentUser() {
    return auth.currentUser;
  }

  return {
    getUserDoc, getUserStorageRef, storageRefFromUrl, isStorageAvailable,
    loginWithGoogle, logout, onAuthChanged, currentUser
  };
})();
