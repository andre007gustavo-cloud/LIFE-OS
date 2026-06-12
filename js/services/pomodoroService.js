/**
 * ===================== POMODORO SERVICE =====================
 * Self-contained timer with no DOM coupling.
 * Callers subscribe via onTick() to receive updates each second.
 */

const PomodoroService = (() => {

  let timer = null;
  let seconds = Constants.POMO_TIMES.work;
  let mode = 'work';
  let round = 0;
  let running = false;

  /** Durações por modo (segundos) — ajustáveis no Modo Agora; partem do padrão */
  const durations = { ...Constants.POMO_TIMES };

  /** Tarefa vinculada ao timer (mostrada "em andamento" no dashboard) */
  let linkedTaskId = null;

  /** Foco acumulado no dia (em memória; zera na virada do dia) */
  let focusDate = Utils.today();
  let focusSeconds = 0;
  let focusCount = 0;

  function rolloverFocusIfNewDay() {
    const td = Utils.today();
    if (td !== focusDate) {
      focusDate = td;
      focusSeconds = 0;
      focusCount = 0;
    }
  }

  /** Tempo de trabalho somado e pomodoros completos de hoje */
  function getFocusToday() {
    rolloverFocusIfNewDay();
    return { seconds: focusSeconds, count: focusCount };
  }

  /** Listeners notified on each tick */
  const tickListeners = [];

  function onTick(callback) {
    tickListeners.push(callback);
  }

  /** Listeners de fim de ciclo: recebem o modo que terminou ('work'|'short'|'long') */
  const completeListeners = [];

  function onComplete(callback) {
    completeListeners.push(callback);
  }

  function notify() {
    tickListeners.forEach(cb => cb({ seconds, mode, round, running, total: durations[mode] }));
  }

  function getState() {
    return { seconds, mode, round, running, taskId: linkedTaskId, total: durations[mode] };
  }

  function getDurations() {
    return { ...durations };
  }

  /** Ajusta a duração de um modo (1–90 min); reflete no relógio se parado nele */
  function setDuration(targetMode, secs) {
    if (!durations[targetMode]) return;
    durations[targetMode] = Math.max(60, Math.min(secs, 90 * 60));
    if (mode === targetMode && !running) seconds = durations[targetMode];
    notify();
  }

  function setMode(newMode) {
    if (!durations[newMode]) return;
    mode = newMode;
    seconds = durations[newMode];
    stop();
  }

  function toggle(taskId) {
    if (running) {
      stop();
    } else {
      start(taskId);
    }
  }

  function start(taskId) {
    if (running) return;
    if (taskId) linkedTaskId = taskId;
    running = true;
    timer = setInterval(tick, 1000);
    notify();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
    notify();
  }

  function reset() {
    stop();
    linkedTaskId = null;
    seconds = durations[mode];
    notify();
  }

  /** Internal: called each second */
  function tick() {
    seconds--;
    rolloverFocusIfNewDay();
    if (mode === 'work') focusSeconds++;
    if (seconds <= 0) {
      advanceMode();
    }
    notify();
  }

  /** Cycle through work → short → work → short → work → long */
  function advanceMode() {
    const finished = mode;
    stop();
    if (mode === 'work') {
      focusCount++;
      round = (round + 1) % 4;
      mode = round === 0 ? 'long' : 'short';
    } else {
      mode = 'work';
    }
    seconds = durations[mode];
    completeListeners.forEach(cb => cb(finished));
  }

  return { onTick, onComplete, getState, getDurations, setDuration, getFocusToday, setMode, toggle, reset };
})();
