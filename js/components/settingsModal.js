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
    renderRows();
    Modal.open('settings-modal');
  }

  function renderRows() {
    const prefs = Feedback.getPrefs();
    document.getElementById('settings-body').innerHTML = SETTINGS.map(s => `
      <div class="fbset-row" id="fbset-row-${s.key}">
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
      </div>`).join('');
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
