/**
 * ===================== DASHBOARD VIEW =====================
 * Greeting header, metric cards, today's timeline, inbox and week preview.
 */

const DashboardView = (() => {

  const escapeHtml = Utils.escapeHtml;

  let pomoWired = false;
  let lastPomoSig = '';

  function render() {
    wirePomodoroOnce();
    const td = Utils.today();
    renderHeader(td);
    renderMetrics(td);
    renderTimeline(td);
    renderInbox();
    renderWeek(td);
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

    const n = timedTasks(td).filter(t => t.status !== 'concluida').length;
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
      .filter(t => (!t.start || t.dateend) && t.status !== 'concluida');
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
    const highCount = TaskService.pending().filter(t => t.priority === 'alta').length;

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
        value: `<span style="color:${saldoColor}">${Utils.fmtMoney(month.saldo)}</span>`,
        context: `+${Utils.fmtMoney(month.receitas)} · −${Utils.fmtMoney(month.despesas)}`
      }) +
      metricCardHtml({
        icon: 'ti-flag', label: 'Alta prioridade',
        value: String(highCount),
        context: highCount === 1 ? 'tarefa pendente' : 'tarefas pendentes',
        onclick: "showView('tasks');ttSetList('alta')"
      });
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

    el.innerHTML =
      (withTime.length
        ? withTime.map(t => timelineItemHtml(t, pomo)).join('')
        : '<div class="text-muted" style="padding:4px 10px">Nenhuma com horário hoje</div>')
      + (noTime.length
        ? `<div class="dash-notime-label">Sem horário</div>` + noTime.map(noTimeItemHtml).join('')
        : '');
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

    return `<div class="inbox-item">
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
    Modal.toast('✓ Tarefa criada: ' + task.name);
    Navigation.renderAll();
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
    inboxToTask, inboxEditStart, inboxEditSave, inboxEditCancel, inboxEditKey, inboxDelete
  };
})();
