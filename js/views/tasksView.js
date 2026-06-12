/**
 * ===================== TASKS VIEW (TickTick layout) =====================
 * Sidebar (smart lists + areas) + main list + quick-add bar.
 * The detail panel lives in a separate module (TaskDetail).
 */

const TasksView = (() => {

  const escapeHtml = Utils.escapeHtml;

  const SMART_LISTS = ['hoje', 'amanha', 'semana', 'todas', 'alta', 'semdata', 'concluidas'];
  const CHRONO_LISTS = ['hoje', 'amanha', 'semana'];

  const LIST_TITLES = {
    hoje: 'Hoje',
    amanha: 'Amanhã',
    semana: 'Próximos 7 dias',
    todas: 'Todas as tarefas',
    alta: 'Alta prioridade',
    semdata: 'Sem data',
    concluidas: 'Concluídas'
  };

  // ===== Sidebar =====

  function renderSidebar() {
    const td = Utils.today();
    const tom = Utils.tomorrow();
    const in7 = Utils.addDays(td, 7);
    const pending = TaskService.pending();

    document.getElementById('ttc-hoje').textContent =
      pending.filter(t => Utils.taskCoversDay(t, td)).length || '';
    document.getElementById('ttc-amanha').textContent =
      pending.filter(t => Utils.taskCoversDay(t, tom)).length || '';
    document.getElementById('ttc-semana').textContent =
      pending.filter(t => t.date && t.date >= td && t.date <= in7).length || '';
    document.getElementById('ttc-todas').textContent = pending.length || '';
    document.getElementById('ttc-alta').textContent =
      pending.filter(t => t.priority === 'alta').length || '';
    document.getElementById('ttc-semdata').textContent =
      pending.filter(t => !t.date).length || '';
    document.getElementById('ttc-concluidas').textContent =
      TaskService.completed().length || '';

    renderAreaSidebar();
  }

  function renderAreaSidebar() {
    const ttList = AppState.ui.ttList;
    document.getElementById('tt-area-list').innerHTML = AreaService.getAll().map(area => {
      const isAreaActive = ttList === `area:${area.id}`;
      const projs = area.projects || [];
      const areaCount = TaskService.getAll()
        .filter(t => t.area === area.id && Utils.isTaskOpen(t)).length;

      return `<div class="tt-list-item${isAreaActive ? ' active' : ''}" id="ttl-area-${area.id}" onclick="ttSetList('area:${area.id}')">
        <div class="tt-area-dot" style="background:${area.color}"></div>
        <span class="tt-label">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>
        <span class="tt-count">${areaCount || ''}</span>
      </div>` + (isAreaActive && projs.length
        ? projs.map(p => `<div class="tt-proj-item${ttList === `proj:${p.id}` ? ' active' : ''}" onclick="event.stopPropagation();ttSetList('proj:${p.id}')">
            <i class="ti ti-point" style="font-size:10px;color:${area.color}"></i>${escapeHtml(p.name)}
          </div>`).join('')
        : '');
    }).join('');
  }

  function setList(listKey) {
    AppState.ui.ttList = listKey;
    document.querySelectorAll('.tt-list-item').forEach(x => x.classList.remove('active'));
    const el = document.getElementById('ttl-' + listKey)
      || document.getElementById('ttl-area-' + listKey.replace('area:', ''));
    if (el) el.classList.add('active');
    TaskDetail.close();
    renderSidebar();
    filterAndRender();
  }

  // ===== Main list =====

  function filterAndRender() {
    renderSidebar();
    const tasks = sortTasks(filterTasksByList());
    renderHeader(tasks.length);
    renderList(tasks);
  }

  function filterTasksByList() {
    const td = Utils.today();
    const tom = Utils.tomorrow();
    const in7 = Utils.addDays(td, 7);
    const ttList = AppState.ui.ttList;
    const query = (document.getElementById('tt-search') || {}).value || '';

    let tasks = [...TaskService.getAll()];

    if (query) {
      const q = query.toLowerCase();
      tasks = tasks.filter(t =>
        t.name.toLowerCase().includes(q)
        || (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    const filters = {
      hoje: t => Utils.isTaskOpen(t) && Utils.taskCoversDay(t, td),
      amanha: t => Utils.isTaskOpen(t) && Utils.taskCoversDay(t, tom),
      semana: t => Utils.isTaskOpen(t) && t.date && t.date >= td && t.date <= in7,
      todas: t => Utils.isTaskOpen(t),
      alta: t => Utils.isTaskOpen(t) && t.priority === 'alta',
      semdata: t => Utils.isTaskOpen(t) && !t.date,
      concluidas: t => t.status === 'concluida'
    };

    if (filters[ttList]) return tasks.filter(filters[ttList]);
    if (ttList.startsWith('area:')) {
      const areaId = ttList.replace('area:', '');
      return tasks.filter(t => t.area === areaId && Utils.isTaskOpen(t));
    }
    if (ttList.startsWith('proj:')) {
      const projId = ttList.replace('proj:', '');
      return tasks.filter(t => t.project === projId && Utils.isTaskOpen(t));
    }
    return tasks;
  }

  function sortTasks(tasks) {
    const sort = document.getElementById('tt-sort')?.value || 'priority';
    const ttList = AppState.ui.ttList;

    if (CHRONO_LISTS.includes(ttList)) {
      const withTime = tasks.filter(t => t.start).sort((a, b) => a.start > b.start ? 1 : -1);
      const noTime = tasks.filter(t => !t.start)
        .sort((a, b) => Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority]);
      return [...withTime, ...noTime];
    }

    if (ttList === 'semdata') {
      return tasks.sort((a, b) => Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority]);
    }

    const sorters = {
      priority: (a, b) => Constants.PRI_ORDER[a.priority] - Constants.PRI_ORDER[b.priority],
      date: (a, b) => a.date > b.date ? 1 : -1,
      name: (a, b) => a.name.localeCompare(b.name)
    };
    return tasks.sort(sorters[sort] || sorters.priority);
  }

  function renderHeader(count) {
    const ttList = AppState.ui.ttList;
    let title = LIST_TITLES[ttList] || '';

    if (!title && ttList.startsWith('area:')) {
      const a = AreaService.getById(ttList.replace('area:', ''));
      title = a ? `${a.icon} ${a.name}` : '';
    }
    if (!title && ttList.startsWith('proj:')) {
      const projId = ttList.replace('proj:', '');
      for (const a of AreaService.getAll()) {
        const p = a.projects.find(x => x.id === projId);
        if (p) { title = p.name; break; }
      }
    }

    document.getElementById('tt-main-title').textContent = title;
    document.getElementById('tt-main-count').textContent =
      count ? count + ' tarefa' + (count !== 1 ? 's' : '') : '';
  }

  function renderList(tasks) {
    const list = document.getElementById('tt-task-list');
    if (!tasks.length) {
      list.innerHTML = '<div class="empty"><i class="ti ti-checklist"></i><p>Nenhuma tarefa aqui</p></div>';
      return;
    }

    // Modo dia difícil na lista "Hoje": só as 3 mais prioritárias, resto colapsado
    const hardToday = AppState.ui.ttList === 'hoje' && HabitService.isHardDay(Utils.today());
    if (hardToday && !AppState.ui.hardExpandedTasks && tasks.length > Constants.HARD_MODE.TASK_LIMIT) {
      const top = tasks.slice(0, Constants.HARD_MODE.TASK_LIMIT);
      const hidden = tasks.length - top.length;
      list.innerHTML = top.map(taskItemHtml).join('')
        + `<button class="hard-more-btn" onclick="ttHardExpand(true)">ver tudo (${hidden})</button>`;
      return;
    }

    list.innerHTML = tasks.map(taskItemHtml).join('')
      + (hardToday ? '<button class="hard-more-btn" onclick="ttHardExpand(false)">mostrar menos</button>' : '');
  }

  function hardExpand(expanded) {
    AppState.ui.hardExpandedTasks = expanded;
    filterAndRender();
  }

  function taskItemHtml(t) {
    const area = AreaService.getById(t.area);
    const proj = area ? area.projects.find(p => p.id === t.project) : null;
    const isMulti = t.dateend && t.dateend !== t.date;
    const subtasks = t.subtasks || [];
    const subDone = subtasks.filter(s => s.done).length;
    const isActive = AppState.ui.ttDetailId === t.id;
    const isOverdue = t.date && t.date < Utils.today()
      && Utils.isTaskOpen(t) && !isMulti;

    const metaParts = buildTaskMeta(t, area, proj, isMulti, isOverdue);
    const subBar = subtasks.length
      ? `<div class="subtask-bar">
          <span class="subtask-mini">${subDone}/${subtasks.length}</span>
          <div class="subtask-prog">
            <div class="subtask-prog-fill" style="width:${Math.round(subDone / subtasks.length * 100)}%"></div>
          </div>
        </div>`
      : '';

    const priColor = Constants.PRI_COLORS[t.priority] || 'var(--text3)';

    return `<div class="tt-task${t.status === 'concluida' ? ' done-task' : ''}${isActive ? ' active-detail' : ''}" data-task-id="${t.id}" onclick="ttOpenDetail('${t.id}')">
      <div class="tt-check${t.status === 'concluida' ? ' checked' : ''}" onclick="event.stopPropagation();toggleTask('${t.id}')">
        ${t.status === 'concluida' ? '<i class="ti ti-check" style="font-size:11px;color:#fff"></i>' : ''}
      </div>
      <div class="tt-pri-flag" onclick="event.stopPropagation();ttCyclePri('${t.id}')" title="Alterar prioridade">
        <span style="color:${priColor}">${Constants.PRI_ICONS[t.priority] || '⚪'}</span>
      </div>
      <div class="tt-task-body">
        <div class="tt-task-name">${escapeHtml(t.name)}</div>
        ${metaParts.length ? `<div class="tt-task-sub">${metaParts.join('<span class="dot"></span>')}</div>` : ''}
        ${subBar}
      </div>
      <div class="tt-task-actions">
        <button class="icon-btn" onclick="event.stopPropagation();ttDupTaskById('${t.id}')" title="Duplicar"><i class="ti ti-copy"></i></button>
        <button class="icon-btn" onclick="event.stopPropagation();deleteTask('${t.id}')" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }

  function buildTaskMeta(t, area, proj, isMulti, isOverdue) {
    const parts = [];

    if (t.date) {
      const color = isOverdue ? 'var(--red)'
        : t.date === Utils.today() ? 'var(--amber)' : 'inherit';
      parts.push(`<span style="color:${color}">${
        isMulti ? Utils.fmtDate(t.date) + ' → ' + Utils.fmtDate(t.dateend) : Utils.fmtDate(t.date)
      }</span>`);
    }
    if (t.start && !isMulti) parts.push(`<span>${t.start}</span>`);
    if (t.estimate) parts.push(`<span><i class="ti ti-clock" style="font-size:10px"></i> ${escapeHtml(t.estimate)}</span>`);
    if (t.recurrence) parts.push(`<span><i class="ti ti-refresh" style="font-size:10px"></i></span>`);
    if (area) parts.push(`<span style="color:${area.color}">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>`);
    if (proj) parts.push(`<span>${escapeHtml(proj.name)}</span>`);
    (t.tags || []).forEach(tag => parts.push(`<span class="tag-chip">#${escapeHtml(tag)}</span>`));

    return parts;
  }

  // ===== Quick Add =====

  function blankSchedule() {
    return { date: '', dateend: '', start: '', end: '', recurrence: '' };
  }

  function openQuick() {
    const form = document.getElementById('tt-quick-form');
    form.classList.add('open');
    document.getElementById('tt-quick-input').focus();
    AppState.ui.ttQuickPri = 'nenhuma';
    AppState.ui.ttqPriIdx = 0;
    AppState.ui.ttQuickSched = blankSchedule();

    document.getElementById('ttq-pri-icon').className = 'ti ti-flag';
    document.getElementById('ttq-pri-icon').style.color = '';
    document.getElementById('ttq-pri-label').textContent = 'Prioridade';
    document.getElementById('ttq-pri-btn').classList.remove('active');

    // Populate area select
    document.getElementById('ttq-area').innerHTML =
      '<option value="">Área...</option>' +
      AreaService.getAll().map(a =>
        `<option value="${a.id}">${escapeHtml(a.icon)} ${escapeHtml(a.name)}</option>`).join('');

    // Pre-fill date based on current list
    if (AppState.ui.ttList === 'hoje') AppState.ui.ttQuickSched.date = Utils.today();
    else if (AppState.ui.ttList === 'amanha') AppState.ui.ttQuickSched.date = Utils.tomorrow();
    refreshScheduleLabel();
  }

  function closeQuick() {
    document.getElementById('tt-quick-form').classList.remove('open');
    document.getElementById('tt-quick-input').value = '';
    AppState.ui.ttQuickSched = blankSchedule();
    DatePopover.close();
    quickPreview();
  }

  function openSchedule() {
    DatePopover.open(
      document.getElementById('ttq-sched-btn'),
      AppState.ui.ttQuickSched,
      applySchedule
    );
  }

  function applySchedule(result) {
    AppState.ui.ttQuickSched = { ...result };
    refreshScheduleLabel();
  }

  function refreshScheduleLabel() {
    const s = AppState.ui.ttQuickSched;
    document.getElementById('ttq-sched-label').textContent = Utils.fmtSchedule(s) || 'Data';
    document.getElementById('ttq-sched-btn').classList.toggle('active', !!s.date);
  }

  function quickCyclePriority() {
    AppState.ui.ttqPriIdx = (AppState.ui.ttqPriIdx + 1) % 4;
    AppState.ui.ttQuickPri = Constants.PRI_CYCLE[AppState.ui.ttqPriIdx];
    const pri = AppState.ui.ttQuickPri;
    document.getElementById('ttq-pri-icon').style.color = Constants.PRI_COLORS[pri];
    document.getElementById('ttq-pri-label').textContent = pri === 'nenhuma' ? 'Prioridade' : pri;
    document.getElementById('ttq-pri-btn').classList.toggle('active', pri !== 'nenhuma');
  }

  function quickKeyHandler(e) {
    if (e.key === 'Enter') quickSave();
    if (e.key === 'Escape') closeQuick();
  }

  function quickSave() {
    const raw = document.getElementById('tt-quick-input').value.trim();
    if (!raw) return;

    const parsed = QuickParser.parse(raw, AreaService.getAll());
    if (!parsed.name) return; // só tokens, sem nome de tarefa

    // Texto digitado tem precedência sobre os botões do quick-add
    let area = parsed.areaId || document.getElementById('ttq-area').value;
    let project = '';

    // Infer area/project from current list context
    if (!area && AppState.ui.ttList.startsWith('area:')) {
      area = AppState.ui.ttList.replace('area:', '');
    }
    if (!parsed.areaId && AppState.ui.ttList.startsWith('proj:')) {
      const pid = AppState.ui.ttList.replace('proj:', '');
      const foundArea = AreaService.findAreaByNestedProjectId(pid);
      if (foundArea) { area = foundArea.id; project = pid; }
    }

    const sched = AppState.ui.ttQuickSched || blankSchedule();
    const task = TaskService.create({
      name: parsed.name, area, project,
      priority: parsed.priority || AppState.ui.ttQuickPri,
      date: parsed.date || sched.date || Utils.today(),
      dateend: sched.dateend || '',
      start: parsed.time || sched.start || '',
      end: parsed.timeend || sched.end || '',
      recurrence: parsed.recurrence || sched.recurrence || ''
    });

    closeQuick();
    renderSidebar();
    filterAndRender();
    Feedback.slideIn(`.tt-task[data-task-id="${task.id}"]`);
  }

  // ===== Quick Add: preview ao vivo do parser =====

  function quickPreview() {
    const box = document.getElementById('tt-quick-preview');
    const raw = document.getElementById('tt-quick-input').value.trim();
    if (!raw) {
      box.innerHTML = '';
      box.classList.remove('show');
      return;
    }
    const chips = buildPreviewChips(QuickParser.parse(raw, AreaService.getAll()));
    box.innerHTML = chips.join('');
    box.classList.toggle('show', chips.length > 0);
  }

  function buildPreviewChips(parsed) {
    const chips = [];
    if (parsed.date) {
      const dow = Constants.CALENDAR.WEEK_DAY_NAMES_FULL[Utils.parseISO(parsed.date).getDay()].toLowerCase();
      chips.push(`<span class="ttq-chip">📅 ${dow} ${Utils.fmtDate(parsed.date)}</span>`);
    }
    if (parsed.time) {
      chips.push(`<span class="ttq-chip">⏰ ${parsed.time}${parsed.timeend ? '–' + parsed.timeend : ''}</span>`);
    }
    if (parsed.recurrence) {
      const labels = { daily: 'diária', weekly: 'semanal', monthly: 'mensal' };
      chips.push(`<span class="ttq-chip">🔁 ${labels[parsed.recurrence]}</span>`);
    }
    if (parsed.priority) {
      chips.push(`<span class="ttq-chip">${Constants.PRI_ICONS[parsed.priority]} ${parsed.priority}</span>`);
    }
    const area = parsed.areaId && AreaService.getById(parsed.areaId);
    if (area) {
      chips.push(`<span class="ttq-chip">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>`);
    }
    return chips;
  }

  // ===== Task action helpers =====

  function duplicateById(id) {
    TaskService.duplicate(id);
    filterAndRender();
  }

  function cyclePri(id) {
    TaskService.cyclePriority(id);
    filterAndRender();
    if (AppState.ui.ttDetailId === id) TaskDetail.open(id);
  }

  return {
    renderSidebar, setList, filterAndRender,
    openQuick, closeQuick, openSchedule, quickCyclePriority, quickKeyHandler, quickSave, quickPreview,
    duplicateById, cyclePri, hardExpand
  };
})();
