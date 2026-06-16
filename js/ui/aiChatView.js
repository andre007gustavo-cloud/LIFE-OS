/**
 * ===================== AI CHAT VIEW =====================
 * Interface do assistente, usada em DOIS pontos de entrada que compartilham o
 * mesmo render das mensagens:
 *   1. FAB flutuante + drawer lateral direito (visível em qualquer view)
 *   2. Aba dedicada "Assistente" (view 'ia'), em tela cheia
 *
 * O estado da conversa vive no AiService; aqui só desenhamos e captamos input.
 * Entrada por voz via Web Speech API (SpeechRecognition); saída falada via
 * VoiceService (TTS). Reage às mudanças via AiService.onUpdate.
 */

const AiChatView = (() => {

  const esc = Utils.escapeHtml;
  const MOUNTS = ['view', 'drawer'];

  let _recognition = null;
  let _srSupported = false;
  let _listening = false;
  let _activeMicMount = null;
  let _finalTranscript = '';

  let _handsfree = false;       // só nesta sessão (toggle por toque)
  let _greeted = false;         // saudação só uma vez por sessão de abertura
  let _lastSpoken = '';         // evita refalar a mesma resposta a cada re-render

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
            <button class="icon-btn ai-voice" id="ai-voice-${mount}" title="Voz" onclick="AiChatView.toggleVoice()"><i class="ti ti-volume"></i></button>
            <button class="icon-btn ai-hands" id="ai-hands-${mount}" title="Mãos-livres" onclick="AiChatView.toggleHandsfree()"><i class="ti ti-ear"></i></button>
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
                  onclick="AiChatView.toggleMic('${mount}')"><i class="ti ti-microphone"></i></button>
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
    _syncControls();
    _maybeSpeak();
  }

  // ===== Saída falada (fala a última resposta do assistente, uma vez) =====

  function _assistantText(m) {
    if (!m || m.role !== 'assistant') return '';
    if (typeof m.content === 'string') return m.content.trim();
    return (m.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  }

  function _isFinalAssistant(m) {
    if (!m || m.role !== 'assistant') return false;
    if (typeof m.content === 'string') return true;
    return !(m.content || []).some(b => b.type === 'tool_use'); // mid-loop ainda não é final
  }

  function _maybeSpeak() {
    if (!VoiceService.isEnabled()) return;
    if (AiService.isThinking() || AiService.getPending()) return; // espera a volta terminar
    const msgs = AiService.getMessages();
    const last = msgs[msgs.length - 1];
    if (!_isFinalAssistant(last)) return;
    const text = _assistantText(last);
    if (!text || text.startsWith('⚠️') || text === _lastSpoken) return;
    _lastSpoken = text;
    VoiceService.speak(text).then(() => {
      // Mãos-livres: ao terminar de falar, reabre o microfone pra continuar a conversa
      if (_handsfree && _srSupported) startVoice(_currentMount());
    });
  }

  // ===== Ações de input =====

  function send(mount) {
    const input = document.getElementById('ai-input-' + mount);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    VoiceService.stop(); // barge-in: nova mensagem corta a fala anterior
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
    VoiceService.stop();
    _lastSpoken = '';
    AiService.clear();
  }

  // ===== Controles de voz no topo =====

  function toggleVoice() {
    const on = !VoiceService.isEnabled();
    VoiceService.setEnabled(on);
    if (!on) { VoiceService.stop(); _handsfree = false; }
    _syncControls();
    Feedback.toast(on ? 'Voz do assistente ativada' : 'Voz do assistente desativada', 'info');
  }

  function toggleHandsfree() {
    if (!_srSupported) {
      Feedback.toast('Reconhecimento de voz não suportado neste navegador', 'warn');
      return;
    }
    _handsfree = !_handsfree;
    // Mãos-livres só faz sentido com a voz ligada (precisa ouvir pra reabrir o mic)
    if (_handsfree && !VoiceService.isEnabled()) VoiceService.setEnabled(true);
    _syncControls();
    Feedback.toast(_handsfree ? 'Modo mãos-livres ativado' : 'Modo mãos-livres desativado', 'info');
  }

  /** Sincroniza ícone/estado dos botões de voz e mãos-livres nos dois mounts. */
  function _syncControls() {
    const voiceOn = VoiceService.isEnabled();
    MOUNTS.forEach(m => {
      const v = document.getElementById('ai-voice-' + m);
      if (v) {
        v.classList.toggle('active', voiceOn);
        v.title = voiceOn ? 'Voz ligada' : 'Voz desligada';
        const i = v.querySelector('i');
        if (i) i.className = 'ti ' + (voiceOn ? 'ti-volume' : 'ti-volume-off');
      }
      const h = document.getElementById('ai-hands-' + m);
      if (h) {
        h.style.display = _srSupported ? '' : 'none';
        h.classList.toggle('active', _handsfree);
        h.title = _handsfree ? 'Mãos-livres ligado' : 'Mãos-livres';
      }
    });
  }

  // ===== Entrada por voz (Web Speech API) =====

  function _initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _srSupported = !!SR;
    if (!SR) {
      MOUNTS.forEach(m => { const b = document.getElementById('ai-mic-' + m); if (b) b.style.display = 'none'; });
      return;
    }
    _recognition = new SR();
    _recognition.lang = 'pt-BR';
    _recognition.interimResults = true;
    _recognition.continuous = false;
    _recognition.maxAlternatives = 1;

    _recognition.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) _finalTranscript += t; else interim += t;
      }
      const input = document.getElementById('ai-input-' + (_activeMicMount || 'view'));
      if (input) input.value = (_finalTranscript + interim).trim();
    };

    _recognition.onerror = e => {
      if (e.error === 'not-allowed') Feedback.toast('Permita o acesso ao microfone para usar a voz', 'warn');
    };

    _recognition.onend = () => {
      _listening = false;
      _stopMicUI();
      const mount = _activeMicMount;
      const text = _finalTranscript.trim();
      _finalTranscript = '';
      // Fim do reconhecimento (silêncio): envia automaticamente
      if (text && mount) {
        const input = document.getElementById('ai-input-' + mount);
        if (input) input.value = text;
        send(mount);
      }
    };
  }

  function toggleMic(mount) {
    if (!_recognition) return;
    if (_listening) { try { _recognition.stop(); } catch { /* ignora */ } return; }
    startVoice(mount);
  }

  function startVoice(mount) {
    if (!_recognition || _listening) return;
    VoiceService.stop(); // barge-in: corta a fala do assistente
    _activeMicMount = mount;
    _finalTranscript = '';
    const btn = document.getElementById('ai-mic-' + mount);
    if (btn) btn.classList.add('listening');
    try { _recognition.start(); _listening = true; } catch { _stopMicUI(); }
  }

  function _stopMicUI() {
    MOUNTS.forEach(m => { const b = document.getElementById('ai-mic-' + m); if (b) b.classList.remove('listening'); });
  }

  // ===== Saudação ao abrir (estilo JARVIS, gerada localmente pela hora) =====

  function _greet() {
    if (_greeted) return;
    _greeted = true;
    const h = new Date().getHours();
    const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    let texto;
    if (AiService.getMessages().length) {
      // Já há conversa: cumprimento curto, sem resumo
      texto = `${saud}, senhor. Às suas ordens.`;
    } else {
      const aberturas = [
        `${saud}, senhor André. Como posso ajudá-lo hoje?`,
        `${saud}, senhor. Em que posso ser útil?`,
        `${saud}, senhor André. Às suas ordens.`
      ];
      texto = aberturas[Math.floor(Math.random() * aberturas.length)];
      const resumo = _resumoCurto();
      if (resumo) texto = `${saud}, senhor André. ${resumo}`;
    }
    AiService.pushAssistant(texto); // entra na conversa e o _maybeSpeak a fala
  }

  /** Micro-resumo do dia reaproveitando o get_overview (sem chamar a API). */
  function _resumoCurto() {
    try {
      const o = AiTools.run('get_overview', {});
      const partes = [];
      const nt = o.qtdTarefasHoje || 0;
      if (nt) partes.push(`${nt} ${nt === 1 ? 'tarefa' : 'tarefas'} hoje`);
      const na = (o.alertas || []).length;
      if (na) partes.push(`${na} ${na === 1 ? 'alerta financeiro' : 'alertas financeiros'}`);
      if (!partes.length) return '';
      return `O senhor tem ${partes.join(' e ')}. Em que posso ajudar?`;
    } catch { return ''; }
  }

  // ===== Drawer =====

  function _currentMount() {
    return document.getElementById('ai-drawer')?.classList.contains('open') ? 'drawer' : 'view';
  }

  function openDrawer() {
    document.getElementById('ai-drawer')?.classList.add('open');
    document.getElementById('ai-drawer-backdrop')?.classList.add('open');
    _refresh();
    _greet();
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
    // Não falar histórico antigo ao abrir: marca a última resposta como "já dita"
    _lastSpoken = _assistantText(AiService.getMessages().slice(-1)[0]);
    AiService.onUpdate(_refresh);
  }

  /** Render da aba dedicada (registrada na Navigation). Monta o shell uma vez. */
  function render() {
    const view = document.getElementById('view-ia');
    if (view && !view.querySelector('.ai-chat')) view.innerHTML = buildShell('view');
    _refresh();
    _greet();
  }

  return {
    init, render,
    send, inputKey, confirm, clear, toggleMic, startVoice,
    toggleVoice, toggleHandsfree,
    openDrawer, closeDrawer, toggleDrawer
  };
})();
