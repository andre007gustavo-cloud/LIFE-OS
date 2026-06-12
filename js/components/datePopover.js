/**
 * ===================== DATE POPOVER =====================
 * Popover estilo Todoist para escolher Data ou Duração de uma tarefa.
 * Aba "Data": atalhos + grade do mês + horário + repetição.
 * Aba "Duração": Começar/Fim (data + hora) para tarefas multi-dia.
 *
 * Componente de UI puro: recebe um valor e um callback de aplicação;
 * não sabe nada de TaskService nem de qual tela o abriu.
 */

const DatePopover = (() => {

  // Estado da instância aberta
  let onApply = null;     // callback(result) ao confirmar
  let anchorEl = null;    // botão que abriu o popover (para reposicionar/fechar)
  let tab = 'data';       // 'data' | 'duracao'
  let viewY = 0, viewM = 0; // mês exibido na grade
  let val = blankValue();

  function blankValue() {
    return { date: '', dateend: '', start: '', end: '', recurrence: '', allDay: true };
  }

  function normalize(v) {
    v = v || {};
    return {
      date: v.date || '',
      dateend: v.dateend || '',
      start: v.start || '',
      end: v.end || '',
      recurrence: v.recurrence || '',
      allDay: !(v.start || v.end)
    };
  }

  // ===== Abrir / fechar =====

  function open(anchor, value, applyCb) {
    onApply = applyCb;
    anchorEl = anchor;
    val = normalize(value);
    tab = (val.dateend && val.dateend !== val.date) ? 'duracao' : 'data';
    const base = Utils.parseISO(val.date || Utils.today());
    viewY = base.getFullYear();
    viewM = base.getMonth();
    render();
    position();
    el().classList.add('open');
    setTimeout(() => document.addEventListener('mousedown', onDocDown), 0);
  }

  function close() {
    el().classList.remove('open');
    document.removeEventListener('mousedown', onDocDown);
    onApply = null;
    anchorEl = null;
  }

  function onDocDown(e) {
    if (e.target.closest('#date-popover')) return;
    if (anchorEl && anchorEl.contains(e.target)) return;
    close();
  }

  function el() { return document.getElementById('date-popover'); }

  function position() {
    const pop = el();
    const r = anchorEl.getBoundingClientRect();
    const w = pop.offsetWidth;
    let left = Math.min(r.right - w, window.innerWidth - w - 8);
    left = Math.max(8, left);
    let top = r.bottom + 6;
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - pop.offsetHeight - 6);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  // ===== Render =====

  function render() {
    el().innerHTML = `
      <div class="dp-tabs">
        <button class="dp-tab${tab === 'data' ? ' active' : ''}" onclick="dpTab('data')">Data</button>
        <button class="dp-tab${tab === 'duracao' ? ' active' : ''}" onclick="dpTab('duracao')">Duração</button>
      </div>
      <div class="dp-body">${tab === 'data' ? dataPanel() : duracaoPanel()}</div>
      ${repeatRow()}
      <div class="dp-actions">
        <button class="dp-btn" onclick="dpClear()">Limpar</button>
        <button class="dp-btn dp-ok" onclick="dpApply()">OK</button>
      </div>`;
  }

  function dataPanel() {
    return presetsRow() + monthGrid() + timeRow();
  }

  function presetsRow() {
    const items = [
      { key: 'hoje', icon: 'ti-sun', title: 'Hoje' },
      { key: 'amanha', icon: 'ti-sunrise', title: 'Amanhã' },
      { key: 'fimsemana', icon: 'ti-calendar', title: 'Fim de semana' },
      { key: 'proxsemana', icon: 'ti-moon', title: 'Próxima semana' }
    ];
    return `<div class="dp-presets">${items.map(p =>
      `<button class="dp-preset" title="${p.title}" onclick="dpPreset('${p.key}')">
        <i class="ti ${p.icon}"></i>
      </button>`).join('')}</div>`;
  }

  function presetDate(key) {
    const td = Utils.today();
    const dow = Utils.parseISO(td).getDay();
    if (key === 'hoje') return td;
    if (key === 'amanha') return Utils.addDays(td, 1);
    if (key === 'fimsemana') return Utils.addDays(td, (6 - dow + 7) % 7 || 7);
    if (key === 'proxsemana') return Utils.addDays(td, (8 - dow) % 7 || 7); // próxima segunda
    return td;
  }

  function monthGrid() {
    const title = new Date(viewY, viewM, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const heads = Constants.CALENDAR.WEEK_DAY_NAMES_SHORT
      .map(d => `<span class="dp-dow">${d}</span>`).join('');
    return `
      <div class="dp-cal-head">
        <span class="dp-month">${title}</span>
        <span class="dp-nav">
          <button onclick="dpNav(-1)"><i class="ti ti-chevron-left"></i></button>
          <button onclick="dpNav(1)"><i class="ti ti-chevron-right"></i></button>
        </span>
      </div>
      <div class="dp-grid">${heads}${gridCells()}</div>`;
  }

  function gridCells() {
    const first = new Date(viewY, viewM, 1);
    const start = Utils.addDays(Utils.toISO(first), -first.getDay());
    const td = Utils.today();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const iso = Utils.addDays(start, i);
      const d = Utils.parseISO(iso);
      const cls = ['dp-day'];
      if (d.getMonth() !== viewM) cls.push('other');
      if (iso === td) cls.push('today');
      if (iso === val.date) cls.push('selected');
      cells += `<button class="${cls.join(' ')}" onclick="dpPickDay('${iso}')">${d.getDate()}</button>`;
    }
    return cells;
  }

  function timeRow() {
    return `
      <div class="dp-row">
        <i class="ti ti-clock"></i>
        <input type="time" class="dp-time" value="${val.start}"
               onchange="dpSetTime('start',this.value)">
        ${val.start ? `<button class="dp-row-clear" onclick="dpSetTime('start','')"><i class="ti ti-x"></i></button>` : ''}
      </div>`;
  }

  function duracaoPanel() {
    const begin = val.date || Utils.today();
    const end = val.dateend || begin;
    return `
      <div class="dp-dur-row">
        <span class="dp-dur-label">Começar</span>
        <input type="date" class="dp-date" value="${begin}" onchange="dpSetDurDate('date',this.value)">
        <input type="time" class="dp-time" value="${val.start}" ${val.allDay ? 'disabled' : ''}
               onchange="dpSetTime('start',this.value)">
      </div>
      <div class="dp-dur-row">
        <span class="dp-dur-label">Fim</span>
        <input type="date" class="dp-date" value="${end}" onchange="dpSetDurDate('dateend',this.value)">
        <input type="time" class="dp-time" value="${val.end}" ${val.allDay ? 'disabled' : ''}
               onchange="dpSetTime('end',this.value)">
      </div>
      <label class="dp-switch-row">
        <span>Durante todo o dia</span>
        <span class="dp-switch${val.allDay ? ' on' : ''}" onclick="dpToggleAllDay()">
          <span class="dp-knob"></span>
        </span>
      </label>`;
  }

  function repeatRow() {
    const opts = [['', 'Não repetir'], ['daily', 'Diária'], ['weekly', 'Semanal'], ['monthly', 'Mensal']];
    return `
      <div class="dp-row dp-repeat">
        <i class="ti ti-refresh"></i>
        <select class="dp-select" onchange="dpSetRepeat(this.value)">
          ${opts.map(([v, l]) =>
            `<option value="${v}"${val.recurrence === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>`;
  }

  // ===== Handlers =====

  function setTab(t) {
    tab = t;
    if (t === 'duracao') {
      if (!val.date) val.date = Utils.today();
      if (!val.dateend) val.dateend = val.date;
    } else {
      val.dateend = '';
    }
    render();
    position();
  }

  function preset(key) {
    val.date = presetDate(key);
    const base = Utils.parseISO(val.date);
    viewY = base.getFullYear();
    viewM = base.getMonth();
    render();
    position();
  }

  function navMonth(delta) {
    const d = new Date(viewY, viewM + delta, 1);
    viewY = d.getFullYear();
    viewM = d.getMonth();
    render();
    position();
  }

  function pickDay(iso) {
    val.date = (val.date === iso) ? '' : iso;
    render();
  }

  function setTime(field, value) {
    val[field] = value;
    if (value) val.allDay = false;
    render();
    position();
  }

  function setDurDate(field, value) {
    val[field] = value;
    // Fim nunca antes do começo
    if (val.dateend && val.date && val.dateend < val.date) {
      if (field === 'date') val.dateend = value; else val.date = value;
    }
    render();
  }

  function toggleAllDay() {
    val.allDay = !val.allDay;
    if (val.allDay) { val.start = ''; val.end = ''; }
    render();
    position();
  }

  function setRepeat(value) {
    val.recurrence = value;
  }

  function clear() {
    val = blankValue();
    if (onApply) onApply({ date: '', dateend: '', start: '', end: '', recurrence: '' });
    close();
  }

  function apply() {
    const result = (tab === 'duracao')
      ? {
          date: val.date, dateend: (val.dateend !== val.date ? val.dateend : ''),
          start: val.allDay ? '' : val.start, end: val.allDay ? '' : val.end,
          recurrence: val.recurrence
        }
      : { date: val.date, dateend: '', start: val.start, end: '', recurrence: val.recurrence };
    if (onApply) onApply(result);
    close();
  }

  return {
    open, close,
    setTab, preset, navMonth, pickDay, setTime, setDurDate,
    toggleAllDay, setRepeat, clear, apply
  };
})();
