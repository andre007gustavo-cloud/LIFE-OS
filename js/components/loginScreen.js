/**
 * ===================== LOGIN SCREEN =====================
 * Tela de login com Google. Mostrada quando o usuário não está autenticado.
 */

const LoginScreen = (() => {

  function show() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('fab').style.display = 'none';
  }

  function hide() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('fab').style.display = 'flex';
  }

  async function login() {
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="login-spinner"></span> Entrando...';
      await FirebaseApp.loginWithGoogle();
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        errEl.textContent = 'Login cancelado. Tente novamente.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errEl.textContent = 'Domínio não autorizado. Adicione este domínio no Firebase Console.';
      } else {
        errEl.textContent = 'Erro ao fazer login. Tente novamente.';
      }
      btn.disabled = false;
      btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" class="google-icon"> Entrar com Google';
    }
  }

  function logout() {
    Storage.stopListening();
    FirebaseApp.logout();
  }

  /** Atualiza a UI do nav com o nome/foto do usuário logado */
  function updateUserInfo() {
    const user = FirebaseApp.currentUser();
    const el = document.getElementById('user-info');
    if (!el || !user) return;

    const photo = user.photoURL || '';
    const name = (user.displayName || user.email || '').split(' ')[0];

    el.innerHTML = `
      ${photo ? `<img src="${photo}" class="user-avatar" alt="">` : ''}
      <span class="user-name">${name}</span>
      <button class="icon-btn" onclick="logoutUser()" title="Sair" style="color:var(--text3)">
        <i class="ti ti-logout"></i>
      </button>`;
  }

  return { show, hide, login, logout, updateUserInfo };
})();
