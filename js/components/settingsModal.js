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
      + trelloHtml()
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

  // ===== Integração: Trello =====

  function trelloHtml() {
    const c = TrelloService.getCredentials();
    const st = TrelloService.getStatus();
    return `<div class="fbset-section">Integração — Trello</div>
      <div class="trello-set">
        <div class="trello-set-status">${trelloStatusHtml(st)}</div>
        <label class="trello-set-field">
          <span>Chave (API key)</span>
          <input class="form-input" id="trello-apikey" value="${Utils.escapeAttr(c.apiKey)}" placeholder="sua API key">
        </label>
        <label class="trello-set-field">
          <span>Token</span>
          <input class="form-input" id="trello-token" type="password" value="${Utils.escapeAttr(c.token)}" placeholder="seu token">
        </label>
        <label class="trello-set-field">
          <span>ID da lista</span>
          <input class="form-input" id="trello-listid" value="${Utils.escapeAttr(c.listId)}" placeholder="ID da lista (ex.: Andre)">
        </label>
        <div class="trello-set-hint">Pegue a chave em trello.com/app-key, gere o token autorizando o app, e copie o ID da lista do quadro. Os cards viram tarefas na área Trabalho.</div>
        <div class="trello-set-actions">
          <button class="btn btn-primary btn-sm" onclick="SettingsModal.saveTrello()">Salvar</button>
          <button class="btn btn-ghost btn-sm" onclick="SettingsModal.syncTrello()">Sincronizar agora</button>
          <button class="btn btn-ghost btn-sm" onclick="SettingsModal.reimportTrello()">Reimportar tudo</button>
        </div>
      </div>`;
  }

  function trelloStatusHtml(st) {
    if (st.lastError) {
      return `<span style="color:var(--amber)"><i class="ti ti-alert-triangle"></i> ${Utils.escapeHtml(st.lastError)}</span>`;
    }
    if (!st.configured) {
      const faltam = [!st.hasKey && 'chave', !st.hasToken && 'token', !st.hasList && 'lista'].filter(Boolean).join(', ');
      return `<span style="color:var(--text3)"><i class="ti ti-plug-connected-x"></i> Não configurado neste dispositivo (faltam: ${faltam})</span>`;
    }
    const quando = st.lastSyncAt
      ? ' · última sync ' + new Date(st.lastSyncAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : ' · ainda não sincronizou nesta sessão';
    return `<span style="color:var(--green)"><i class="ti ti-plug-connected"></i> Conectado · ${st.importedCount} card(s) já importado(s)${quando}</span>`;
  }

  function saveTrello() {
    const apiKey = document.getElementById('trello-apikey').value;
    const token  = document.getElementById('trello-token').value;
    const listId = document.getElementById('trello-listid').value;
    const ok = TrelloService.saveCredentials({ apiKey, token, listId });
    Feedback.toast(
      ok ? 'Trello: credenciais salvas' : 'Trello: preencha chave, token e lista',
      ok ? 'success' : 'warn'
    );
    renderBody();
  }

  async function syncTrello() {
    Feedback.toast('Trello: sincronizando…', 'info');
    await TrelloService.syncNow();
    renderBody();
  }

  async function reimportTrello() {
    if (!confirm('Reimportar TODOS os cards da lista? Cards já importados antes podem virar tarefas duplicadas.')) return;
    TrelloService.resetSyncedCards();
    await TrelloService.syncNow();
    renderBody();
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

  return { open, toggle, test, saveTrello, syncTrello, reimportTrello };
})();
