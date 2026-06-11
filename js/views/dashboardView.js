/**
 * ===================== DASHBOARD VIEW =====================
 * Today's agenda, stats and high-priority tasks.
 */

const DashboardView = (() => {

  const escapeHtml = Utils.escapeHtml;

  function render() {
    const td = Utils.today();
    document.getElementById('dash-date').textContent =
      new Date().toLocaleDateString('pt-BR',
        { weekday: 'long', day: 'numeric', month: 'long' });

    renderStats(td);
    renderTodayAgenda(td);
    renderNoTime(td);
    renderHighPriority();
  }

  // ===== Sections =====

  function renderStats(td) {
    const all = TaskService.getAll();
    const todayTasks = all.filter(t => Utils.taskCoversDay(t, td));
    const pending = TaskService.pending();
    const done = TaskService.completed();

    document.getElementById('dash-stats').innerHTML = `
      <div class="stat amber">
        <div class="stat-val">${todayTasks.filter(t => t.status !== 'concluida').length}</div>
        <div class="stat-label">Hoje</div>
      </div>
      <div class="stat purple">
        <div class="stat-val">${pending.length}</div>
        <div class="stat-label">Pendentes</div>
      </div>
      <div class="stat green">
        <div class="stat-val">${done.length}</div>
        <div class="stat-label">Concluídas</div>
      </div>`;
  }

  function renderTodayAgenda(td) {
    const todayTasks = TaskService.forDay(td);
    const withTime = todayTasks
      .filter(t => t.start && !t.dateend)
      .sort((a, b) => a.start > b.start ? 1 : -1);

    document.getElementById('dash-today').innerHTML = withTime.length
      ? withTime.map(agendaItemHtml).join('')
      : '<div class="text-muted">Nenhuma com horário hoje</div>';
  }

  function renderNoTime(td) {
    const todayTasks = TaskService.forDay(td);
    const noTime = todayTasks.filter(t =>
      (!t.start || t.dateend) && t.status !== 'concluida');

    document.getElementById('dash-notime').innerHTML = noTime.length
      ? noTime.map(taskRowHtml).join('')
      : '<div class="text-muted">Tudo planejado! ✅</div>';
  }

  function renderHighPriority() {
    const high = TaskService.pending()
      .filter(t => t.priority === 'alta').slice(0, 5);

    document.getElementById('dash-high').innerHTML = high.length
      ? high.map(taskRowHtml).join('')
      : '<div class="text-muted">Nenhuma de alta prioridade 🎉</div>';
  }

  // ===== HTML builders =====

  function agendaItemHtml(t) {
    const area = AreaService.getById(t.area);
    const bg = area ? area.color + '22' : 'var(--acc-dim)';
    const border = area ? area.color : 'var(--accent)';
    const priColor = Constants.PRI_COLORS[t.priority] || 'var(--text3)';

    return `<div style="display:flex;align-items:stretch;gap:0;margin-bottom:6px;cursor:pointer;border-radius:var(--radius-sm);overflow:hidden;border:1px solid ${border}33" onclick="openTaskModal('${t.id}')">
      <div style="width:3px;background:${border};flex-shrink:0"></div>
      <div style="background:${bg};flex:1;padding:8px 10px;">
        <div style="font-size:11px;color:${priColor};margin-bottom:2px">
          ${t.start}${t.end ? ' → ' + t.end : ''}${t.duration ? ' (' + t.duration + ')' : ''}
        </div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">${escapeHtml(t.name)}</div>
        ${area ? `<div style="font-size:11px;color:${area.color};margin-top:2px">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;padding:0 10px;background:${bg}">
        <div class="tt-check${t.status === 'concluida' ? ' checked' : ''}"
             onclick="event.stopPropagation();toggleTask('${t.id}')" style="flex-shrink:0">
          ${t.status === 'concluida' ? '<i class="ti ti-check" style="font-size:11px;color:#fff"></i>' : ''}
        </div>
      </div>
    </div>`;
  }

  function taskRowHtml(t) {
    const area = AreaService.getById(t.area);
    const priColor = t.priority === 'alta' ? 'var(--red)'
      : t.priority === 'media' ? 'var(--amber)' : 'var(--green)';

    return `<div class="tt-task" onclick="openTaskModal('${t.id}')" style="margin-bottom:5px">
      <div class="tt-check${t.status === 'concluida' ? ' checked' : ''}"
           onclick="event.stopPropagation();toggleTask('${t.id}')">
        ${t.status === 'concluida' ? '<i class="ti ti-check" style="font-size:11px;color:#fff"></i>' : ''}
      </div>
      <span style="color:${priColor}">${Constants.PRI_ICONS[t.priority] || '⚪'}</span>
      <div class="tt-task-body">
        <div class="tt-task-name">${escapeHtml(t.name)}</div>
        <div class="tt-task-sub">
          ${area ? `<span style="color:${area.color}">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>` : ''}
          ${t.date ? `<span>${Utils.fmtDate(t.date)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  return { render };
})();
