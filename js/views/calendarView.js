/**
 * ===================== CALENDAR VIEW =====================
 * Three sub-views: day (time-blocking), week (7-col chips), month (multi-day spans).
 * Includes mini-cal, area/project filters, and a day popover for quick-add.
 */

const CalendarView = (() => {

  const escapeHtml = Utils.escapeHtml;

  /** Tarefa real no dia OU ocorrência futura projetada da recorrência */
  function taskOnDay(t, iso) {
    return Utils.taskCoversDay(t, iso) || Utils.taskRecursOnDay(t, iso);
  }

  /** Badge ↻ para ocorrências projetadas (recorrência futura, não a tarefa real) */
  function recBadge(t, iso) {
    return Utils.taskRecursOnDay(t, iso)
      ? '<i class="ti ti-refresh" style="font-size:9px;opacity:.75"></i> '
      : '';
  }

  // ===== Top-level render =====

  function render() {
    const view = AppState.ui.calView;
    syncTabs(view);
    document.getElementById('cal-title').textContent = formatTitle(view);
    updateFilterBadge();

    if (view === 'day') {
      renderDayLayout();
      return;
    }
    document.getElementById('cal-body').innerHTML = '';
    if (view === 'month') renderMonth();
    else if (view === 'week') renderWeek();
  }

  function syncTabs(view) {
    document.querySelectorAll('.cal-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('cal-tab-' + view)?.classList.add('active');
  }

  /** Entrar pela aba lateral sempre abre na visão mês */
  function enter() {
    AppState.ui.calView = 'month';
    Navigation.showView('calendar');
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
        <span style="color:${a.color}">${escapeHtml(a.icon)}</span> ${escapeHtml(a.name)}
      </span>`).join('');

    document.getElementById('cal-filter-proj').innerHTML =
      '<option value="all">Todos</option>' +
      AreaService.getAll().flatMap(a => a.projects.map(p =>
        `<option value="${p.id}"${AppState.ui.calFilters.project === p.id ? ' selected' : ''}>${escapeHtml(a.icon)} ${escapeHtml(p.name)}</option>`
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
        .some(t => taskOnDay(t, iso) && Utils.isTaskOpen(t));

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
    const tasks = getFilteredTasks(t => taskOnDay(t, iso));
    const allDay = tasks.filter(t => !t.start);
    const timed = tasks.filter(t => t.start && !t.dateend);

    document.getElementById('day-scroll').innerHTML =
      buildAllDayBlock(allDay, iso) +
      buildTimeGrid(timed, iso) +
      buildNoTimeBlock(allDay, iso);

    scrollToRelevantHour(iso);
  }

  function buildAllDayBlock(allDay, iso) {
    if (!allDay.length) return '';
    return `<div class="day-allday">
      <div class="day-allday-title">Dia inteiro / sem horário (${allDay.length})</div>
      ${allDay.slice(0, 5).map(t => taskChipForDay(t, iso)).join('')}
    </div>`;
  }

  function buildNoTimeBlock(allDay, iso) {
    if (allDay.length <= 5) return '';
    return `<div class="no-time-section">
      <div class="no-time-title">+${allDay.length - 5} sem horário</div>
      ${allDay.slice(5).map(t => taskChipForDay(t, iso)).join('')}
    </div>`;
  }

  function taskChipForDay(t, iso) {
    const area = AreaService.getById(t.area);
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer"
                 onclick="ttOpenDetail('${t.id}');showView('tasks')">
      <span>${Constants.PRI_ICONS[t.priority]}</span>
      <span style="flex:1;font-size:13px">${recBadge(t, iso)}${escapeHtml(t.name)}</span>
      ${area ? `<span style="font-size:11px;color:${area.color}">${escapeHtml(area.icon)}</span>` : ''}
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

    html += renderTimeBlocks(timed, iso);
    html += renderNowLine(iso, startHour);
    html += '</div>';
    return html;
  }

  function renderTimeBlocks(tasks, iso) {
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
          <div class="time-block-name">${recBadge(t, iso)}${escapeHtml(t.name)}</div>
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
      const dayTasks = getFilteredTasks(t => taskOnDay(t, iso))
        .filter(t => Utils.isTaskOpen(t));

      html += `<div class="week-col${iso === todayISO ? ' today-col' : ''}">
        <div class="week-col-title">${name}<br>${day.getDate()}</div>
        ${dayTasks.slice(0, 5).map(t => {
          const c = taskColor(t);
          return `<div class="week-task-chip" style="background:${c}22;color:var(--text)"
               onclick="ttOpenDetail('${t.id}');showView('tasks')">${recBadge(t, iso)}${escapeHtml(t.name)}</div>`;
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
          html += `<div class="month-chip" style="background:${tc}22;color:var(--text)"
                       onclick="event.stopPropagation();ttOpenDetail('${t.id}');showView('tasks')">
            ${recBadge(t, iso)}${t.start ? t.start + ' ' : ''}${escapeHtml(t.name)}
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
                  tasks: getFilteredTasks(t => taskOnDay(t, iso)) });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoFor(year, month, day);
      grid.push({ day, iso, month,
                  tasks: getFilteredTasks(t => taskOnDay(t, iso)) });
    }
    while (grid.length % 7 !== 0) {
      const next = new Date(year, month + 1, grid.length - firstDay - daysInMonth + 1);
      const iso = isoOf(next);
      grid.push({ day: next.getDate(), iso, month: next.getMonth(),
                  tasks: getFilteredTasks(t => taskOnDay(t, iso)) });
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
                 style="width:100%;background:${color}33;color:var(--text)"
                 onclick="event.stopPropagation();ttOpenDetail('${t.id}');showView('tasks')">
      ${span.isFirst ? escapeHtml(t.name) : ''}
    </div>`;
  }

  // ===== Day popover (quick-add from month view) =====

  function showDayPopover(iso, event) {
    event.stopPropagation();
    closeDayPopover();

    AppState.ui.popoverDate = iso;
    AppState.ui.popoverPri = 'nenhuma';
    AppState.ui.popoverPriIdx = 0;
    AppState.ui.popoverArea = '';
    AppState.ui.popoverSched = { date: iso, dateend: '', start: '', end: '', recurrence: '' };

    const popover = document.createElement('div');
    popover.className = 'cal-popover cal-create-pop';
    popover.id = 'cal-popover';
    popover.innerHTML = `
      <div class="ccp-header">
        <button class="ccp-date-btn" id="ccp-date-btn" onclick="popOpenDate()">
          <i class="ti ti-calendar"></i> <span id="ccp-date-label">${fmtPopDate(iso)}</span>
        </button>
        <button class="ccp-flag" id="pop-pri-btn" onclick="popCyclePri()" title="Prioridade">
          <i class="ti ti-flag" id="pop-pri-icon"></i>
        </button>
      </div>
      <input class="ccp-title" id="pop-input" placeholder="O que você gostaria de fazer?"
             onkeydown="popKeyDown(event)">
      <textarea class="ccp-notes" id="pop-notes" placeholder="Anotações..."></textarea>
      <div class="ccp-footer">
        <button class="ccp-area-btn" id="ccp-area-btn" onclick="popToggleAreaMenu(event)">
          <i class="ti ti-inbox" id="ccp-area-icon"></i> <span id="ccp-area-label">Caixa de Entrada</span>
        </button>
        <div class="ccp-footer-right">
          <button class="ccp-icon-btn" onclick="popOpenFull()" title="Abrir dia">
            <i class="ti ti-arrow-right"></i>
          </button>
          <button class="ccp-send-btn" onclick="popSaveTask()" title="Adicionar">
            <i class="ti ti-arrow-up"></i>
          </button>
        </div>
      </div>`;

    document.body.appendChild(popover);
    positionPopover(popover, event);
    setTimeout(() => {
      document.getElementById('pop-input').focus();
      document.addEventListener('mousedown', onPopDocDown);
    }, 30);
  }

  function onPopDocDown(e) {
    if (e.target.closest('#cal-popover')) return;
    if (e.target.closest('#date-popover')) return;
    if (e.target.closest('.month-day')) return; // troca de dia tratada à parte
    closeDayPopover();
  }

  /** "Ter, 16 jun" — formato curto do cabeçalho */
  function fmtPopDate(iso) {
    const d = Utils.parseISO(iso);
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const wd = cap(d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
    const mo = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `${wd}, ${d.getDate()} ${mo}`;
  }

  function popOpenDate() {
    DatePopover.open(
      document.getElementById('ccp-date-btn'),
      AppState.ui.popoverSched,
      applyPopSched
    );
  }

  function applyPopSched(result) {
    AppState.ui.popoverSched = { ...result };
    const iso = result.date || AppState.ui.popoverDate;
    AppState.ui.popoverDate = iso;
    document.getElementById('ccp-date-label').textContent = fmtPopDate(iso);
  }

  function popToggleAreaMenu(event) {
    event.stopPropagation();
    const existing = document.getElementById('ccp-area-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'ccp-area-menu';
    menu.id = 'ccp-area-menu';
    menu.innerHTML = `
      <div class="ccp-area-opt" onclick="popPickArea(event,'')">
        <i class="ti ti-inbox"></i> Caixa de Entrada
      </div>
      ${AreaService.getAll().map(a => `
        <div class="ccp-area-opt" onclick="popPickArea(event,'${a.id}')">
          <span style="color:${a.color}">${escapeHtml(a.icon)}</span> ${escapeHtml(a.name)}
        </div>`).join('')}`;
    document.getElementById('ccp-area-btn').appendChild(menu);
  }

  function popPickArea(event, id) {
    event.stopPropagation();
    AppState.ui.popoverArea = id;
    const area = id ? AreaService.getById(id) : null;
    document.getElementById('ccp-area-label').textContent = area ? area.name : 'Caixa de Entrada';
    const icon = document.getElementById('ccp-area-icon');
    if (area) {
      icon.className = '';
      icon.textContent = area.icon;
      icon.style.color = area.color;
    } else {
      icon.className = 'ti ti-inbox';
      icon.textContent = '';
      icon.style.color = '';
    }
    document.getElementById('ccp-area-menu')?.remove();
  }

  function positionPopover(popover, event) {
    const dayEl = event.target.closest('.month-day');
    const rect = dayEl.getBoundingClientRect();
    const w = popover.offsetWidth;
    const h = popover.offsetHeight;
    let left = rect.right + 8;
    let top = rect.top;
    if (left + w > window.innerWidth) left = Math.max(8, rect.left - w - 8);
    if (top + h > window.innerHeight) top = window.innerHeight - h - 10;
    if (top < 10) top = 10;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function closeDayPopover() {
    document.removeEventListener('mousedown', onPopDocDown);
    DatePopover.close();
    document.getElementById('cal-popover')?.remove();
  }

  function popCyclePri() {
    AppState.ui.popoverPriIdx = (AppState.ui.popoverPriIdx + 1) % 4;
    AppState.ui.popoverPri = Constants.PRI_CYCLE[AppState.ui.popoverPriIdx];
    const pri = AppState.ui.popoverPri;
    document.getElementById('pop-pri-icon').style.color =
      pri === 'nenhuma' ? '' : Constants.PRI_COLORS[pri];
    document.getElementById('pop-pri-btn').classList.toggle('active', pri !== 'nenhuma');
  }

  function popKeyDown(event) {
    if (event.key === 'Enter') popSaveTask();
    if (event.key === 'Escape') closeDayPopover();
  }

  function popSaveTask() {
    const name = document.getElementById('pop-input').value.trim();
    if (!name) return;
    const sched = AppState.ui.popoverSched;
    TaskService.create({
      name,
      notes: document.getElementById('pop-notes').value.trim(),
      area: AppState.ui.popoverArea || '',
      priority: AppState.ui.popoverPri,
      date: sched.date || AppState.ui.popoverDate,
      dateend: sched.dateend || '',
      start: sched.start || '',
      end: sched.end || '',
      recurrence: sched.recurrence || ''
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
    render, enter, setView, navigate, goToday,
    toggleFilterPanel, toggleArea, setProjectFilter, clearFilters,
    miniCalNav, miniCalSelect,
    createTask,
    showDayPopover, closeDayPopover, popCyclePri, popKeyDown, popSaveTask, popOpenFull,
    popOpenDate, popToggleAreaMenu, popPickArea
  };
})();
