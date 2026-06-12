/**
 * ===================== NOW VIEW (Modo Agora) =====================
 * Tela cheia, livre de distração: uma tarefa por vez (Fase 7, Parte B).
 * Escolhe automaticamente o que fazer agora; oferece foco (pomodoro), concluir,
 * pular para amanhã e sair. Respeita o Modo Dia Difícil (só as 3 essenciais).
 * É uma view de verdade (entra no showView); a nav some via body.now-mode.
 */

const NowView = (() => {

  const escapeHtml = Utils.escapeHtml;

  let current = null;       // tarefa exibida no momento
  let lastSig = '';         // assinatura do pomodoro para detectar mudança estrutural
  let wired = false;
  let pomoPanelOpen = false; // painel de pomodoro expandido ("+")
  let freeFocus = false;     // foco livre ativo (pomodoro avulso, sem tarefa)

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
    return pomo.running || pomo.seconds < pomo.total;
  }

  // ===== Render =====

  function render() {
    const root = document.getElementById('now-root');
    if (!root) return;
    const td = Utils.today();
    const pomo = PomodoroService.getState();

    // Foco livre (pomodoro avulso) tem precedência: é o que está acontecendo agora
    if (isFreeFocus(pomo)) {
      lastSig = pomoSignature(pomo);
      current = null;
      root.innerHTML = freeFocusHtml(pomo);
      return;
    }

    const pool = candidatePool(td);
    current = pickFromPool(pool);

    if (!current) {
      root.innerHTML = emptyHtml(td);
      return;
    }

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
      <div class="now-empty-actions">
        <button class="now-btn now-btn-skip" onclick="NowView.enterFreeFocus()">
          <i class="ti ti-coffee"></i> Foco livre
        </button>
        <button class="now-btn now-btn-ghost" onclick="NowView.exit()">
          <i class="ti ti-arrow-left"></i> Voltar ao painel
        </button>
      </div>
    </div>`;
  }

  /** Pomodoro avulso (sem tarefa): só o cronômetro e o tempo */
  function freeFocusHtml(pomo) {
    return `<div class="now-task">
      <div class="now-name now-name-free">Foco livre</div>
      <div class="now-meta">sem tarefa — só o tempo</div>
      ${pomoPanelHtml(pomo)}
      <div class="now-actions">
        <button class="now-btn now-btn-skip" onclick="NowView.endFreeFocus()"><i class="ti ti-square"></i> Encerrar foco</button>
        <button class="now-btn now-btn-ghost" onclick="NowView.exit()"><i class="ti ti-arrow-left"></i> Voltar</button>
      </div>
    </div>`;
  }

  function taskHtml(t, pomo, remaining) {
    const session = sessionActive(pomo) && pomo.taskId === t.id;
    return `<div class="now-task">
      <div class="now-name">${escapeHtml(t.name)}</div>
      <div class="now-meta">${metaHtml(t)}</div>
      ${(session || pomoPanelOpen) ? pomoPanelHtml(pomo) : compactHtml()}
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

  /** Atalho minimalista: iniciar 25 min direto ou abrir o painel completo ("+") */
  function compactHtml() {
    return `<div class="now-compact">
      <button class="now-start" onclick="NowView.startFocus()">
        <i class="ti ti-player-play"></i> Iniciar 25 min
      </button>
      <button class="now-plus" onclick="NowView.openPomoPanel()" title="Sessão de foco (ajustar tempos)">
        <i class="ti ti-plus"></i>
      </button>
    </div>`;
  }

  /** Painel de foco: modos em cima, cronômetro grande, play/pausa e ajuste de tempo */
  function pomoPanelHtml(pomo) {
    const pct = pomo.total ? Math.round((pomo.total - pomo.seconds) / pomo.total * 100) : 0;
    const dur = PomodoroService.getDurations();
    return `<div class="now-pomo">
      <div class="now-pomo-modes">
        <button class="now-pomo-mode${pomo.mode === 'work' ? ' active' : ''}" onclick="NowView.pomoMode('work')">Trabalho</button>
        <button class="now-pomo-mode${pomo.mode === 'short' ? ' active' : ''}" onclick="NowView.pomoMode('short')">Pausa</button>
      </div>
      <div class="now-timer" id="now-timer">${Utils.formatPomodoroTime(pomo.seconds)}</div>
      <div class="now-progress-track"><div class="now-progress-fill" id="now-progress" style="width:${pct}%"></div></div>
      <button class="now-pomo-toggle" onclick="NowView.pomoToggle()">
        <i class="ti ${pomo.running ? 'ti-player-pause' : 'ti-player-play'}"></i>
        ${pomo.running ? 'Pausar' : (sessionActive(pomo) ? 'Retomar' : 'Iniciar')}
      </button>
      <div class="now-pomo-times">
        ${timeStepperHtml('work', 'Trabalho', dur.work, 5)}
        ${timeStepperHtml('short', 'Pausa', dur.short, 1)}
      </div>
    </div>`;
  }

  function timeStepperHtml(mode, label, secs, step) {
    const mins = Math.round(secs / 60);
    return `<div class="now-pomo-time">
      <span class="now-pomo-time-label">${label}</span>
      <div class="now-pomo-stepper">
        <button onclick="NowView.pomoAdjust('${mode}',${-step})" title="Menos ${step} min"><i class="ti ti-minus"></i></button>
        <strong>${mins} min</strong>
        <button onclick="NowView.pomoAdjust('${mode}',${step})" title="Mais ${step} min"><i class="ti ti-plus"></i></button>
      </div>
    </div>`;
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
    if (fill && pomo.total) {
      fill.style.width = Math.round((pomo.total - pomo.seconds) / pomo.total * 100) + '%';
    }
  }

  // ===== Ações =====

  /** "Iniciar 25 min": começa o foco já em modo trabalho, vinculado à tarefa */
  function startFocus() {
    if (!current) return;
    pomoPanelOpen = true;
    PomodoroService.setMode('work');
    PomodoroService.toggle(current.id);
    render();
  }

  function openPomoPanel() {
    pomoPanelOpen = true;
    render();
  }

  /** Troca o modo (Trabalho/Pausa) sem iniciar; reseta o relógio do modo */
  function pomoMode(mode) {
    PomodoroService.setMode(mode);
    render();
  }

  /** Play/pausa do modo atual; no foco livre não vincula tarefa */
  function pomoToggle() {
    const pomo = PomodoroService.getState();
    const free = isFreeFocus(pomo) || !current;
    pomoPanelOpen = true;
    if (pomo.running) PomodoroService.toggle();
    else if (free) PomodoroService.toggle();        // avulso (sem tarefa)
    else PomodoroService.toggle(current.id);
    render();
  }

  /** Ajusta a duração de trabalho/pausa em passos de minutos */
  function pomoAdjust(mode, deltaMin) {
    const dur = PomodoroService.getDurations();
    PomodoroService.setDuration(mode, dur[mode] + deltaMin * 60);
    render();
  }

  // ===== Foco livre (pomodoro avulso) =====

  /** Sessão de pomodoro sem tarefa em andamento? (ou modo livre explícito) */
  function isFreeFocus(pomo = PomodoroService.getState()) {
    return freeFocus || (sessionActive(pomo) && !pomo.taskId);
  }

  /** Entra no foco livre: retoma um avulso em curso ou inicia um novo */
  function enterFreeFocus() {
    freeFocus = true;
    pomoPanelOpen = true;
    const pomo = PomodoroService.getState();
    if (!(sessionActive(pomo) && !pomo.taskId)) {
      PomodoroService.reset();        // garante que não fica vinculado a tarefa
      PomodoroService.setMode('work');
      PomodoroService.toggle();       // inicia avulso
    }
    render();
  }

  function endFreeFocus() {
    freeFocus = false;
    PomodoroService.reset();
    advance();
  }

  function done() {
    if (!current || isFreeFocus()) return;
    const task = current;
    releaseTimerIfLinked(task.id);
    TaskService.toggle(task.id);
    const level = TaskService.completionLevel(task);
    Feedback.celebrate(level);
    if (level === 'large') Feedback.toast('Dia limpo. Bom trabalho.', 'success');
    advance();
  }

  function skip() {
    if (!current || isFreeFocus()) return;
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
    pomoPanelOpen = false;
    freeFocus = false;
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
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); pomoToggle(); }
    else if (e.key === 'Enter') { e.preventDefault(); done(); }
    else if (e.key === 'Escape') { e.preventDefault(); exit(); }
  }

  return {
    init, render, done, skip, exit,
    startFocus, openPomoPanel, pomoMode, pomoToggle, pomoAdjust,
    enterFreeFocus, endFreeFocus
  };
})();
