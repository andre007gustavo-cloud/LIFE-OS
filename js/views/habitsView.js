/**
 * ===================== HABITS VIEW =====================
 * Lista de hábitos com grade dos últimos 7 dias, streak, escudos e taxa do
 * mês. Marcar hoje: toque simples = done (ou minimal no modo dia difícil);
 * toque longo / clique-direito abre opções. Modal de criar/editar hábito.
 */

const HabitsView = (() => {

  const escapeHtml = Utils.escapeHtml;

  const SUGGESTIONS = [
    { name: 'Treino', icon: '💪', color: '#f87171', minVersion: '1 flexão' },
    { name: 'Leitura', icon: '📖', color: '#60a5fa', minVersion: 'Ler 1 página' },
    { name: 'Dormir antes das 23h', icon: '😴', color: '#a78bfa', minVersion: 'Deitar até 23h30' }
  ];

  const LONG_PRESS_MS = 500;
  let pressTimer = null;
  let longPressFired = false;
  let menuWired = false;

  // ===== Render =====

  function render() {
    wireMenuCloseOnce();
    const el = document.getElementById('habits-list');
    const habits = HabitService.getAll();
    if (!habits.length) {
      el.innerHTML = emptyStateHtml();
      return;
    }
    const td = Utils.today();
    const hard = HabitService.isHardDay(td);
    el.innerHTML = habits.map(h => habitRowHtml(h, td, hard)).join('');
  }

  function habitRowHtml(habit, td, hard) {
    const { streak, shields } = HabitService.stats(habit.id);
    const rate = HabitService.monthlyRate(habit.id, td.slice(0, 7));
    const monthName = Utils.parseISO(td).toLocaleDateString('pt-BR', { month: 'long' });
    const dueToday = HabitService.isDueOn(habit, td);

    return `<div class="habit-row">
      <div class="habit-icon" style="background:${habit.color}22" onclick="HabitsView.openModal('${habit.id}')">${escapeHtml(habit.icon)}</div>
      <div class="habit-info" onclick="HabitsView.openModal('${habit.id}')">
        <div class="habit-name">${escapeHtml(habit.name)}</div>
        <div class="habit-meta">
          <span class="habit-streak"><i class="ti ti-flame"></i>${streak} ${streak === 1 ? 'dia' : 'dias'}</span>
          <span class="habit-shields"><i class="ti ti-shield"></i>${shields}</span>
          ${rate !== null ? `<span>${rate}% em ${monthName}</span>` : ''}
        </div>
        ${hard && dueToday ? `<div class="habit-mingoal">hoje: ${escapeHtml(habit.minVersion)}</div>` : ''}
      </div>
      <div class="habit-week">${weekSquaresHtml(habit, td)}</div>
      ${todayCheckHtml(habit, td, hard)}
    </div>`;
  }

  function weekSquaresHtml(habit, td) {
    let html = '';
    for (let i = 6; i >= 0; i--) {
      html += squareHtml(habit, Utils.addDays(td, -i), td);
    }
    return html;
  }

  function squareHtml(habit, date, td) {
    const title = Utils.fmtDate(date);
    if (!HabitService.isDueOn(habit, date)) {
      return `<span class="hd hd-skip" title="${title} — não devido"></span>`;
    }
    const log = HabitService.getLog(habit.id, date);
    if (log?.status === 'done') return `<span class="hd hd-done" title="${title} — feito"><i class="ti ti-check"></i></span>`;
    if (log?.status === 'minimal') return `<span class="hd hd-min" title="${title} — versão mínima"></span>`;
    if (log?.status === 'shielded') return `<span class="hd hd-shield" title="${title} — protegido por escudo"><i class="ti ti-shield"></i></span>`;
    if (date === td) return `<span class="hd hd-pending" title="hoje"></span>`;
    return `<span class="hd hd-fail" title="${title} — não cumprido"></span>`;
  }

  function todayCheckHtml(habit, td, hard) {
    if (!HabitService.isDueOn(habit, td)) {
      return '<button class="habit-check notdue" disabled title="Não devido hoje"><i class="ti ti-minus"></i></button>';
    }
    const log = HabitService.getLog(habit.id, td);
    const icons = { done: 'ti-check', minimal: 'ti-leaf', shielded: 'ti-shield' };
    const title = hard
      ? `Hoje vale a versão mínima: ${Utils.escapeAttr(habit.minVersion)} · toque longo para opções`
      : 'Marcar como feito · toque longo para opções';
    return `<button class="habit-check${log ? ' ' + log.status : ''}"
      onclick="HabitsView.tap('${habit.id}')"
      onpointerdown="HabitsView.pressStart(event,'${habit.id}')"
      onpointerup="HabitsView.pressEnd()"
      onpointerleave="HabitsView.pressEnd()"
      oncontextmenu="HabitsView.openMenu(event,'${habit.id}');return false"
      title="${title}"><i class="ti ${icons[log?.status] || 'ti-check'}"></i></button>`;
  }

  function emptyStateHtml() {
    return `<div class="empty">
      <i class="ti ti-repeat"></i>
      <p style="font-weight:600;color:var(--text2)">Nenhum hábito ainda</p>
      <p style="font-size:12px;margin-top:4px">Comece com uma sugestão:</p>
      <div class="habit-suggestions">
        ${SUGGESTIONS.map((s, i) =>
          `<button class="btn btn-ghost" onclick="HabitsView.useSuggestion(${i})">${s.icon} ${escapeHtml(s.name)}</button>`).join('')}
      </div>
    </div>`;
  }

  // ===== Marcar hoje (toque simples / toque longo) =====

  function tap(habitId) {
    if (longPressFired) { longPressFired = false; return; }
    const td = Utils.today();
    const log = HabitService.getLog(habitId, td);
    const mark = HabitService.isHardDay(td) ? 'minimal' : 'done';
    HabitService.toggle(habitId, td, log ? log.status : mark);
    refresh();
  }

  function pressStart(e, habitId) {
    longPressFired = false;
    const x = e.clientX, y = e.clientY;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      showMenu(x, y, habitId);
    }, LONG_PRESS_MS);
  }

  function pressEnd() {
    clearTimeout(pressTimer);
  }

  function openMenu(e, habitId) {
    showMenu(e.clientX, e.clientY, habitId);
  }

  function showMenu(x, y, habitId) {
    closeMenu();
    const menu = document.createElement('div');
    menu.id = 'habit-menu';
    menu.innerHTML =
      `<button onclick="HabitsView.menuAction('${habitId}','minimal')"><i class="ti ti-leaf"></i> Versão mínima</button>
       <button onclick="HabitsView.menuAction('${habitId}','')"><i class="ti ti-x"></i> Desmarcar</button>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
  }

  function menuAction(habitId, status) {
    closeMenu();
    const td = Utils.today();
    const log = HabitService.getLog(habitId, td);
    if (!status) {
      if (log) HabitService.toggle(habitId, td, '');
    } else if (log?.status !== status) {
      HabitService.toggle(habitId, td, status);
    }
    refresh();
  }

  function closeMenu() {
    document.getElementById('habit-menu')?.remove();
  }

  /** Fecha o menu de toque longo ao interagir fora dele (uma vez no boot da view) */
  function wireMenuCloseOnce() {
    if (menuWired) return;
    menuWired = true;
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#habit-menu')) closeMenu();
    });
  }

  function refresh() {
    render();
    DashboardView.render(); // card "Hábitos hoje"
  }

  // ===== Modal de criar/editar =====

  function openModal(habitId) {
    AppState.ui.habitEditId = habitId || null;
    fillModal(habitId ? HabitService.getById(habitId) : {});
    Modal.open('habit-modal');
  }

  function useSuggestion(idx) {
    AppState.ui.habitEditId = null;
    fillModal({ ...SUGGESTIONS[idx] });
    Modal.open('habit-modal');
  }

  function fillModal(h) {
    document.getElementById('habit-modal-title').textContent = h.id ? 'Editar Hábito' : 'Novo Hábito';
    document.getElementById('h-name').value = h.name || '';
    document.getElementById('h-icon').value = h.icon || '✅';
    document.getElementById('h-minversion').value = h.minVersion || '';
    document.getElementById('h-freq').value = h.frequency?.type || 'daily';
    document.getElementById('h-archive-btn').style.display = h.id ? 'inline-flex' : 'none';
    AppState.ui.habitColorSel = h.color || Constants.COLORS[0];
    renderColorPicker();
    renderDayChips(h.frequency?.days || []);
    onFreqChange();
  }

  function renderColorPicker() {
    document.getElementById('h-color-picker').innerHTML = Constants.COLORS
      .map(c => `<div onclick="HabitsView.selectColor('${c}')" data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === AppState.ui.habitColorSel ? '#fff' : 'transparent'};transition:border .15s"></div>`)
      .join('');
  }

  function selectColor(color) {
    AppState.ui.habitColorSel = color;
    document.querySelectorAll('#h-color-picker div').forEach(d => {
      d.style.border = d.dataset.color === color
        ? '3px solid #fff' : '3px solid transparent';
    });
  }

  function renderDayChips(selectedDays) {
    document.getElementById('h-days').innerHTML = Constants.CALENDAR.WEEK_DAY_NAMES_FULL
      .map((name, day) => `<button type="button" class="h-day-chip${selectedDays.includes(day) ? ' active' : ''}" data-day="${day}" onclick="this.classList.toggle('active')">${name}</button>`)
      .join('');
  }

  function onFreqChange() {
    const custom = document.getElementById('h-freq').value === 'custom';
    document.getElementById('h-days-group').style.display = custom ? 'block' : 'none';
  }

  function save() {
    const name = document.getElementById('h-name').value.trim();
    const minVersion = document.getElementById('h-minversion').value.trim();
    if (!name) return alert('Nome obrigatório');
    if (!minVersion) return alert('Versão mínima obrigatória — o que conta como feito num dia péssimo?');

    const type = document.getElementById('h-freq').value;
    const days = [...document.querySelectorAll('#h-days .h-day-chip.active')]
      .map(b => parseInt(b.dataset.day));
    if (type === 'custom' && !days.length) return alert('Escolha pelo menos um dia da semana');

    const data = {
      name,
      icon: document.getElementById('h-icon').value.trim() || '✅',
      color: AppState.ui.habitColorSel,
      frequency: { type, days: type === 'custom' ? days : [] },
      minVersion
    };
    if (AppState.ui.habitEditId) HabitService.update(AppState.ui.habitEditId, data);
    else HabitService.create(data);

    Modal.close('habit-modal');
    refresh();
  }

  function archive() {
    if (!confirm('Arquivar hábito? Os registros ficam guardados.')) return;
    HabitService.archive(AppState.ui.habitEditId);
    Modal.close('habit-modal');
    refresh();
  }

  return {
    render,
    tap, pressStart, pressEnd, openMenu, menuAction,
    openModal, useSuggestion, selectColor, onFreqChange, save, archive
  };
})();
