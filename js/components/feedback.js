/**
 * ===================== FEEDBACK =====================
 * Micro-recompensas sensoriais (Fase 8): sons curtos (Web Audio), confete
 * (Canvas), pulso, toast e tick de número. Tudo opcional via preferências
 * por dispositivo (localStorage — exceção registrada no CLAUDE.md; não são
 * dados do app e nunca sincronizam). Nada aqui bloqueia interação.
 */

const Feedback = (() => {

  let audioCtx = null;          // criado só no primeiro evento (autoplay policy)
  let confettiCanvas = null;    // canvas ativo (cancela o anterior se re-disparar)
  let confettiRaf = 0;

  // ===== Preferências =====

  function getPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(Constants.FEEDBACK.PREFS_KEY)) || {};
      return { ...Constants.FEEDBACK.DEFAULT_PREFS, ...saved };
    } catch {
      return { ...Constants.FEEDBACK.DEFAULT_PREFS };
    }
  }

  function setPref(key, value) {
    const prefs = { ...getPrefs(), [key]: !!value };
    localStorage.setItem(Constants.FEEDBACK.PREFS_KEY, JSON.stringify(prefs));
    applyBodyClass();
    return prefs;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Animações valem só se o usuário quer E o sistema não pede menos movimento */
  function animationsOn() {
    return getPrefs().animations && !reducedMotion();
  }

  /** body.fb-no-anim desliga as animações puras de CSS (fade de view, hovers) */
  function applyBodyClass() {
    document.body.classList.toggle('fb-no-anim', !getPrefs().animations);
  }

  // ===== Celebrar =====

  function celebrate(level) {
    if (!Constants.FEEDBACK.TONES[level]) return;
    if (getPrefs().sounds) playTones(Constants.FEEDBACK.TONES[level]);
    if (level === 'large' && getPrefs().confetti && animationsOn()) fireConfetti();
  }

  // ===== Som (Web Audio, sem arquivos) =====

  function playTones(sequence) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      let at = audioCtx.currentTime;
      sequence.forEach(([freq, ms]) => {
        playTone(freq, ms / 1000, at);
        at += ms / 1000;
      });
    } catch { /* sem áudio disponível: feedback sonoro é opcional */ }
  }

  function playTone(freq, dur, when) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Envelope curto evita estalos no início/fim do tom
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(Constants.FEEDBACK.VOLUME, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // ===== Confete (Canvas puro) =====

  function confettiColors() {
    const areaColors = (typeof AreaService !== 'undefined')
      ? AreaService.getAll().map(a => a.color).filter(Boolean) : [];
    return areaColors.length ? areaColors : Constants.COLORS;
  }

  function fireConfetti() {
    stopConfetti();
    const canvas = document.createElement('canvas');
    canvas.className = 'fb-confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    confettiCanvas = canvas;

    const { MAX_PARTICLES, DURATION_MS } = Constants.FEEDBACK.CONFETTI;
    const colors = confettiColors();
    const parts = Array.from({ length: MAX_PARTICLES }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -4 - Math.random() * 7,
      size: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    const ctx = canvas.getContext('2d');
    const start = performance.now();
    (function frame(now) {
      const t = (now - start) / DURATION_MS;
      if (t >= 1) { stopConfetti(); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1 - t;
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      confettiRaf = requestAnimationFrame(frame);
    })(start);
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiRaf);
    confettiCanvas?.remove();
    confettiCanvas = null;
  }

  // ===== Toast =====

  const TOAST_ICONS = { success: 'ti-check', info: 'ti-info-circle', warn: 'ti-alert-triangle', error: 'ti-x' };

  function toast(text, type = 'info') {
    document.querySelector('.app-toast')?.remove(); // um por vez, o novo manda
    const el = document.createElement('div');
    el.className = `app-toast ${TOAST_ICONS[type] ? type : 'info'}`;
    el.innerHTML = `<i class="ti ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i>`;
    el.appendChild(document.createTextNode(text));
    document.body.appendChild(el);
    setTimeout(() => el.remove(), Constants.FEEDBACK.TOAST_MS);
  }

  // ===== Pulso / slide-in em elementos =====

  function resolveEl(elementOrSelector) {
    return typeof elementOrSelector === 'string'
      ? document.querySelector(elementOrSelector) : elementOrSelector;
  }

  /** Reinicia a animação da classe mesmo se ela já estava aplicada */
  function replayClass(elementOrSelector, className) {
    if (!animationsOn()) return;
    const el = resolveEl(elementOrSelector);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function pulse(elementOrSelector) {
    replayClass(elementOrSelector, 'fb-pulse');
  }

  /** Entrada sutil de item recém-criado em listas (tarefas, hábitos, inbox) */
  function slideIn(elementOrSelector) {
    replayClass(elementOrSelector, 'fb-slide-in');
  }

  // ===== Tick de número =====

  function numberTick(elementOrSelector, fromValue, toValue, format) {
    const el = resolveEl(elementOrSelector);
    if (!el) return;
    const fmt = format || (v => String(Math.round(v)));
    if (!animationsOn()) { el.textContent = fmt(toValue); return; }

    const ms = Constants.FEEDBACK.NUMBER_TICK_MS;
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = fmt(fromValue + (toValue - fromValue) * eased);
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  return {
    celebrate, toast, pulse, slideIn, numberTick,
    getPrefs, setPref, animationsOn, applyBodyClass
  };
})();
