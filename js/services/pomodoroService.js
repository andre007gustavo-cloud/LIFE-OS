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

  function notify() {
    tickListeners.forEach(cb => cb({ seconds, mode, round, running }));
  }

  function getState() {
    return { seconds, mode, round, running, taskId: linkedTaskId };
  }

  function setMode(newMode) {
    if (!Constants.POMO_TIMES[newMode]) return;
    mode = newMode;
    seconds = Constants.POMO_TIMES[newMode];
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
    seconds = Constants.POMO_TIMES[mode];
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
    stop();
    if (mode === 'work') {
      focusCount++;
      round = (round + 1) % 4;
      mode = round === 0 ? 'long' : 'short';
    } else {
      mode = 'work';
    }
    seconds = Constants.POMO_TIMES[mode];
  }

  return { onTick, getState, getFocusToday, setMode, toggle, reset };
})();
