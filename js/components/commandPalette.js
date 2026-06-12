/**
 * ===================== COMMAND PALETTE =====================
 * Paleta de comandos global (Ctrl+K / Cmd+K). Navega, cria, executa ações e
 * busca tarefas/projetos/hábitos por nome (match acento-insensível + fuzzy).
 * Componente sem view própria: monta seu DOM no boot e reage ao teclado.
 * Consulta sempre os services — nunca o Storage direto.
 */

const CommandPalette = (() => {

  const escapeHtml = Utils.escapeHtml;

  let overlayEl, modalEl, inputEl, listEl;
  let isOpen = false;
  let query = '';
  let selectedIndex = 0;
  let flatItems = [];        // itens executáveis na ordem exibida
  let lastFocused = null;    // foco a restaurar ao fechar

  const RESULT_LIMIT = 8;    // por tipo (tarefas/projetos/hábitos)

  // ===== Catálogo de comandos =====
  // { id, label:string|fn, section, icon, shortcut?, when?:()=>bool, run:()=>void }

  const COMMANDS = [
    // --- Navegar ---
    { id: 'nav-dashboard', section: 'Navegar', icon: 'ti-layout-dashboard', label: 'Ir para Painel',      run: () => Navigation.showView('dashboard') },
    { id: 'nav-now',       section: 'Navegar', icon: 'ti-target',           label: 'Modo Agora',          run: () => Navigation.showView('now') },
    { id: 'nav-tasks',     section: 'Navegar', icon: 'ti-checklist',        label: 'Ir para Tarefas',     run: () => Navigation.showView('tasks') },
    { id: 'nav-calendar',  section: 'Navegar', icon: 'ti-calendar',         label: 'Ir para Calendário',  run: () => Navigation.showView('calendar') },
    { id: 'nav-finance',   section: 'Navegar', icon: 'ti-coin',             label: 'Ir para Finanças',    run: () => Navigation.showView('finance') },
    { id: 'nav-areas',     section: 'Navegar', icon: 'ti-briefcase',        label: 'Ir para Projetos',    run: () => Navigation.showView('areas') },
    { id: 'nav-habits',    section: 'Navegar', icon: 'ti-repeat',           label: 'Ir para Hábitos',     run: () => Navigation.showView('habits') },

    // --- Criar ---
    { id: 'new-task',    section: 'Criar', icon: 'ti-plus',      label: 'Nova tarefa',                 run: () => TaskModal.open() },
    { id: 'new-fin',     section: 'Criar', icon: 'ti-cash',      label: 'Novo lançamento financeiro',  run: () => FinanceModal.open() },
    { id: 'new-project', section: 'Criar', icon: 'ti-briefcase', label: 'Novo projeto',                run: () => ProjectModal.open() },
    { id: 'new-habit',   section: 'Criar', icon: 'ti-repeat',    label: 'Novo hábito',                 run: () => HabitsView.openModal() },
    { id: 'new-inbox',   section: 'Criar', icon: 'ti-inbox',     label: 'Item na caixa de entrada',    run: openInboxCapture },

    // --- Ação ---
    {
      id: 'pomo-start', section: 'Ação', icon: 'ti-player-play',
      when: () => !PomodoroService.getState().running,
      label: () => currentDetailTask() ? 'Iniciar pomodoro na tarefa atual' : 'Iniciar pomodoro avulso',
      run: () => { const t = currentDetailTask(); PomodoroUI.toggle(t ? t.id : undefined); }
    },
    {
      id: 'pomo-pause', section: 'Ação', icon: 'ti-player-pause',
      when: () => PomodoroService.getState().running,
      label: 'Pausar pomodoro',
      run: () => PomodoroUI.toggle()
    },
    { id: 'theme', section: 'Ação', icon: 'ti-contrast', label: 'Alternar tema claro/escuro', run: () => Theme.toggle() },
    { id: 'settings', section: 'Ação', icon: 'ti-settings', label: 'Configurações', run: () => SettingsModal.open() },
    {
      id: 'hardmode', section: 'Ação', icon: 'ti-shield-half',
      label: () => HabitService.isHardDay(Utils.today()) ? 'Desativar modo dia difícil' : 'Ativar modo dia difícil',
      run: () => DashboardView.toggleHardMode()
    },
    { id: 'logout', section: 'Ação', icon: 'ti-logout', label: 'Sair', run: () => LoginScreen.logout() }
  ];

  // ===== Boot =====

  function init() {
    buildDom();
    document.addEventListener('keydown', onGlobalKey);
  }

  function buildDom() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'cmdk-overlay';
    overlayEl.innerHTML = `
      <div class="cmdk-modal" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div class="cmdk-input-wrap">
          <i class="ti ti-search cmdk-search-icon"></i>
          <input class="cmdk-input" id="cmdk-input" type="text" autocomplete="off"
                 spellcheck="false" placeholder="Buscar ou executar um comando...">
          <span class="cmdk-hint">↵ executar · Esc fechar</span>
        </div>
        <div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Comandos"></div>
      </div>`;
    document.body.appendChild(overlayEl);

    modalEl = overlayEl.querySelector('.cmdk-modal');
    inputEl = overlayEl.querySelector('#cmdk-input');
    listEl  = overlayEl.querySelector('#cmdk-list');

    inputEl.addEventListener('input', () => { query = inputEl.value; selectedIndex = 0; rerender(); });
    inputEl.addEventListener('keydown', onInputKey);
    overlayEl.addEventListener('click', e => { if (e.target === overlayEl) close(); });
    listEl.addEventListener('mousemove', e => {
      const item = e.target.closest('.cmdk-item');
      if (item && +item.dataset.idx !== selectedIndex) { selectedIndex = +item.dataset.idx; updateSelection(); }
    });
    listEl.addEventListener('click', e => {
      const item = e.target.closest('.cmdk-item');
      if (item) { selectedIndex = +item.dataset.idx; onEnter(); }
    });
  }

  // ===== Abrir / fechar =====

  function open() {
    if (isOpen) return;
    isOpen = true;
    lastFocused = document.activeElement;
    query = '';
    selectedIndex = 0;
    inputEl.value = '';
    overlayEl.classList.add('open');
    rerender();
    inputEl.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlayEl.classList.remove('open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  // ===== Teclado =====

  function onGlobalKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
    if (isOpen) { e.preventDefault(); close(); return; }
    if (isEditable(document.activeElement)) return; // não rouba o atalho de quem digita
    e.preventDefault();
    open();
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown')      { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter')     { e.preventDefault(); onEnter(); }
    else if (e.key === 'Escape')    { e.preventDefault(); close(); }
    else if (e.key === 'Tab')       { e.preventDefault(); } // Tab não faz nada
  }

  function isEditable(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  function move(delta) {
    const n = flatItems.length;
    if (!n) return;
    selectedIndex = (selectedIndex + delta + n) % n;
    updateSelection();
  }

  function onEnter() {
    const item = flatItems[selectedIndex];
    if (item) { close(); item.run(); }
    else captureToInbox();
  }

  /** Fallback do empty state: a query vira item da caixa de entrada (captura universal) */
  function captureToInbox() {
    const text = query.trim();
    if (!text) return;
    InboxService.add(text, 'texto');
    close();
    Feedback.toast('Capturado', 'success');
    Navigation.renderAll();
  }

  // ===== Montagem da lista =====

  function computeItems() {
    const cmds = COMMANDS.filter(c => !c.when || c.when());
    const q = query.trim();

    if (!q) return cmds.map(toCmdItem);

    const scored = [];
    cmds.forEach(c => {
      const s = score(q, labelOf(c));
      if (s >= 0) scored.push({ s, item: toCmdItem(c) });
    });
    searchEntities(q).forEach(r => scored.push(r));
    scored.sort((a, b) => b.s - a.s);
    return scored.map(r => r.item);
  }

  function toCmdItem(c) {
    return { icon: c.icon, label: labelOf(c), section: c.section, shortcut: c.shortcut, run: c.run };
  }

  function searchEntities(q) {
    const out = [];

    rank(TaskService.pending(), t => t.name).forEach(({ s, obj }) =>
      out.push({ s, item: {
        icon: 'ti-circle-dashed', label: obj.name, section: 'Tarefa',
        run: () => { Navigation.showView('tasks'); TaskDetail.open(obj.id); }
      } }));

    rank(ProjectService.getAll(), p => p.name).forEach(({ s, obj }) =>
      out.push({ s, item: {
        icon: 'ti-briefcase', label: obj.name, section: 'Projeto',
        run: () => { Navigation.showView('areas'); AreasView.openProject(obj.id); }
      } }));

    rank(HabitService.getAll(), h => h.name).forEach(({ s, obj }) =>
      out.push({ s, item: {
        icon: 'ti-repeat', label: obj.name, section: 'Hábito',
        run: () => { Navigation.showView('habits'); HabitsView.highlight(obj.id); }
      } }));

    return out;

    function rank(items, nameOf) {
      return items
        .map(obj => ({ s: score(q, nameOf(obj)), obj }))
        .filter(r => r.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, RESULT_LIMIT);
    }
  }

  // ===== Render =====

  function rerender() {
    flatItems = computeItems();
    if (selectedIndex >= flatItems.length) selectedIndex = Math.max(0, flatItems.length - 1);
    if (!flatItems.length) {
      listEl.innerHTML = `
        <div class="cmdk-empty">
          Nada encontrado para "${escapeHtml(query.trim())}"
          <div class="cmdk-empty-hint">Pressione Enter para capturar na caixa de entrada</div>
        </div>`;
      return;
    }
    listEl.innerHTML = flatItems.map((item, i) => `
      <div class="cmdk-item${i === selectedIndex ? ' selected' : ''}" role="option"
           aria-selected="${i === selectedIndex}" data-idx="${i}">
        <i class="ti ${item.icon}"></i>
        <span class="cmdk-item-label">${escapeHtml(item.label)}</span>
        <span class="cmdk-item-section">${escapeHtml(item.section)}</span>
        ${item.shortcut ? `<span class="cmdk-item-shortcut">${escapeHtml(item.shortcut)}</span>` : ''}
      </div>`).join('');
  }

  function updateSelection() {
    [...listEl.children].forEach(child => {
      const idx = +child.dataset.idx;
      if (Number.isNaN(idx)) return;
      const sel = idx === selectedIndex;
      child.classList.toggle('selected', sel);
      child.setAttribute('aria-selected', sel);
      if (sel) child.scrollIntoView({ block: 'nearest' });
    });
  }

  // ===== Busca: normalização, score e fuzzy =====

  /** minúsculas + sem acentos, para comparar texto digitado e alvo */
  function normalize(s) {
    const combiningMarks = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
    return String(s || '').toLowerCase().normalize('NFD').replace(combiningMarks, '');
  }

  /**
   * Relevância de `query` em `target`. -1 = sem match.
   * Prefixo da string > prefixo de palavra > substring > subsequência (fuzzy).
   * A subsequência atende "ligca" → "ligar caio" (cada char na ordem).
   */
  function score(query, target) {
    const q = normalize(query);
    const t = normalize(target);
    if (!q) return 0;

    const idx = t.indexOf(q);
    if (idx === 0) return 1000;
    if (idx > 0) return t[idx - 1] === ' ' ? 800 : 600 - idx;

    let from = 0;
    for (const ch of q) {
      const found = t.indexOf(ch, from);
      if (found === -1) return -1;
      from = found + 1;
    }
    return 200;
  }

  // ===== Helpers de comando =====

  function labelOf(c) {
    return typeof c.label === 'function' ? c.label() : c.label;
  }

  function currentDetailTask() {
    const id = AppState.ui.ttDetailId;
    return id ? TaskService.getById(id) : null;
  }

  function openInboxCapture() {
    const panel = document.getElementById('inbox-capture');
    if (panel && !panel.classList.contains('open')) InboxCapture.toggle();
    document.getElementById('inbox-capture-input')?.focus();
  }

  return { init, open, close };
})();
