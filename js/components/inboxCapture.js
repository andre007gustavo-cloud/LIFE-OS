/**
 * ===================== INBOX CAPTURE =====================
 * Captura rápida universal (GTD): botão flutuante visível em qualquer view,
 * com entrada por texto ou voz (Web Speech API, quando suportada).
 * Fluxo: abrir → digitar+Enter OU tocar no microfone e falar → salvo, toast, fecha.
 */

const InboxCapture = (() => {

  let _recognition = null;

  function init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      // Browser sem suporte a voz: captura por texto continua funcionando
      document.getElementById('inbox-mic-btn').style.display = 'none';
      return;
    }
    _recognition = new SR();
    _recognition.lang = 'pt-BR';
    _recognition.interimResults = false;
    _recognition.maxAlternatives = 1;
    _recognition.onresult = e => {
      const text = e.results[0][0].transcript.trim();
      if (text) saveItem(text, 'voz');
    };
    _recognition.onerror = e => {
      if (e.error === 'not-allowed') Feedback.toast('Permita o acesso ao microfone para usar a voz', 'warn');
      stopVoiceUI();
    };
    _recognition.onend = stopVoiceUI;
  }

  function toggle() {
    const panel = document.getElementById('inbox-capture');
    if (panel.classList.contains('open')) {
      close();
    } else {
      panel.classList.add('open');
      document.getElementById('inbox-capture-input').focus();
    }
  }

  function close() {
    document.getElementById('inbox-capture').classList.remove('open');
    document.getElementById('inbox-capture-input').value = '';
    cancelVoice();
  }

  function save() {
    const text = document.getElementById('inbox-capture-input').value.trim();
    if (!text) return;
    saveItem(text, 'texto');
  }

  function saveItem(text, source) {
    const item = InboxService.add(text, source);
    Feedback.toast('Capturado', 'success'); // toast nunca toca som
    close();
    Navigation.renderAll();
    if (item) Feedback.slideIn(`.inbox-item[data-inbox-id="${item.id}"]`);
  }

  function keyHandler(e) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  }

  function startVoice() {
    if (!_recognition) return;
    document.getElementById('inbox-mic-btn').classList.add('listening');
    try { _recognition.start(); } catch { /* já estava ouvindo */ }
  }

  function cancelVoice() {
    if (_recognition) {
      try { _recognition.abort(); } catch { /* não estava ouvindo */ }
    }
    stopVoiceUI();
  }

  function stopVoiceUI() {
    document.getElementById('inbox-mic-btn').classList.remove('listening');
  }

  return { init, toggle, close, save, keyHandler, startVoice };
})();
