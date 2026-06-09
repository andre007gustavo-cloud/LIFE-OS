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

  return { getUserDoc, loginWithGoogle, logout, onAuthChanged, currentUser };
})();
