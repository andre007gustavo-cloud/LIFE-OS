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
    syncOverviewButton();
    if (AppState.ui.habitsOverview) { renderOverview(); return; }
    const el = document.getElementById('habits-list');
    const habits = HabitService.getAll();
    const td = Utils.today();
    const hard = HabitService.isHardDay(td);
    const body = habits.length
      ? habits.map(h => habitRowHtml(h, td, hard)).join('')
      : emptyStateHtml();
    el.innerHTML = body + testButtonHtml();
  }

  // ===== Visão geral / linha do tempo (modo da própria view) =====

  function toggleOverview() {
    AppState.ui.habitsOverview = !AppState.ui.habitsOverview;
    render();
  }

  /** Reflete o modo atual no botão do topo e esconde "Novo" na visão geral */
  function syncOverviewButton() {
    const on = !!AppState.ui.habitsOverview;
    const btn = document.getElementById('habits-overview-btn');
    if (btn) btn.innerHTML = on
      ? '<i class="ti ti-arrow-left"></i> Hábitos'
      : '<i class="ti ti-chart-bar"></i> Visão geral';
    const newBtn = document.getElementById('habits-new-btn');
    if (newBtn) newBtn.style.display = on ? 'none' : '';
  }

  /** Recalcula tudo só aqui (ao abrir a visão), não a cada render da lista */
  function renderOverview() {
    const el = document.getElementById('habits-list');
    const habits = HabitService.getAll();
    if (!habits.length) {
      el.innerHTML = `<div class="empty"><i class="ti ti-chart-bar"></i>
        <p style="font-weight:600;color:var(--text2)">Sem hábitos para resumir</p></div>`;
      return;
    }
    habits.forEach(h => HabitService.stats(h.id)); // materializa escudos antes de contar
    el.innerHTML = summaryCardsHtml(habits) + chartSectionHtml(habits) + heatmapSectionHtml(habits);
  }

  // ---- Cartões-resumo ----

  function summaryCardsHtml(habits) {
    const td = Utils.today();
    let best = { streak: 0, name: '' };
    habits.forEach(h => {
      const s = HabitService.longestStreak(h.id);
      if (s > best.streak) best = { streak: s, name: h.name };
    });
    const ym = td.slice(0, 7);
    const monthName = Utils.parseISO(td).toLocaleDateString('pt-BR', { month: 'long' });
    const rates = habits.map(h => HabitService.monthlyRate(h.id, ym)).filter(r => r !== null);
    const monthRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    const shields = HabitService.shieldsConsumed();

    return `<div class="ov-summary">
      ${ovCardHtml('ti-flame', 'Melhor sequência',
        best.streak ? `${best.streak} ${best.streak === 1 ? 'dia' : 'dias'}` : '—',
        best.name ? escapeHtml(best.name) : 'sem dados')}
      ${ovCardHtml('ti-percentage', 'Taxa do mês',
        monthRate !== null ? monthRate + '%' : '—', monthName)}
      ${ovCardHtml('ti-shield', 'Escudos usados',
        String(shields), 'proteções de sequência')}
    </div>`;
  }

  function ovCardHtml(icon, label, value, context) {
    return `<div class="ov-card">
      <div class="ov-card-label"><i class="ti ${icon}"></i> ${label}</div>
      <div class="ov-card-value">${value}</div>
      <div class="ov-card-context">${context}</div>
    </div>`;
  }

  // ---- Gráfico de barras: taxa mensal (6 meses) ----

  function chartSectionHtml(habits) {
    const sel = AppState.ui.habitsChartSel || 'all';
    const months = lastMonths(6);
    const bars = months.map(m => barHtml(m.label, monthRateFor(sel, m.ym, habits))).join('');
    const options = `<option value="all"${sel === 'all' ? ' selected' : ''}>Todos os hábitos</option>` +
      habits.map(h => `<option value="${h.id}"${sel === h.id ? ' selected' : ''}>${escapeHtml(h.name)}</option>`).join('');
    return `<div class="ov-section">
      <div class="ov-section-head">
        <span class="ov-section-title"><i class="ti ti-chart-bar"></i> Taxa mensal</span>
        <select class="form-select ov-select" onchange="HabitsView.setChartHabit(this.value)">${options}</select>
      </div>
      <div class="ov-bars">${bars}</div>
    </div>`;
  }

  /** Taxa de um mês: hábito específico ou média (não-nula) de todos */
  function monthRateFor(sel, ym, habits) {
    if (sel !== 'all') return HabitService.monthlyRate(sel, ym);
    const rates = habits.map(h => HabitService.monthlyRate(h.id, ym)).filter(r => r !== null);
    return rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  }

  function barHtml(label, rate) {
    const height = rate == null ? 0 : rate;
    return `<div class="ov-bar-col">
      <div class="ov-bar-val">${rate == null ? '–' : rate + '%'}</div>
      <div class="ov-bar-track"><div class="ov-bar-fill" style="height:${height}%"></div></div>
      <div class="ov-bar-label">${label}</div>
    </div>`;
  }

  function setChartHabit(value) {
    AppState.ui.habitsChartSel = value;
    renderOverview();
  }

  /** Últimos n meses (incluindo o atual) como { ym:'YYYY-MM', label:'jun' } */
  function lastMonths(n) {
    const now = Utils.parseISO(Utils.today());
    const res = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      res.push({ ym, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') });
    }
    return res;
  }

  // ---- Heatmap estilo GitHub (últimos 4 meses) ----

  function heatmapSectionHtml(habits) {
    return `<div class="ov-section">
      <div class="ov-section-title"><i class="ti ti-layout-grid"></i> Últimos 4 meses</div>
      ${habits.map(heatmapHtml).join('')}
    </div>`;
  }

  function heatmapHtml(habit) {
    const td = Utils.today();
    const begin = Utils.addDays(td, -119);                          // ~4 meses
    const start = Utils.addDays(begin, -Utils.parseISO(begin).getDay()); // alinha ao domingo
    let cells = '';
    for (let d = start; d <= td; d = Utils.addDays(d, 1)) cells += heatCellHtml(habit, d, td);
    return `<div class="ov-habit">
      <div class="ov-habit-head"><span class="ov-habit-icon">${escapeHtml(habit.icon)}</span> ${escapeHtml(habit.name)}</div>
      <div class="ov-heatmap-wrap"><div class="ov-heatmap">${cells}</div></div>
    </div>`;
  }

  function heatCellHtml(habit, date, td) {
    const title = Utils.fmtDate(date);
    if (!HabitService.isDueOn(habit, date)) return `<div class="ov-cell ov-skip" title="${title} — não devido"></div>`;
    const log = HabitService.getLog(habit.id, date);
    if (log?.status === 'done') return `<div class="ov-cell" style="background:${habit.color}" title="${title} — feito"></div>`;
    if (log?.status === 'minimal') return `<div class="ov-cell" style="background:${habit.color}55" title="${title} — versão mínima"></div>`;
    if (log?.status === 'shielded') return `<div class="ov-cell ov-shield" title="${title} — protegido por escudo"></div>`;
    if (date === td) return `<div class="ov-cell ov-today" title="hoje"></div>`;
    return `<div class="ov-cell ov-fail" title="${title} — não cumprido"></div>`;
  }

  /** Botão de teste do escudo — só em localhost, nunca em produção */
  function testButtonHtml() {
    if (window.location.hostname !== 'localhost') return '';
    return `<button onclick="HabitsView.seedShieldTest()" title="Cria um hábito de teste: 7 dias cumpridos + 1 falha protegida por escudo"
      style="margin-top:12px;padding:5px 10px;font-size:11px;background:transparent;border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text3);cursor:pointer;font-family:inherit">🧪 Testar escudo</button>`;
  }

  function seedShieldTest() {
    const habit = HabitService.create({
      name: 'Teste Escudo', icon: '🧪', minVersion: 'teste',
      frequency: { type: 'daily' }
    });
    // 7 cumpridos (ganha 1 escudo) + falha em ontem (consome o escudo → log
    // 'shielded') + hoje cumprido → streak=9 com quadradinho azul na falha.
    // ("DDDDDDD." colocaria a falha em hoje, que não conta como falha ainda.)
    HabitService._seedTestData(habit.id, 'DDDDDDD.D');
    render();
  }

  function habitRowHtml(habit, td, hard) {
    const { streak, shields } = HabitService.stats(habit.id);
    const rate = HabitService.monthlyRate(habit.id, td.slice(0, 7));
    const monthName = Utils.parseISO(td).toLocaleDateString('pt-BR', { month: 'long' });
    const dueToday = HabitService.isDueOn(habit, td);

    return `<div class="habit-row" data-habit-id="${habit.id}">
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
    if (log) {
      HabitService.toggle(habitId, td, log.status); // desmarcar: sem festa
      refresh();
      return;
    }
    markWithFeedback(habitId, td, HabitService.isHardDay(td) ? 'minimal' : 'done');
  }

  /** Marca hoje e celebra (pulso no botão, marco de sequência, escudo novo) */
  function markWithFeedback(habitId, td, status) {
    const before = HabitService.stats(habitId);
    HabitService.toggle(habitId, td, status);
    announceProgress(HabitService.stats(habitId), before);

    const check = document.querySelector(`.habit-row[data-habit-id="${habitId}"] .habit-check`);
    if (check && Feedback.animationsOn()) {
      Feedback.pulse(check);
      setTimeout(refresh, Constants.FEEDBACK.PULSE_MS); // pulso visível antes do re-render
    } else {
      refresh();
    }
  }

  function announceProgress(after, before) {
    const milestone = after.streak > before.streak
      && Constants.FEEDBACK.STREAK_MILESTONES.includes(after.streak);
    if (milestone) {
      Feedback.celebrate('large');
      Feedback.toast(`Sequência de ${after.streak} dias 🔥`, 'success');
    } else {
      Feedback.celebrate('small');
      if (after.shields > before.shields) Feedback.toast('+1 escudo disponível', 'info');
    }
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
    if (status && !log) {
      markWithFeedback(habitId, td, status); // marcação nova celebra
      return;
    }
    if (!status) {
      if (log) HabitService.toggle(habitId, td, '');
    } else if (log.status !== status) {
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

  /** Rola até o hábito e o destaca brevemente (vindo da paleta de comandos) */
  function highlight(id) {
    const row = document.querySelector(`.habit-row[data-habit-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('cmdk-flash');
    void row.offsetWidth; // força reflow para reiniciar a animação
    row.classList.add('cmdk-flash');
    setTimeout(() => row.classList.remove('cmdk-flash'), 1600);
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
    renderLinkedTaskSection(h);
  }

  /** Seção "Tarefa vinculada": mostra a tarefa recorrente ligada ou oferece criá-la */
  function renderLinkedTaskSection(h) {
    const el = document.getElementById('h-linked-task');
    if (!el) return;
    if (!h.id) { el.innerHTML = ''; return; }
    const linked = TaskService.getAll().find(t => t.habitId === h.id && t.recurrence);
    if (linked) {
      const recLabel = { daily: 'diária', weekly: 'semanal', monthly: 'mensal' }[linked.recurrence] || linked.recurrence;
      el.innerHTML = `<label class="form-label">Tarefa vinculada</label>
        <div class="h-linked-info"><i class="ti ti-link"></i> ${escapeHtml(linked.name)} <span class="h-linked-rec">(${recLabel})</span></div>`;
    } else {
      el.innerHTML = `<label class="form-label">Tarefa vinculada</label>
        <button type="button" class="btn btn-ghost btn-sm" onclick="HabitsView.createLinkedTask()">
          <i class="ti ti-plus"></i> Criar tarefa recorrente
        </button>`;
    }
  }

  /** Fecha o modal do hábito e abre o de tarefa já pré-preenchido com o vínculo */
  function createLinkedTask() {
    const habit = HabitService.getById(AppState.ui.habitEditId);
    if (!habit) return;
    Modal.close('habit-modal');
    TaskModal.openForHabit(habit);
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
    const isNew = !AppState.ui.habitEditId;
    const habit = isNew
      ? HabitService.create(data)
      : HabitService.update(AppState.ui.habitEditId, data);

    Modal.close('habit-modal');
    refresh();
    if (isNew) Feedback.slideIn(`.habit-row[data-habit-id="${habit.id}"]`);
  }

  function archive() {
    if (!confirm('Arquivar hábito? Os registros ficam guardados.')) return;
    HabitService.archive(AppState.ui.habitEditId);
    Modal.close('habit-modal');
    refresh();
  }

  return {
    render, highlight,
    tap, pressStart, pressEnd, openMenu, menuAction,
    openModal, useSuggestion, selectColor, onFreqChange, save, archive,
    createLinkedTask, toggleOverview, setChartHabit,
    seedShieldTest
  };
})();
