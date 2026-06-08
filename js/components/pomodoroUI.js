/**
 * ===================== POMODORO UI =====================
 * Renders the pomodoro widget inside the task detail panel.
 * Subscribes to PomodoroService for updates.
 */

const PomodoroUI = (() => {

  let initialized = false;

  function initOnce() {
    if (initialized) return;
    PomodoroService.onTick(refresh);
    initialized = true;
  }

  function refresh() {
    initOnce();
    const state = PomodoroService.getState();
    const display = document.getElementById('pomo-display');
    if (!display) return;

    display.textContent = Utils.formatPomodoroTime(state.seconds);
    display.className = 'pomo-display ' + (state.mode === 'work' ? 'work' : 'break');

    renderModeButtons(state.mode);
    renderToggleButton(state.running);
    renderDots(state.round);
  }

  function setMode(mode) {
    PomodoroService.setMode(mode);
    refresh();
  }

  function toggle() {
    PomodoroService.toggle();
    refresh();
  }

  function reset() {
    PomodoroService.reset();
    refresh();
  }

  // ===== Internal renderers =====

  function renderModeButtons(currentMode) {
    const row = document.getElementById('pomo-mode-row');
    if (!row) return;
    row.innerHTML = ['work', 'short', 'long']
      .map(mode => `<button class="pomo-mode-btn${currentMode === mode ? ' active' : ''}"
                            onclick="pomoSetMode('${mode}')">${labelOf(mode)}</button>`)
      .join('');
  }

  function renderToggleButton(running) {
    const btn = document.getElementById('pomo-toggle');
    if (!btn) return;
    btn.innerHTML = running
      ? '<i class="ti ti-player-pause"></i> Pausar'
      : '<i class="ti ti-player-play"></i> Iniciar';
  }

  function renderDots(round) {
    const dots = document.getElementById('pomo-dots');
    if (!dots) return;
    dots.innerHTML = [0, 1, 2, 3].map(i =>
      `<div class="pomo-dot${i < round ? ' done' : ''}"></div>`).join('');
  }

  function labelOf(mode) {
    return mode === 'work' ? 'Trabalho'
      : mode === 'short' ? 'Pausa' : 'Longa';
  }

  return { refresh, setMode, toggle, reset };
})();
