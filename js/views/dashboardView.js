/**
 * ===================== DASHBOARD VIEW =====================
 * Greeting header, metric cards, today's timeline, inbox and week preview.
 */

const DashboardView = (() => {

  const escapeHtml = Utils.escapeHtml;

  let pomoWired = false;
  let lastPomoSig = '';
  let lastSaldo = null; // detecta a virada do saldo do mês para positivo

  function render() {
    wirePomodoroOnce();
    const td = Utils.today();
    renderHeader(td);
    renderHardMode(td);
    renderReviewNudge(td);
    renderMetrics(td);
    renderTimeline(td);
    renderInbox();
    renderWeek(td);
  }

  // ===== Gatilho sutil de revisão semanal =====

  /** Domingo, ou 7+ dias desde a última revisão → card discreto (nunca bloqueante) */
  function renderReviewNudge(td) {
    const el = document.getElementById('dash-review-nudge');
    if (!el) return;
    const isSunday = Utils.parseISO(td).getDay() === 0;
    const overdue = ReviewService.daysSinceLastReview() >= Constants.REVIEW.NUDGE_DAYS;
    if (!isSunday && !overdue) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="dash-review-nudge" onclick="showView('review')">
      <div class="drn-text"><i class="ti ti-report-analytics"></i> É hora da revisão semanal</div>
      <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();showView('review')">Revisar</button>
    </div>`;
  }

  // ===== Modo dia difícil =====

  function renderHardMode(td) {
    const active = HabitService.isHardDay(td);
    document.getElementById('hard-mode-btn').classList.toggle('active', active);
    document.getElementById('dash-hardmode').innerHTML = active
      ? '<div class="hard-mode-banner"><i class="ti ti-shield-half"></i> Modo dia difícil ativo — só o essencial conta hoje</div>'
      : '';
  }

  /** O modo NUNCA se ativa sozinho; sempre escolha do usuário (este toggle) */
  function toggleHardMode() {
    HabitService.toggleHardDay(Utils.today());
    AppState.ui.hardExpandedDash = false;
    AppState.ui.hardExpandedTasks = false;
    Navigation.renderAll();
  }

  /** Expande/colapsa a timeline no modo dia difícil ("ver tudo"/"mostrar menos") */
  function hardExpand(expanded) {
    AppState.ui.hardExpandedDash = expanded;
    renderTimeline(Utils.today());
  }

  // ===== Cabeçalho =====

  function greetingForHour(hour) {
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function renderHeader(td) {
    const user = FirebaseApp.currentUser();
    const firstName = ((user?.displayName || '').trim().split(' ')[0]) || '';
    const greet = greetingForHour(new Date().getHours());
    document.getElementById('dash-greeting').textContent =
      firstName ? `${greet}, ${firstName}` : `${greet}!`;

    const dateStr = new Date().toLocaleDateString('pt-BR',
      { weekday: 'long', day: 'numeric', month: 'long' });
    const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    const n = timedTasks(td).filter(t => Utils.isTaskOpen(t)).length;
    const summary = n === 0 ? 'nenhuma tarefa com horário hoje'
      : n === 1 ? '1 tarefa com horário hoje'
      : `${n} tarefas com horário hoje`;

    document.getElementById('dash-subtitle').textContent = `${dateCap} · ${summary}`;
  }

  // ===== Consultas do dia =====

  function timedTasks(td) {
    return TaskService.forDay(td)
      .filter(t => t.start && !t.dateend)
      .sort((a, b) => a.start > b.start ? 1 : -1);
  }

  function untimedPending(td) {
    return TaskService.forDay(td)
      .filter(t => (!t.start || t.dateend) && Utils.isTaskOpen(t));
  }

  // ===== Cards de métrica =====

  function renderMetrics(td) {
    const dayTasks = TaskService.forDay(td);
    const doneCount = dayTasks.filter(t => t.status === 'concluida').length;
    const pct = dayTasks.length ? Math.round(doneCount / dayTasks.length * 100) : 0;

    const focus = PomodoroService.getFocusToday();
    const month = FinanceService.summarize(
      FinanceService.forMonth(FinanceService.currentMonthPrefix()));
    const saldoColor = month.saldo >= 0 ? 'var(--emerald)' : 'var(--red)';

    document.getElementById('dash-metrics').innerHTML =
      metricCardHtml({
        icon: 'ti-calendar-check', label: 'Hoje',
        value: `${doneCount}/${dayTasks.length}`,
        context: `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`
      }) +
      metricCardHtml({
        icon: 'ti-flame', label: 'Foco hoje',
        value: `<span id="dash-focus-time">${fmtFocus(focus.seconds)}</span>`,
        context: `<span id="dash-focus-count">${focus.count} ${focus.count === 1 ? 'pomodoro' : 'pomodoros'}</span>`
      }) +
      metricCardHtml({
        icon: 'ti-wallet', label: 'Saldo do mês',
        value: `<span id="dash-saldo" style="color:${saldoColor}">${Utils.fmtMoney(month.saldo)}</span>`,
        context: `+${Utils.fmtMoney(month.receitas)} · −${Utils.fmtMoney(month.despesas)}`
      }) +
      metricCardHtml(habitsMetric(td));

    // Fase 8: saldo virou positivo → tick verde animado no card
    if (lastSaldo !== null && lastSaldo < 0 && month.saldo >= 0) {
      Feedback.numberTick('#dash-saldo', lastSaldo, month.saldo, Utils.fmtMoney);
    }
    lastSaldo = month.saldo;
  }

  /** Card "Hábitos hoje": cumpridos/devidos + melhor sequência ativa */
  function habitsMetric(td) {
    const habits = HabitService.getAll();
    const due = habits.filter(h => HabitService.isDueOn(h, td));
    const done = due.filter(h => HabitService.getLog(h.id, td)).length;
    const best = habits
      .map(h => ({ name: h.name, streak: HabitService.stats(h.id).streak }))
      .filter(s => s.streak > 0)
      .sort((a, b) => b.streak - a.streak)[0];

    const context = !habits.length ? 'crie seu primeiro hábito'
      : HabitService.isHardDay(td) ? 'só a versão mínima conta hoje'
      : best ? `🔥 ${best.streak} ${best.streak === 1 ? 'dia' : 'dias'} — ${escapeHtml(best.name)}`
      : 'nenhuma sequência ativa';

    return {
      icon: 'ti-repeat', label: 'Hábitos hoje',
      value: due.length ? `${done}/${due.length}` : '—',
      context,
      onclick: "showView('habits')"
    };
  }

  /** Card de métrica genérico (reutilizável para futuros cards, ex.: hábitos) */
  function metricCardHtml({ icon, label, value, context, onclick }) {
    return `<div class="metric-card${onclick ? ' clickable' : ''}"${onclick ? ` onclick="${onclick}"` : ''}>
      <div class="metric-label"><i class="ti ${icon}"></i> ${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-context">${context || ''}</div>
    </div>`;
  }

  function fmtFocus(seconds) {
    const m = Math.floor(seconds / 60);
    if (m < 60) return m + 'min';
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
  }

  // ===== Linha do tempo de hoje =====

  function renderTimeline(td) {
    const withTime = timedTasks(td);
    const noTime = untimedPending(td);
    const el = document.getElementById('dash-timeline');
    const pomo = PomodoroService.getState();
    lastPomoSig = pomoSignature(pomo);

    if (!withTime.length && !noTime.length) {
      el.innerHTML = `<div class="dash-empty">
        <div class="dash-empty-emoji">🎉</div>
        <div>Nenhuma tarefa para hoje</div>
        <button class="btn btn-primary btn-sm" onclick="openTaskModal()">
          <i class="ti ti-plus"></i> Adicionar tarefa
        </button>
      </div>`;
      return;
    }

    const hard = HabitService.isHardDay(td);
    el.innerHTML = hard && !AppState.ui.hardExpandedDash
      ? hardTimelineHtml(withTime, noTime, pomo)
      : fullTimelineHtml(withTime, noTime, pomo, hard);
  }

  function fullTimelineHtml(withTime, noTime, pomo, hard) {
    return (withTime.length
      ? withTime.map(t => timelineItemHtml(t, pomo)).join('')
      : '<div class="text-muted" style="padding:4px 10px">Nenhuma com horário hoje</div>')
      + (noTime.length
        ? `<div class="dash-notime-label">Sem horário</div>` + noTime.map(noTimeItemHtml).join('')
        : '')
      + (hard ? '<button class="hard-more-btn" onclick="dashHardExpand(false)">mostrar menos</button>' : '');
  }

  /** Modo dia difícil: só as 3 tarefas pendentes mais prioritárias de hoje */
  function hardTimelineHtml(withTime, noTime, pomo) {
    const pending = [...withTime.filter(t => Utils.isTaskOpen(t)), ...noTime]
      .sort((a, b) => Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority]);
    const top = pending.slice(0, Constants.HARD_MODE.TASK_LIMIT);
    const hidden = pending.length - top.length;
    return top.map(t => t.start && !t.dateend ? timelineItemHtml(t, pomo) : noTimeItemHtml(t)).join('')
      + (hidden > 0 ? `<button class="hard-more-btn" onclick="dashHardExpand(true)">ver tudo (${hidden})</button>` : '');
  }

  function timelineItemHtml(t, pomo) {
    const area = AreaService.getById(t.area);
    const color = area ? area.color : 'var(--accent)';
    const done = t.status === 'concluida';
    const active = !done && pomo.taskId === t.id;

    const meta = [];
    if (area) meta.push(`<span style="color:${color}">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>`);
    if (t.end) meta.push(`até ${t.end}`);
    if (t.duration) meta.push(escapeHtml(t.duration));
    const sub = active ? escapeHtml(pomoSubText(pomo)) : meta.join(' · ');

    const side = done
      ? `<i class="ti ti-circle-check-filled tl-done-icon" title="Reabrir"
           onclick="event.stopPropagation();toggleTask('${t.id}')"></i>`
      : active
        ? `<button class="icon-btn tl-pomo-btn" title="${pomo.running ? 'Pausar' : 'Continuar'}"
             onclick="event.stopPropagation();pomoToggle()">
             <i class="ti ${pomo.running ? 'ti-player-pause' : 'ti-player-play'}"></i>
           </button>`
        : `<div class="tt-check" onclick="event.stopPropagation();toggleTask('${t.id}')"></div>`;

    return `<div class="tl-item${done ? ' done' : ''}${active ? ' active' : ''}" onclick="openTaskModal('${t.id}')">
      <div class="tl-time">${t.start}</div>
      <div class="tl-bar" style="background:${color}"></div>
      <div class="tl-body">
        <div class="tl-name">${escapeHtml(t.name)}</div>
        <div class="tl-sub"${active ? ' id="dash-pomo-sub"' : ''}>${sub}</div>
      </div>
      <div class="tl-side">${side}</div>
    </div>`;
  }

  function noTimeItemHtml(t) {
    const area = AreaService.getById(t.area);
    const priColor = Constants.PRI_COLORS[t.priority] || 'var(--text3)';
    return `<div class="tl-notime-item" onclick="openTaskModal('${t.id}')">
      <div class="tt-check" onclick="event.stopPropagation();toggleTask('${t.id}')"></div>
      <span class="tl-pri-dot" style="background:${priColor}"></span>
      <span class="tl-notime-name">${escapeHtml(t.name)}</span>
      ${area ? `<span class="tl-notime-area" style="color:${area.color}">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>` : ''}
    </div>`;
  }

  // ===== Pomodoro live updates =====

  function pomoSubText(pomo) {
    const time = Utils.formatPomodoroTime(pomo.seconds);
    if (pomo.mode !== 'work') return `pausa · ${time}`;
    return `pomodoro ${pomo.round + 1} de 4 · ${time} restantes`;
  }

  function pomoSignature(pomo) {
    return `${pomo.running}|${pomo.mode}|${pomo.round}|${pomo.taskId}`;
  }

  function wirePomodoroOnce() {
    if (pomoWired) return;
    pomoWired = true;
    PomodoroService.onTick(onPomoTick);
  }

  function onPomoTick(pomo) {
    if (!document.getElementById('view-dashboard')?.classList.contains('active')) return;

    // Mudou estrutura (play/pause, modo, tarefa)? Re-renderiza as seções afetadas
    if (pomoSignature(pomo) !== lastPomoSig) {
      const td = Utils.today();
      renderMetrics(td);
      renderTimeline(td);
      return;
    }

    // Tick normal: atualiza só os textos (contagem regressiva e foco do dia)
    const sub = document.getElementById('dash-pomo-sub');
    if (sub) sub.textContent = pomoSubText(pomo);
    const focusTime = document.getElementById('dash-focus-time');
    if (focusTime) focusTime.textContent = fmtFocus(PomodoroService.getFocusToday().seconds);
  }

  // ===== Esta semana =====

  function renderWeek(td) {
    const rows = [];
    for (let i = 1; i <= 7; i++) {
      const iso = Utils.addDays(td, i);
      const d = Utils.parseISO(iso);
      const tasks = TaskService.getAll().filter(t =>
        Utils.taskCoversDay(t, iso) || Utils.taskRecursOnDay(t, iso));
      const colors = [...new Set(
        tasks.map(t => AreaService.getById(t.area)?.color).filter(Boolean)
      )].slice(0, 4);

      rows.push(`<div class="week-row" onclick="dashOpenDay('${iso}')">
        <span class="week-row-day">${Constants.CALENDAR.WEEK_DAY_NAMES_FULL[d.getDay()]} ${d.getDate()}</span>
        <span class="week-row-count">${tasks.length ? tasks.length + (tasks.length === 1 ? ' tarefa' : ' tarefas') : '—'}</span>
        <span class="week-dots">${colors.map(c => `<span class="week-area-dot" style="background:${c}"></span>`).join('')}</span>
      </div>`);
    }
    document.getElementById('dash-week').innerHTML = rows.join('');
  }

  /** Abre o calendário (visão dia) na data clicada do card "Esta semana" */
  function openDay(iso) {
    AppState.ui.calDate = Utils.parseISO(iso);
    AppState.ui.miniCalDate = Utils.parseISO(iso);
    Navigation.showView('calendar');
    CalendarView.setView('day');
  }

  // ===== Caixa de entrada (GTD) =====

  function renderInbox() {
    const items = InboxService.getAll();
    const badge = document.getElementById('dash-inbox-badge');
    badge.textContent = items.length || '';
    badge.style.display = items.length ? 'inline-flex' : 'none';

    document.getElementById('dash-inbox').innerHTML = items.length
      ? items.map(inboxItemHtml).join('')
      : '<div class="text-muted">Nada por processar 🧘</div>';

    const editInput = document.getElementById('inbox-edit-input');
    if (editInput) { editInput.focus(); editInput.select(); }
  }

  function inboxItemHtml(item) {
    if (AppState.ui.inboxEditId === item.id) return inboxEditHtml(item);

    const when = Utils.fmtDate(Utils.toISO(new Date(item.createdAt)));
    const srcIcon = item.source === 'voz' ? 'ti-microphone' : 'ti-keyboard';

    return `<div class="inbox-item" data-inbox-id="${item.id}">
      <div class="inbox-item-body">
        <div class="inbox-item-text">${escapeHtml(item.text)}</div>
        <div class="inbox-item-meta"><i class="ti ${srcIcon}"></i> ${when}</div>
      </div>
      <div class="inbox-item-actions">
        <button class="icon-btn" title="Virar tarefa" style="color:var(--green)" onclick="inboxToTask('${item.id}')"><i class="ti ti-checkbox"></i></button>
        <button class="icon-btn" title="Editar" onclick="inboxEditStart('${item.id}')"><i class="ti ti-pencil"></i></button>
        <button class="icon-btn" title="Excluir" style="color:var(--red)" onclick="inboxDelete('${item.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }

  function inboxEditHtml(item) {
    return `<div class="inbox-item editing">
      <input class="inbox-edit-input" id="inbox-edit-input"
             value="${Utils.escapeAttr(item.text)}"
             onkeydown="inboxEditKey(event,'${item.id}')">
      <div class="inbox-item-actions">
        <button class="icon-btn" title="Salvar" style="color:var(--green)" onclick="inboxEditSave('${item.id}')"><i class="ti ti-check"></i></button>
        <button class="icon-btn" title="Cancelar" onclick="inboxEditCancel()"><i class="ti ti-x"></i></button>
      </div>
    </div>`;
  }

  // ===== Ações da caixa de entrada =====

  function inboxToTask(id) {
    const item = InboxService.getById(id);
    if (!item) return;
    // Aproveita datas/prioridade/área/recorrência ditas na captura
    const parsed = QuickParser.parse(item.text, AreaService.getAll());
    const task = TaskService.create({
      name: parsed.name || item.text,
      area: parsed.areaId,
      priority: parsed.priority || 'nenhuma',
      date: parsed.date || '',
      start: parsed.time || '',
      end: parsed.timeend || '',
      recurrence: parsed.recurrence || ''
    });
    InboxService.remove(id);
    Feedback.toast('Tarefa criada: ' + task.name, 'success');
    Navigation.renderAll();
    Feedback.slideIn(`.tt-task[data-task-id="${task.id}"]`);
  }

  function inboxEditStart(id) {
    AppState.ui.inboxEditId = id;
    renderInbox();
  }

  function inboxEditSave(id) {
    const text = document.getElementById('inbox-edit-input').value.trim();
    if (text) InboxService.update(id, text);
    AppState.ui.inboxEditId = null;
    renderInbox();
  }

  function inboxEditCancel() {
    AppState.ui.inboxEditId = null;
    renderInbox();
  }

  function inboxEditKey(e, id) {
    if (e.key === 'Enter') inboxEditSave(id);
    if (e.key === 'Escape') inboxEditCancel();
  }

  function inboxDelete(id) {
    InboxService.remove(id);
    renderInbox();
  }

  return {
    render, openDay,
    toggleHardMode, hardExpand,
    inboxToTask, inboxEditStart, inboxEditSave, inboxEditCancel, inboxEditKey, inboxDelete
  };
})();
