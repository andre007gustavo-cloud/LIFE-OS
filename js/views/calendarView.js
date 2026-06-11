/**
 * ===================== CALENDAR VIEW =====================
 * Three sub-views: day (time-blocking), week (7-col chips), month (multi-day spans).
 * Includes mini-cal, area/project filters, and a day popover for quick-add.
 */

const CalendarView = (() => {

  // ===== Top-level render =====

  function render() {
    const view = AppState.ui.calView;
    if (view === 'day') {
      renderDayLayout();
      return;
    }
    document.getElementById('cal-body').innerHTML = '';
    if (view === 'month') renderMonth();
    else if (view === 'week') renderWeek();

    updateFilterBadge();
    document.getElementById('cal-title').textContent = formatTitle(view);
  }

  function formatTitle(view) {
    const d = AppState.ui.calDate;
    if (view === 'day') {
      return d.toLocaleDateString('pt-BR',
        { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (view === 'week') {
      const start = startOfWeek(d);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('pt-BR', { month: 'short' })}`;
    }
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function setView(view) {
    AppState.ui.calView = view;
    document.querySelectorAll('.cal-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('cal-tab-' + view)?.classList.add('active');
    render();
  }

  function navigate(direction) {
    const d = AppState.ui.calDate;
    const view = AppState.ui.calView;
    if (view === 'day') d.setDate(d.getDate() + direction);
    if (view === 'week') d.setDate(d.getDate() + direction * 7);
    if (view === 'month') d.setMonth(d.getMonth() + direction);
    render();
  }

  function goToday() {
    AppState.ui.calDate = new Date();
    AppState.ui.miniCalDate = new Date();
    render();
  }

  // ===== Filter state =====

  function getFilteredTasks(predicate) {
    const filters = AppState.ui.calFilters;
    return TaskService.getAll().filter(t => {
      if (filters.areas.size && !filters.areas.has(t.area)) return false;
      if (filters.project !== 'all' && t.project !== filters.project) return false;
      return predicate(t);
    });
  }

  function toggleFilterPanel() {
    const p = document.getElementById('cal-filter-panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    if (p.style.display === 'block') renderFilterChips();
  }

  function renderFilterChips() {
    document.getElementById('cal-filter-areas').innerHTML = AreaService.getAll().map(a => `
      <span class="filter-chip${AppState.ui.calFilters.areas.has(a.id) ? ' active' : ''}"
            onclick="toggleCalArea('${a.id}')">
        <span style="color:${a.color}">${a.icon}</span> ${a.name}
      </span>`).join('');

    document.getElementById('cal-filter-proj').innerHTML =
      '<option value="all">Todos</option>' +
      AreaService.getAll().flatMap(a => a.projects.map(p =>
        `<option value="${p.id}"${AppState.ui.calFilters.project === p.id ? ' selected' : ''}>${a.icon} ${p.name}</option>`
      )).join('');
  }

  function toggleArea(areaId) {
    const set = AppState.ui.calFilters.areas;
    if (set.has(areaId)) set.delete(areaId);
    else set.add(areaId);
    renderFilterChips();
    render();
  }

  function setProjectFilter(value) {
    AppState.ui.calFilters.project = value;
    render();
  }

  function clearFilters() {
    AppState.ui.calFilters.areas.clear();
    AppState.ui.calFilters.project = 'all';
    renderFilterChips();
    render();
  }

  function updateFilterBadge() {
    const count = AppState.ui.calFilters.areas.size +
      (AppState.ui.calFilters.project !== 'all' ? 1 : 0);
    const badge = document.getElementById('cal-filter-badge');
    if (badge) {
      badge.textContent = count ? count : '';
      badge.style.display = count ? 'inline-block' : 'none';
    }
  }

  // ===== Day view =====

  function renderDayLayout() {
    const body = document.getElementById('cal-body');
    body.innerHTML = `
      <div class="day-layout">
        <div class="day-mini-cal" id="day-mini-cal"></div>
        <div class="day-scroll" id="day-scroll"></div>
      </div>`;
    renderMiniCal();
    renderDay();
  }

  function renderMiniCal() {
    const d = AppState.ui.miniCalDate;
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selISO = isoOf(AppState.ui.calDate);
    const todayISO = Utils.today();

    let html = `
      <div class="day-mini-cal-header">
        <button class="day-mini-nav" onclick="miniCalNav(-1)"><i class="ti ti-chevron-left"></i></button>
        <div class="day-mini-cal-title">${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
        <button class="day-mini-nav" onclick="miniCalNav(1)"><i class="ti ti-chevron-right"></i></button>
      </div>
      <div class="mini-grid">`;

    Constants.CALENDAR.WEEK_DAY_NAMES_SHORT.forEach(n => {
      html += `<div class="mini-day-name">${n}</div>`;
    });

    for (let i = 0; i < firstDay; i++) html += '<div></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoFor(year, month, day);
      const isToday = iso === todayISO;
      const isSelected = iso === selISO;
      const hasTasks = TaskService.getAll()
        .some(t => Utils.taskCoversDay(t, iso) && t.status !== 'concluida');

      html += `<div class="mini-day-wrap">
        <div class="mini-day${isToday ? ' today-mini' : ''}${isSelected ? ' selected' : ''}"
             onclick="miniCalSelect('${iso}')">${day}</div>
        ${hasTasks ? '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:var(--accent2)"></div>' : ''}
      </div>`;
    }
    html += '</div>';
    document.getElementById('day-mini-cal').innerHTML = html;
  }

  function miniCalNav(direction) {
    AppState.ui.miniCalDate.setMonth(AppState.ui.miniCalDate.getMonth() + direction);
    renderMiniCal();
  }

  function miniCalSelect(iso) {
    AppState.ui.calDate = Utils.parseISO(iso);
    document.getElementById('cal-title').textContent = formatTitle('day');
    renderMiniCal();
    renderDay();
  }

  function renderDay() {
    const iso = isoOf(AppState.ui.calDate);
    const tasks = getFilteredTasks(t => Utils.taskCoversDay(t, iso));
    const allDay = tasks.filter(t => !t.start);
    const timed = tasks.filter(t => t.start && !t.dateend);

    document.getElementById('day-scroll').innerHTML =
      buildAllDayBlock(allDay) +
      buildTimeGrid(timed, iso) +
      buildNoTimeBlock(allDay);

    scrollToRelevantHour(iso);
  }

  function buildAllDayBlock(allDay) {
    if (!allDay.length) return '';
    return `<div class="day-allday">
      <div class="day-allday-title">Dia inteiro / sem horário (${allDay.length})</div>
      ${allDay.slice(0, 5).map(t => taskChipForDay(t)).join('')}
    </div>`;
  }

  function buildNoTimeBlock(allDay) {
    if (allDay.length <= 5) return '';
    return `<div class="no-time-section">
      <div class="no-time-title">+${allDay.length - 5} sem horário</div>
      ${allDay.slice(5).map(t => taskChipForDay(t)).join('')}
    </div>`;
  }

  function taskChipForDay(t) {
    const area = AreaService.getById(t.area);
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer"
                 onclick="ttOpenDetail('${t.id}');showView('tasks')">
      <span>${Constants.PRI_ICONS[t.priority]}</span>
      <span style="flex:1;font-size:13px">${t.name}</span>
      ${area ? `<span style="font-size:11px;color:${area.color}">${area.icon}</span>` : ''}
    </div>`;
  }

  /** Returns the display color for a task: area color if set, else priority fallback */
  function taskColor(t) {
    if (t.area) {
      const area = AreaService.getById(t.area);
      if (area && area.color) return area.color;
    }
    const map = { alta: 'var(--red)', media: 'var(--accent2)', baixa: 'var(--green)', nenhuma: 'var(--text3)' };
    return map[t.priority] || map.nenhuma;
  }

  function buildTimeGrid(timed, iso) {
    const startHour = 0;
    const endHour = 24;
    let html = `<div class="time-grid" id="time-grid-inner"
                     onclick="if(event.target.classList.contains('time-slot-bg')||event.target.classList.contains('time-row')) calCreateTask('${iso}',event)">`;

    for (let h = startHour; h < endHour; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      html += `<div class="time-row" data-hour="${h}">
        <div class="time-label">${label}</div>
        <div class="time-slot-bg"></div>
      </div>`;
    }

    html += renderTimeBlocks(timed);
    html += renderNowLine(iso, startHour);
    html += '</div>';
    return html;
  }

  function renderTimeBlocks(tasks) {
    const columns = assignColumns(tasks);
    const PX_PER_MIN = Constants.TIME_GRID.PX_PER_MIN;
    const MIN_H = Constants.TIME_GRID.MIN_BLOCK_HEIGHT_MIN;

    return `<div class="time-events-layer">` +
      columns.map((item) => {
        const { task: t, col, startMin, endMin } = item;
        const top = startMin * PX_PER_MIN;
        const height = Math.max(MIN_H, endMin - startMin) * PX_PER_MIN;
        const effEnd = Math.max(endMin, startMin + MIN_H);
        // Per-cluster colCount: considers only tasks that visually overlap with this one
        const overlapping = columns.filter(o => {
          const oEffEnd = Math.max(o.endMin, o.startMin + MIN_H);
          return !(effEnd <= o.startMin || startMin >= oEffEnd);
        });
        const colCount = Math.max(1, ...overlapping.map(o => o.col + 1));
        const widthPct = 100 / colCount;
        const leftPct = col * widthPct;
        const color = taskColor(t);

        return `<div class="time-block"
                     style="top:${top}px;height:${height - 2}px;left:${leftPct}%;width:calc(${widthPct}% - 2px);background:${color}18;border-left-color:${color}"
                     onclick="ttOpenDetail('${t.id}');showView('tasks')">
          <div class="time-block-name">${t.name}</div>
          <div class="time-block-meta">${t.start}${t.end ? '–' + t.end : ''}</div>
        </div>`;
      }).join('') +
      `</div>`;
  }

  /** Overlap-column assignment using effective visual end time (with minimum block height) */
  function assignColumns(tasks) {
    const sorted = [...tasks].sort((a, b) =>
      Utils.timeToMins(a.start) - Utils.timeToMins(b.start));
    const result = [];
    const MIN_H = Constants.TIME_GRID.MIN_BLOCK_HEIGHT_MIN;
    sorted.forEach(t => {
      const startMin = Utils.timeToMins(t.start);
      const endMin = t.end ? Utils.timeToMins(t.end) : startMin + 30;
      const effEnd = Math.max(endMin, startMin + MIN_H);
      let col = 0;
      while (result.some(r => {
        const rEffEnd = Math.max(r.endMin, r.startMin + MIN_H);
        return r.col === col && !(effEnd <= r.startMin || startMin >= rEffEnd);
      })) col++;
      result.push({ task: t, col, startMin, endMin });
    });
    return result;
  }

  function renderNowLine(iso, startHour) {
    if (iso !== Utils.today()) return '';
    const now = new Date();
    const minsFromStart = (now.getHours() - startHour) * 60 + now.getMinutes();
    const top = minsFromStart * Constants.TIME_GRID.PX_PER_MIN;
    return `<div class="time-now-dot" style="top:${top}px"></div>
            <div class="time-now-line" style="top:${top}px"></div>`;
  }

  function scrollToRelevantHour(iso) {
    const scroller = document.getElementById('day-scroll');
    if (!scroller) return;
    if (iso === Utils.today()) {
      const hour = new Date().getHours();
      scroller.scrollTop = (hour - 1) * Constants.TIME_GRID.HOUR_HEIGHT;
    } else {
      scroller.scrollTop = 6 * Constants.TIME_GRID.HOUR_HEIGHT;
    }
  }

  function createTask(iso, event) {
    const row = event.target.closest('.time-row');
    const hour = row ? parseInt(row.dataset.hour) : 9;
    const start = `${String(hour).padStart(2, '0')}:00`;
    const task = TaskService.create({
      name: 'Nova tarefa',
      date: iso,
      start,
      priority: 'nenhuma'
    });
    AppState.ui.ttDetailId = task.id;
    Navigation.showView('tasks');
    setTimeout(() => TaskDetail.open(task.id), 100);
  }

  // ===== Week view =====

  function renderWeek() {
    const start = startOfWeek(AppState.ui.calDate);
    const todayISO = Utils.today();

    let html = '<div class="week-grid">';
    Constants.CALENDAR.WEEK_DAY_NAMES_FULL.forEach((name, i) => {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const iso = isoOf(day);
      const dayTasks = getFilteredTasks(t => Utils.taskCoversDay(t, iso))
        .filter(t => t.status !== 'concluida');

      html += `<div class="week-col${iso === todayISO ? ' today-col' : ''}">
        <div class="week-col-title">${name}<br>${day.getDate()}</div>
        ${dayTasks.slice(0, 5).map(t => {
          const c = taskColor(t);
          return `<div class="week-task-chip" style="background:${c}22;color:${c}"
               onclick="ttOpenDetail('${t.id}');showView('tasks')">${t.name}</div>`;
        }).join('')}
        ${dayTasks.length > 5 ? `<div style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px;cursor:pointer"
             onclick="AppState.ui.calDate=Utils.parseISO('${iso}');setCalView('day')">+${dayTasks.length - 5}</div>` : ''}
      </div>`;
    });
    html += '</div>';
    document.getElementById('cal-body').innerHTML = html;
  }

  // ===== Month view =====

  function renderMonth() {
    const d = AppState.ui.calDate;
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayISO = Utils.today();
    const MAX_ROWS = Constants.CALENDAR.MAX_MONTH_ROWS;

    const grid = buildMonthGrid(year, month, firstDay, daysInMonth);
    const weeks = chunkWeeks(grid);

    let html = '<div class="month-grid">';
    Constants.CALENDAR.WEEK_DAY_NAMES_FULL.forEach(n => {
      html += `<div class="month-day-name">${n}</div>`;
    });

    weeks.forEach(weekCells => {
      const layout = buildMonthSpans(weekCells, MAX_ROWS);
      html += '<div class="month-week-row">';

      weekCells.forEach((cell, dayIndex) => {
        const iso = cell.iso;
        const isToday = iso === todayISO;
        const isOtherMonth = cell.month !== month;
        const single = cell.tasks.filter(t => !t.dateend || t.dateend === t.date);
        const usedRows = layout.cellRows[dayIndex] || new Set();
        const slots = MAX_ROWS - usedRows.size;
        const singleVisible = single.slice(0, Math.max(0, slots));
        const hidden = (cell.tasks.length - usedRows.size - singleVisible.length);

        html += `<div class="month-day${isToday ? ' today' : ''}${isOtherMonth ? ' other-month' : ''}"
                      onclick="calDayPopover('${iso}',event)">
          <span class="day-num"><span class="day-num-inner">${cell.day}</span></span>
          <div class="month-span-layer">`;

        // Reserve span row slots
        for (let row = 0; row < MAX_ROWS; row++) {
          const span = (layout.cellSpans[dayIndex] || []).find(s => s.row === row);
          if (span) html += renderMonthSpan(span);
          else if (usedRows.has(row)) html += '<div class="span-placeholder"></div>';
        }

        html += '</div>';

        singleVisible.forEach(t => {
          const tc = taskColor(t);
          html += `<div class="month-chip" style="background:${tc}22;color:${tc}"
                       onclick="event.stopPropagation();ttOpenDetail('${t.id}');showView('tasks')">
            ${t.start ? t.start + ' ' : ''}${t.name}
          </div>`;
        });
        if (hidden > 0) {
          html += `<div class="month-more"
                        onclick="event.stopPropagation();AppState.ui.calDate=Utils.parseISO('${iso}');setCalView('day')">
            +${hidden} mais
          </div>`;
        }
        html += '</div>';
      });

      html += '</div>';
    });
    html += '</div>';

    document.getElementById('cal-body').innerHTML = html;

    // Mobile: stretch grid rows to fill viewport height
    if (window.innerWidth <= 768) {
      const grid = document.querySelector('.month-grid');
      if (grid) grid.style.gridTemplateRows = `28px repeat(${weeks.length}, 1fr)`;
    }
  }

  function buildMonthGrid(year, month, firstDay, daysInMonth) {
    const grid = [];
    const prevMonth = new Date(year, month, 0);
    const prevMonthDays = prevMonth.getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const iso = isoFor(prevMonth.getFullYear(), prevMonth.getMonth(), day);
      grid.push({ day, iso, month: prevMonth.getMonth(),
                  tasks: getFilteredTasks(t => Utils.taskCoversDay(t, iso)) });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoFor(year, month, day);
      grid.push({ day, iso, month,
                  tasks: getFilteredTasks(t => Utils.taskCoversDay(t, iso)) });
    }
    while (grid.length % 7 !== 0) {
      const next = new Date(year, month + 1, grid.length - firstDay - daysInMonth + 1);
      const iso = isoOf(next);
      grid.push({ day: next.getDate(), iso, month: next.getMonth(),
                  tasks: getFilteredTasks(t => Utils.taskCoversDay(t, iso)) });
    }
    return grid;
  }

  function chunkWeeks(grid) {
    const weeks = [];
    for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
    return weeks;
  }

  /**
   * Assign rows to multi-day spans within a week so they don't collide.
   * Returns { cellRows: Map<dayIdx,Set<row>>, cellSpans: Map<dayIdx, span[]> }
   */
  function buildMonthSpans(weekCells, maxRows) {
    const cellRows = {};
    const cellSpans = {};

    const multiDay = new Map();
    weekCells.forEach((cell) => {
      cell.tasks.forEach(t => {
        if (!t.dateend || t.dateend === t.date) return;
        if (!multiDay.has(t.id)) {
          const weekStart = weekCells[0].iso;
          const weekEnd = weekCells[6].iso;
          const startsThisWeek = t.date >= weekStart && t.date <= weekEnd;
          const endsThisWeek = t.dateend >= weekStart && t.dateend <= weekEnd;
          const rawStart = startsThisWeek ? weekCells.findIndex(c => c.iso === t.date) : 0;
          const rawEnd = endsThisWeek ? weekCells.findIndex(c => c.iso === t.dateend) : 6;
          multiDay.set(t.id, {
            task: t,
            startIdx: rawStart >= 0 ? rawStart : 0,
            endIdx: rawEnd >= 0 ? rawEnd : 6,
            startsThisWeek,
            endsThisWeek
          });
        }
      });
    });

    const spans = [...multiDay.values()].sort((a, b) =>
      (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));

    spans.forEach(span => {
      let row = 0;
      while (row < maxRows) {
        let conflict = false;
        for (let i = span.startIdx; i <= span.endIdx; i++) {
          if ((cellRows[i] || new Set()).has(row)) { conflict = true; break; }
        }
        if (!conflict) break;
        row++;
      }
      if (row >= maxRows) return;

      // Each covered cell gets its own piece of the span
      for (let i = span.startIdx; i <= span.endIdx; i++) {
        cellRows[i] = cellRows[i] || new Set();
        cellRows[i].add(row);
        cellSpans[i] = cellSpans[i] || [];
        const isFirst = i === span.startIdx;
        const isLast = i === span.endIdx;
        let cls;
        if (isFirst && isLast) cls = 'span-alone';
        else if (isFirst) cls = span.startsThisWeek ? 'span-left' : 'span-mid';
        else if (isLast) cls = span.endsThisWeek ? 'span-right' : 'span-mid';
        else cls = 'span-mid';
        cellSpans[i].push({ ...span, row, cls, isFirst });
      }
    });

    return { cellRows, cellSpans };
  }

  function renderMonthSpan(span) {
    const t = span.task;
    const color = taskColor(t);
    return `<div class="month-span ${span.cls}"
                 style="width:100%;background:${color}33;color:${color}"
                 onclick="event.stopPropagation();ttOpenDetail('${t.id}');showView('tasks')">
      ${span.isFirst ? t.name : ''}
    </div>`;
  }

  // ===== Day popover (quick-add from month view) =====

  const PRI_CYCLE = ['nenhuma', 'alta', 'media', 'baixa'];

  function showDayPopover(iso, event) {
    event.stopPropagation();
    closeDayPopover();

    AppState.ui.popoverDate = iso;
    AppState.ui.popoverPri = 'nenhuma';
    AppState.ui.popoverPriIdx = 0;

    const tasks = TaskService.forDay(iso).filter(t => t.status !== 'concluida');
    const popover = document.createElement('div');
    popover.className = 'cal-popover';
    popover.id = 'cal-popover';
    popover.innerHTML = `
      <div class="cal-popover-header">
        <div class="cal-popover-date">${Utils.parseISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <button class="cal-popover-close" onclick="closeDayPopover()">×</button>
      </div>
      <input class="cal-popover-input" id="pop-input" placeholder="Adicionar tarefa..." onkeydown="popKeyDown(event)">
      <div class="cal-popover-meta">
        <button class="tt-meta-btn" id="pop-pri-btn" onclick="popCyclePri()">
          <i class="ti ti-flag" id="pop-pri-icon"></i> <span id="pop-pri-label">Prioridade</span>
        </button>
      </div>
      <div style="max-height:160px;overflow-y:auto;border-top:1px solid var(--border);padding-top:8px;margin-bottom:10px">
        ${tasks.length ? tasks.slice(0, 5).map(t => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer;font-size:12px"
               onclick="ttOpenDetail('${t.id}');showView('tasks');closeDayPopover()">
            <span>${Constants.PRI_ICONS[t.priority]}</span>
            <span style="flex:1">${t.name}</span>
          </div>`).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Nenhuma tarefa</div>'}
      </div>
      <div class="cal-popover-footer">
        <button class="btn btn-ghost btn-sm" onclick="closeDayPopover()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="popSaveTask()">
          <i class="ti ti-plus"></i> Adicionar
        </button>
        <button class="btn btn-ghost btn-sm" onclick="popOpenFull()" title="Abrir dia">
          <i class="ti ti-arrow-right"></i>
        </button>
      </div>`;

    document.body.appendChild(popover);
    positionPopover(popover, event);
    setTimeout(() => document.getElementById('pop-input').focus(), 30);
  }

  function positionPopover(popover, event) {
    const dayEl = event.target.closest('.month-day');
    const rect = dayEl.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    if (left + 300 > window.innerWidth) left = rect.left - 308;
    if (top + 320 > window.innerHeight) top = window.innerHeight - 320;
    if (top < 10) top = 10;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function closeDayPopover() {
    document.getElementById('cal-popover')?.remove();
  }

  function popCyclePri() {
    AppState.ui.popoverPriIdx = (AppState.ui.popoverPriIdx + 1) % 4;
    AppState.ui.popoverPri = PRI_CYCLE[AppState.ui.popoverPriIdx];
    const pri = AppState.ui.popoverPri;
    document.getElementById('pop-pri-icon').style.color = Constants.PRI_COLORS[pri];
    document.getElementById('pop-pri-label').textContent = pri === 'nenhuma' ? 'Prioridade' : pri;
    document.getElementById('pop-pri-btn').classList.toggle('active', pri !== 'nenhuma');
  }

  function popKeyDown(event) {
    if (event.key === 'Enter') popSaveTask();
    if (event.key === 'Escape') closeDayPopover();
  }

  function popSaveTask() {
    const name = document.getElementById('pop-input').value.trim();
    if (!name) return;
    TaskService.create({
      name,
      priority: AppState.ui.popoverPri,
      date: AppState.ui.popoverDate
    });
    closeDayPopover();
    render();
    if (window.DashboardView) DashboardView.render();
  }

  function popOpenFull() {
    AppState.ui.calDate = Utils.parseISO(AppState.ui.popoverDate);
    closeDayPopover();
    setView('day');
  }

  // ===== Internal date helpers =====

  function isoOf(date) {
    return Utils.toISO(date);
  }

  function isoFor(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  return {
    render, setView, navigate, goToday,
    toggleFilterPanel, toggleArea, setProjectFilter, clearFilters,
    miniCalNav, miniCalSelect,
    createTask,
    showDayPopover, closeDayPopover, popCyclePri, popKeyDown, popSaveTask, popOpenFull
  };
})();
