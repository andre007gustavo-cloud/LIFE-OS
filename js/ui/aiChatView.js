/**
 * ===================== AI CHAT VIEW =====================
 * Interface do assistente, usada em DOIS pontos de entrada que compartilham o
 * mesmo render das mensagens:
 *   1. FAB flutuante + drawer lateral direito (visível em qualquer view)
 *   2. Aba dedicada "Assistente" (view 'ia'), em tela cheia
 *
 * O estado da conversa vive no AiService; aqui só desenhamos e captamos input
 * (texto e voz via Web Speech API). Reage às mudanças via AiService.onUpdate.
 */

const AiChatView = (() => {

  const esc = Utils.escapeHtml;
  const MOUNTS = ['view', 'drawer'];

  let _recognition = null;
  let _activeMicMount = null;

  // ===== Nomes amigáveis das ferramentas de leitura (transparência no chat) =====
  const READ_NAMES = {
    get_overview: 'visão geral', list_tasks: 'tarefas', list_projects: 'projetos',
    list_areas: 'áreas', finance_overview: 'finanças', list_transactions: 'lançamentos',
    simulate_spend: 'simulação de gasto', list_habits: 'hábitos', get_calendar: 'agenda'
  };

  // ===== Markdown básico (escapado antes) =====

  function md(text) {
    let s = esc(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
    s = s.replace(/(^|<br>)\s*-\s+(.+?)(?=<br>|$)/g, '$1• $2');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // ===== Shell (montado uma vez por ponto de entrada) =====

  function buildShell(mount) {
    const closeBtn = mount === 'drawer'
      ? `<button class="icon-btn" title="Fechar" onclick="AiChatView.closeDrawer()"><i class="ti ti-x"></i></button>`
      : '';
    return `
      <div class="ai-chat" data-mount="${mount}">
        <div class="ai-head">
          <div class="ai-head-title"><i class="ti ti-sparkles"></i> Assistente</div>
          <div class="ai-head-actions">
            <button class="icon-btn" title="Limpar conversa" onclick="AiChatView.clear()"><i class="ti ti-trash"></i></button>
            ${closeBtn}
          </div>
        </div>
        <div class="ai-msgs" id="ai-msgs-${mount}"></div>
        <div class="ai-input-bar">
          <textarea class="ai-input" id="ai-input-${mount}" rows="1"
                    placeholder="Pergunte ou peça algo…"
                    onkeydown="AiChatView.inputKey(event,'${mount}')"></textarea>
          <button class="ai-mic icon-btn" id="ai-mic-${mount}" title="Falar"
                  onclick="AiChatView.startVoice('${mount}')"><i class="ti ti-microphone"></i></button>
          <button class="ai-send" title="Enviar" onclick="AiChatView.send('${mount}')">
            <i class="ti ti-send"></i>
          </button>
        </div>
      </div>`;
  }

  // ===== Mensagens =====

  function emptyHint() {
    return `<div class="ai-empty">
        <i class="ti ti-sparkles"></i>
        <div>Pergunte sobre suas tarefas, finanças, hábitos ou peça uma ação.</div>
        <div class="ai-empty-ex">"como tão minhas finanças?" · "cria uma tarefa pra amanhã 14h" · "posso gastar 200 no mercado?"</div>
      </div>`;
  }

  function toolNote(block) {
    const w = AiTools.isWrite(block.name);
    const label = w ? AiService.actionPreview(block).titulo : (READ_NAMES[block.name] || block.name);
    return `<div class="ai-tool"><i class="ti ${w ? 'ti-tool' : 'ti-search'}"></i> ${w ? 'propôs' : 'consultou'} ${esc(label.toLowerCase())}</div>`;
  }

  function renderMessage(m) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') return `<div class="ai-bubble user">${esc(m.content)}</div>`;
      return ''; // tool_result interno: não mostra
    }
    // assistant
    if (typeof m.content === 'string') return `<div class="ai-bubble bot">${md(m.content)}</div>`;
    return (m.content || []).map(b => {
      if (b.type === 'text' && b.text.trim()) return `<div class="ai-bubble bot">${md(b.text)}</div>`;
      if (b.type === 'tool_use') return toolNote(b);
      return '';
    }).join('');
  }

  function thinkingHtml() {
    return `<div class="ai-bubble bot ai-thinking"><span></span><span></span><span></span></div>`;
  }

  function confirmHtml(block) {
    const p = AiService.actionPreview(block);
    const linhas = p.detalhes.map(d =>
      `<div class="ai-confirm-row"><span class="ai-confirm-key">${esc(d.rotulo)}</span> ${esc(d.valor)}</div>`
    ).join('');
    return `<div class="ai-confirm">
        <div class="ai-confirm-title"><i class="ti ti-alert-circle"></i> ${esc(p.titulo)}?</div>
        <div class="ai-confirm-details">${linhas}</div>
        <div class="ai-confirm-btns">
          <button class="btn btn-ghost btn-sm" onclick="AiChatView.confirm(false)">Cancelar</button>
          <button class="btn btn-primary btn-sm" onclick="AiChatView.confirm(true)">Confirmar</button>
        </div>
      </div>`;
  }

  function messagesHtml() {
    const msgs = AiService.getMessages();
    let html = msgs.length ? msgs.map(renderMessage).join('') : emptyHint();
    if (AiService.isThinking()) html += thinkingHtml();
    const pending = AiService.getPending();
    if (pending) html += confirmHtml(pending);
    return html;
  }

  /** Re-renderiza a lista de mensagens em todos os pontos de entrada presentes. */
  function _refresh() {
    const html = messagesHtml();
    MOUNTS.forEach(mount => {
      const box = document.getElementById('ai-msgs-' + mount);
      if (!box) return;
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;
    });
  }

  // ===== Ações de input =====

  function send(mount) {
    const input = document.getElementById('ai-input-' + mount);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    AiService.send(text);
  }

  function inputKey(e, mount) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(mount);
    }
  }

  function confirm(ok) { AiService.confirm(ok); }

  function clear() {
    if (!AiService.getMessages().length) return;
    if (!window.confirm('Limpar toda a conversa?')) return;
    AiService.clear();
  }

  // ===== Voz (Web Speech API) =====

  function _initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      MOUNTS.forEach(m => { const b = document.getElementById('ai-mic-' + m); if (b) b.style.display = 'none'; });
      return;
    }
    _recognition = new SR();
    _recognition.lang = 'pt-BR';
    _recognition.interimResults = false;
    _recognition.maxAlternatives = 1;
    _recognition.onresult = e => {
      const text = e.results[0][0].transcript.trim();
      const input = document.getElementById('ai-input-' + (_activeMicMount || 'view'));
      if (input && text) {
        input.value = (input.value ? input.value + ' ' : '') + text;
        input.focus();
      }
    };
    _recognition.onerror = e => {
      if (e.error === 'not-allowed') Feedback.toast('Permita o acesso ao microfone para usar a voz', 'warn');
      _stopMicUI();
    };
    _recognition.onend = _stopMicUI;
  }

  function startVoice(mount) {
    if (!_recognition) return;
    _activeMicMount = mount;
    const btn = document.getElementById('ai-mic-' + mount);
    if (btn) btn.classList.add('listening');
    try { _recognition.start(); } catch { /* já ouvindo */ }
  }

  function _stopMicUI() {
    MOUNTS.forEach(m => { const b = document.getElementById('ai-mic-' + m); if (b) b.classList.remove('listening'); });
  }

  // ===== Drawer =====

  function openDrawer() {
    document.getElementById('ai-drawer')?.classList.add('open');
    document.getElementById('ai-drawer-backdrop')?.classList.add('open');
    _refresh();
    setTimeout(() => document.getElementById('ai-input-drawer')?.focus(), 50);
  }

  function closeDrawer() {
    document.getElementById('ai-drawer')?.classList.remove('open');
    document.getElementById('ai-drawer-backdrop')?.classList.remove('open');
  }

  function toggleDrawer() {
    const open = document.getElementById('ai-drawer')?.classList.contains('open');
    if (open) closeDrawer(); else openDrawer();
  }

  // ===== Injeção do FAB + drawer (uma vez) =====

  function _inject() {
    const host = document.getElementById('app') || document.body;
    if (document.getElementById('ai-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = 'Assistente IA';
    fab.innerHTML = '<i class="ti ti-sparkles"></i>';
    fab.onclick = toggleDrawer;
    host.appendChild(fab);

    const backdrop = document.createElement('div');
    backdrop.id = 'ai-drawer-backdrop';
    backdrop.onclick = closeDrawer;
    host.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = 'ai-drawer';
    drawer.innerHTML = buildShell('drawer');
    host.appendChild(drawer);
  }

  // ===== API pública =====

  function init() {
    _inject();
    _initVoice();
    AiService.onUpdate(_refresh);
  }

  /** Render da aba dedicada (registrada na Navigation). Monta o shell uma vez. */
  function render() {
    const view = document.getElementById('view-ia');
    if (view && !view.querySelector('.ai-chat')) view.innerHTML = buildShell('view');
    _refresh();
  }

  return {
    init, render,
    send, inputKey, confirm, clear, startVoice,
    openDrawer, closeDrawer, toggleDrawer
  };
})();
