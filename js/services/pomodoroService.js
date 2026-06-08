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

  /** Listeners notified on each tick */
  const tickListeners = [];

  function onTick(callback) {
    tickListeners.push(callback);
  }

  function notify() {
    tickListeners.forEach(cb => cb({ seconds, mode, round, running }));
  }

  function getState() {
    return { seconds, mode, round, running };
  }

  function setMode(newMode) {
    if (!Constants.POMO_TIMES[newMode]) return;
    mode = newMode;
    seconds = Constants.POMO_TIMES[newMode];
    stop();
  }

  function toggle() {
    if (running) {
      stop();
    } else {
      start();
    }
  }

  function start() {
    if (running) return;
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
    seconds = Constants.POMO_TIMES[mode];
    notify();
  }

  /** Internal: called each second */
  function tick() {
    seconds--;
    if (seconds <= 0) {
      advanceMode();
    }
    notify();
  }

  /** Cycle through work → short → work → short → work → long */
  function advanceMode() {
    stop();
    if (mode === 'work') {
      round = (round + 1) % 4;
      mode = round === 0 ? 'long' : 'short';
    } else {
      mode = 'work';
    }
    seconds = Constants.POMO_TIMES[mode];
  }

  return { onTick, getState, setMode, toggle, reset };
})();
