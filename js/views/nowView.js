/**
 * ===================== NOW VIEW (Modo Agora) =====================
 * Tela cheia, livre de distração: uma tarefa por vez (Fase 7, Parte B).
 * Escolhe automaticamente o que fazer agora; oferece foco (pomodoro), concluir,
 * pular para amanhã e sair. Respeita o Modo Dia Difícil (só as 3 essenciais).
 * É uma view de verdade (entra no showView); a nav some via body.now-mode.
 */

const NowView = (() => {

  const escapeHtml = Utils.escapeHtml;

  let current = null;     // tarefa exibida no momento
  let lastSig = '';       // assinatura do pomodoro para detectar mudança estrutural
  let wired = false;

  function init() {
    if (wired) return;
    wired = true;
    PomodoroService.onTick(onPomoTick);
    document.addEventListener('keydown', onKey);
  }

  function isActive() {
    return document.getElementById('view-now')?.classList.contains('active');
  }

  // ===== Seleção da tarefa "de agora" =====

  /** As 3 tarefas essenciais do dia (maior prioridade), incluindo já concluídas */
  function essentials(td) {
    return TaskService.forDay(td)
      .slice()
      .sort((a, b) =>
        Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority]
        || (a.start || '~').localeCompare(b.start || '~')
        || a.name.localeCompare(b.name))
      .slice(0, Constants.HARD_MODE.TASK_LIMIT);
  }

  /** O pool de candidatas (limitado às 3 essenciais no Modo Dia Difícil) */
  function candidatePool(td) {
    const pending = TaskService.forDay(td).filter(Utils.isTaskOpen);
    if (!HabitService.isHardDay(td)) return pending;
    const ids = new Set(essentials(td).map(t => t.id));
    return pending.filter(t => ids.has(t.id));
  }

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  /** Escolhe a tarefa do pool: pomodoro ativo → horário mais próximo → prioridade */
  function pickFromPool(pool) {
    const pomo = PomodoroService.getState();
    if (sessionActive(pomo) && pomo.taskId) {
      const linked = pool.find(t => t.id === pomo.taskId);
      if (linked) return linked;
    }
    const nm = nowMinutes();
    const timed = pool
      .filter(t => t.start && (!t.dateend || t.dateend === t.date))
      .sort((a, b) => Math.abs(Utils.timeToMins(a.start) - nm) - Math.abs(Utils.timeToMins(b.start) - nm));
    if (timed.length) return timed[0];
    const untimed = pool
      .filter(t => !t.start || (t.dateend && t.dateend !== t.date))
      .sort((a, b) => Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority]);
    return untimed[0] || pool[0] || null;
  }

  /** Há uma sessão de pomodoro em andamento (rodando ou pausada no meio)? */
  function sessionActive(pomo) {
    return pomo.running || pomo.seconds < Constants.POMO_TIMES[pomo.mode];
  }

  // ===== Render =====

  function render() {
    const root = document.getElementById('now-root');
    if (!root) return;
    const td = Utils.today();
    const pool = candidatePool(td);
    current = pickFromPool(pool);

    if (!current) {
      root.innerHTML = emptyHtml(td);
      return;
    }

    const pomo = PomodoroService.getState();
    lastSig = pomoSignature(pomo);
    const remaining = TaskService.forDay(td).filter(Utils.isTaskOpen).length;
    root.innerHTML = taskHtml(current, pomo, remaining);
  }

  function emptyHtml(td) {
    const hardDone = HabitService.isHardDay(td) && TaskService.forDay(td).length > 0;
    const msg = hardDone
      ? 'As 3 essenciais de hoje estão prontas. Pode descansar.'
      : 'Nada na fila pra agora.';
    return `<div class="now-empty">
      <div class="now-empty-emoji">${hardDone ? '🌙' : '🎉'}</div>
      <div class="now-empty-msg">${msg}</div>
      <button class="now-btn now-btn-ghost" onclick="NowView.exit()">
        <i class="ti ti-arrow-left"></i> Voltar ao painel
      </button>
    </div>`;
  }

  function taskHtml(t, pomo, remaining) {
    const session = sessionActive(pomo) && pomo.taskId === t.id;
    return `<div class="now-task">
      <div class="now-name">${escapeHtml(t.name)}</div>
      <div class="now-meta">${metaHtml(t)}</div>
      ${session ? timerHtml(pomo) : startBtnHtml(t)}
      <div class="now-actions">
        <button class="now-btn now-btn-done" onclick="NowView.done()"><i class="ti ti-check"></i> Feito</button>
        <button class="now-btn now-btn-skip" onclick="NowView.skip()"><i class="ti ti-arrow-right"></i> Pular por hoje</button>
        <button class="now-btn now-btn-ghost" onclick="NowView.exit()"><i class="ti ti-arrow-left"></i> Voltar</button>
      </div>
    </div>
    ${remaining > 1 ? `<div class="now-footer">${remaining} ${remaining === 1 ? 'tarefa restante' : 'tarefas restantes'} hoje</div>` : ''}`;
  }

  function metaHtml(t) {
    const area = AreaService.getById(t.area);
    const parts = [];
    if (area) parts.push(`<span class="now-area"><span class="now-dot" style="background:${area.color}"></span>${escapeHtml(area.name)}</span>`);
    if (t.start) parts.push(`<span>${escapeHtml(t.start)}${t.end ? '–' + escapeHtml(t.end) : ''}</span>`);
    if (t.priority && t.priority !== 'nenhuma') {
      parts.push(`<span style="color:${Constants.PRI_COLORS[t.priority]}">${Constants.PRI_ICONS[t.priority]} ${t.priority}</span>`);
    }
    return parts.join('<span class="now-sep">·</span>');
  }

  function timerHtml(pomo) {
    const total = Constants.POMO_TIMES[pomo.mode];
    const pct = Math.round((total - pomo.seconds) / total * 100);
    return `<div class="now-timer" id="now-timer">${Utils.formatPomodoroTime(pomo.seconds)}</div>
      <div class="now-progress-track"><div class="now-progress-fill" id="now-progress" style="width:${pct}%"></div></div>
      <div class="now-timer-hint">${pomo.running ? 'Espaço para pausar' : 'Espaço para retomar'}</div>`;
  }

  function startBtnHtml(t) {
    return `<button class="now-start" onclick="NowView.toggleFocus()">
      <i class="ti ti-player-play"></i> Iniciar 25 min
    </button>`;
  }

  // ===== Live update do timer =====

  function pomoSignature(pomo) {
    return `${pomo.running}|${pomo.mode}|${pomo.round}|${pomo.taskId}|${sessionActive(pomo)}`;
  }

  function onPomoTick(pomo) {
    if (!isActive()) return;
    if (pomoSignature(pomo) !== lastSig) { render(); return; }
    const timerEl = document.getElementById('now-timer');
    if (timerEl) timerEl.textContent = Utils.formatPomodoroTime(pomo.seconds);
    const fill = document.getElementById('now-progress');
    if (fill) {
      const total = Constants.POMO_TIMES[pomo.mode];
      fill.style.width = Math.round((total - pomo.seconds) / total * 100) + '%';
    }
  }

  // ===== Ações =====

  function toggleFocus() {
    if (!current) return;
    const pomo = PomodoroService.getState();
    if (sessionActive(pomo) && pomo.taskId === current.id) {
      PomodoroService.toggle();           // pausa/retoma a sessão atual
    } else {
      PomodoroService.setMode('work');    // garante 25 min de trabalho
      PomodoroService.toggle(current.id);
    }
    render();
  }

  function done() {
    if (!current) return;
    const id = current.id;
    releaseTimerIfLinked(id);
    TaskService.toggle(id);               // conclui (celebração virá na Fase 8)
    advance();
  }

  function skip() {
    if (!current) return;
    const id = current.id;
    releaseTimerIfLinked(id);
    TaskService.updateField(id, 'date', Utils.tomorrow());
    advance();
  }

  /** Libera o pomodoro se estava vinculado à tarefa que saiu de cena */
  function releaseTimerIfLinked(id) {
    if (PomodoroService.getState().taskId === id) PomodoroService.reset();
  }

  /** Avança para a próxima tarefa e mantém o resto do app em sincronia */
  function advance() {
    render();
    if (window.Navigation) Navigation.renderAll();
    NextUpBar.render();
  }

  function exit() {
    Navigation.showView('dashboard');
  }

  // ===== Teclado (F entra; Espaço/Enter/Esc dentro do modo) =====

  function isEditable(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  function onKey(e) {
    if (isEditable(document.activeElement)) return;
    if (!isActive()) {
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        Navigation.showView('now');
      }
      return;
    }
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggleFocus(); }
    else if (e.key === 'Enter') { e.preventDefault(); done(); }
    else if (e.key === 'Escape') { e.preventDefault(); exit(); }
  }

  return { init, render, toggleFocus, done, skip, exit };
})();
