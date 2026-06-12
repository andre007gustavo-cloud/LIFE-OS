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

  /** Atualiza a UI do nav com avatar (iniciais), nome e estado de sync */
  function updateUserInfo() {
    const user = FirebaseApp.currentUser();
    const el = document.getElementById('user-info');
    if (!el || !user) return;

    const fullName = (user.displayName || user.email || '').trim();
    const firstName = fullName.split(' ')[0];
    const initials = fullName.split(' ').filter(Boolean).slice(0, 2)
      .map(part => part[0]).join('').toUpperCase();

    el.innerHTML = `
      <div class="user-avatar-initials">${Utils.escapeHtml(initials)}</div>
      <div class="user-block-info">
        <div class="user-name">${Utils.escapeHtml(firstName)}</div>
        <div class="sync-indicator">
          <span class="sync-dot" id="sync-dot"></span><span class="sync-label" id="sync-label"></span>
        </div>
      </div>
      <button class="icon-btn" onclick="openSettingsModal()" title="Configurações" style="color:var(--text3)">
        <i class="ti ti-settings"></i>
      </button>
      <button class="icon-btn" onclick="logoutUser()" title="Sair" style="color:var(--text3)">
        <i class="ti ti-logout"></i>
      </button>`;

    setSyncState(_syncState);
  }

  // ===== Indicador de sincronização (alimentado pelo Storage via app.js) =====

  let _syncState = 'synced';
  const SYNC_LABELS = {
    synced: 'Sincronizado',
    saving: 'Salvando...',
    offline: 'Offline'
  };

  function setSyncState(state) {
    _syncState = SYNC_LABELS[state] ? state : 'synced';
    const dot = document.getElementById('sync-dot');
    const label = document.getElementById('sync-label');
    if (!dot || !label) return;
    dot.className = 'sync-dot ' + _syncState;
    label.textContent = SYNC_LABELS[_syncState];
  }

  return { show, hide, login, logout, updateUserInfo, setSyncState };
})();
