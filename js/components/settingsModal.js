/**
 * ===================== SETTINGS MODAL =====================
 * Configurações do app (Fase 8). Hoje: preferências de feedback sensorial
 * (animações, sons, confete), cada uma com botão "Testar". A lista SETTINGS
 * é o ponto de extensão para futuras configurações.
 */

const SettingsModal = (() => {

  const SETTINGS = [
    {
      key: 'animations', label: 'Animações', icon: 'ti-sparkles',
      hint: 'Pulsos, transições e entradas de lista',
      test: () => Feedback.pulse('#fbset-row-animations')
    },
    {
      key: 'sounds', label: 'Sons', icon: 'ti-volume',
      hint: 'Tons curtos ao concluir tarefas e ciclos',
      test: () => Feedback.celebrate('medium')
    },
    {
      key: 'confetti', label: 'Confete', icon: 'ti-confetti',
      hint: 'Só nas grandes vitórias (dia limpo, marcos)',
      test: () => Feedback.celebrate('large')
    }
  ];

  function open() {
    renderBody();
    Modal.open('settings-modal');
  }

  function renderBody() {
    document.getElementById('settings-body').innerHTML =
      '<div class="fbset-section">Feedback sensorial</div>'
      + SETTINGS.map(feedbackRowHtml).join('')
      + appearanceHtml()
      + accountHtml();
  }

  function feedbackRowHtml(s) {
    const prefs = Feedback.getPrefs();
    return `<div class="fbset-row" id="fbset-row-${s.key}">
      <i class="ti ${s.icon} fbset-icon"></i>
      <div class="fbset-info">
        <div class="fbset-label">${s.label}</div>
        <div class="fbset-hint">${s.hint}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="SettingsModal.test('${s.key}')">Testar</button>
      <label class="fb-switch">
        <input type="checkbox" ${prefs[s.key] ? 'checked' : ''}
               onchange="SettingsModal.toggle('${s.key}', this.checked)">
        <span class="fb-switch-slider"></span>
      </label>
    </div>`;
  }

  /** No mobile o botão de tema sai da nav — fica acessível aqui */
  function appearanceHtml() {
    return `<div class="fbset-section">Aparência</div>
      <div class="fbset-row">
        <i class="ti ti-contrast fbset-icon"></i>
        <div class="fbset-info">
          <div class="fbset-label">Tema</div>
          <div class="fbset-hint">Alternar entre claro e escuro</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="toggleTheme()">Alternar</button>
      </div>`;
  }

  /** No mobile o botão de sair também sai da nav — fica acessível aqui */
  function accountHtml() {
    return `<div class="fbset-section">Conta</div>
      <div class="fbset-row">
        <i class="ti ti-logout fbset-icon"></i>
        <div class="fbset-info">
          <div class="fbset-label">Sessão</div>
          <div class="fbset-hint">Desconectar desta conta</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="logoutUser()">Sair</button>
      </div>`;
  }

  function toggle(key, checked) {
    Feedback.setPref(key, checked);
  }

  function test(key) {
    const setting = SETTINGS.find(s => s.key === key);
    if (!setting) return;
    if (!Feedback.getPrefs()[key]) {
      Feedback.toast('Ative o controle ao lado para sentir o efeito', 'info');
      return;
    }
    setting.test();
  }

  return { open, toggle, test };
})();
