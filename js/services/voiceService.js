/**
 * ===================== VOICE SERVICE =====================
 * Saída falada do assistente (TTS) via o proxy seguro /api/tts (ElevenLabs).
 * A preferência liga/desliga fica no DB (db.voice.enabled), sincronizada como
 * o resto do estado. Knows nothing about specific DOM elements.
 *
 * - speak(text): se a voz está ligada, corta a fala anterior e toca o áudio.
 *   Resolve a Promise quando termina de falar (o chat usa isso pro mãos-livres).
 * - stop(): barge-in — corta a fala atual (quando o usuário fala ou manda outra
 *   mensagem).
 */

const VoiceService = (() => {

  const MAX_CHARS = 600; // free tier do ElevenLabs é pequeno: não falar respostas gigantes
  let _audio = null;

  function isEnabled() {
    const db = AppState.getDB();
    return !!(db && db.voice && db.voice.enabled);
  }

  function setEnabled(on) {
    const db = AppState.getDB();
    if (!db.voice) db.voice = {};
    db.voice.enabled = !!on;
    AppState.persist();
    if (!db.voice.enabled) stop();
  }

  // A preferência vive no DB; nada a carregar além de garantir o objeto.
  function init() { /* no-op: leitura sob demanda via AppState */ }

  // Reduz markdown e encurta o texto pra caber na cota e soar natural ao ouvido.
  function _prepare(text) {
    let s = String(text || '')
      .replace(/[*_`#>]/g, '')      // marcas de markdown
      .replace(/\s*\n\s*/g, '. ')   // quebras de linha viram pausa
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (s.length <= MAX_CHARS) return s;
    const corte = s.lastIndexOf('. ', MAX_CHARS); // tenta cortar numa frase
    return (corte > 120 ? s.slice(0, corte + 1) : s.slice(0, MAX_CHARS)).trim();
  }

  function stop() {
    if (!_audio) return;
    try { _audio.pause(); } catch { /* ignora */ }
    try { _audio.src = ''; } catch { /* ignora */ }
    _audio = null;
  }

  async function speak(text) {
    if (!isEnabled()) return;
    const fala = _prepare(text);
    if (!fala) return;
    stop(); // sem áudios sobrepostos

    let url = null;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fala })
      });
      if (!res.ok) return; // falha silenciosa: o texto já está na tela
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      _audio = audio;
      await new Promise(resolve => {
        const done = () => {
          if (url) { URL.revokeObjectURL(url); url = null; }
          if (_audio === audio) _audio = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done); // autoplay bloqueado / sem áudio
      });
    } catch {
      if (url) URL.revokeObjectURL(url);
    }
  }

  return { init, isEnabled, setEnabled, speak, stop };
})();
