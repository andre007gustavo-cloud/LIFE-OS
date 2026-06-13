/**
 * ===================== REVIEW VIEW =====================
 * Revisão semanal guiada (Fase 6). Dois modos:
 *  - Resumo: estatísticas da semana + botão para iniciar a revisão.
 *  - Fluxo guiado: 5 passos em tela cheia (inbox, atrasadas, projetos parados,
 *    planejar a próxima semana, fechamento). Voltar/Próximo no rodapé.
 * Não acessa Storage direto — tudo via ReviewService e demais services.
 */

const ReviewView = (() => {

  const escapeHtml = Utils.escapeHtml;
  const TOTAL_STEPS = 5;

  /** null = modo resumo; objeto = fluxo guiado em andamento */
  let flow = null;

  // ===== Entrada / dispatch =====

  function render() {
    const root = document.getElementById('review-root');
    if (!root) return;
    // body.rv-flow esconde os FABs flutuantes, que cobririam o rodapé do fluxo
    document.body.classList.toggle('rv-flow', !!flow);
    root.innerHTML = flow ? flowHtml() : summaryHtml();
    if (flow && flow.step === 4) prefillGoals();
  }

  function isFlowActive() {
    return !!flow;
  }

  // ===== Modo resumo =====

  function summaryHtml() {
    const s = ReviewService.weekStats();
    const since = ReviewService.daysSinceLastReview();
    const lastLabel = since === Infinity ? 'Você ainda não fez nenhuma revisão.'
      : since === 0 ? 'Última revisão: hoje.'
      : `Última revisão: há ${since} ${since === 1 ? 'dia' : 'dias'}.`;

    return `<div class="rv-summary">
      <div class="rv-summary-head">
        <h2 class="rv-title">Revisão semanal</h2>
        <p class="rv-sub">${lastLabel}</p>
      </div>
      <div class="rv-stat-grid">
        ${statCard('ti-circle-check', 'Concluídas', s.completedTasks, 'nesta semana')}
        ${statCard('ti-repeat', 'Hábitos', s.habitRate === null ? '—' : s.habitRate + '%', 'cumpridos')}
        ${statCard('ti-wallet', 'Saldo', Utils.formatBRL(s.saldo), 'da semana', s.saldo < 0 ? 'var(--red)' : 'var(--emerald)')}
        ${statCard('ti-flame', 'Sequências', s.streaks, 'ativas')}
      </div>
      <button class="rv-start-btn" onclick="ReviewView.start()">
        <i class="ti ti-player-play"></i> Iniciar revisão semanal
      </button>
    </div>`;
  }

  function statCard(icon, label, value, ctx, color) {
    return `<div class="rv-stat">
      <div class="rv-stat-label"><i class="ti ${icon}"></i> ${label}</div>
      <div class="rv-stat-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
      <div class="rv-stat-ctx">${ctx}</div>
    </div>`;
  }

  // ===== Fluxo: shell (progresso + corpo + rodapé) =====

  function start() {
    flow = { step: 1, processed: 0, resolvedProjects: [] };
    render();
  }

  function exit() {
    flow = null;
    render();
  }

  function flowHtml() {
    return `<div class="rv-flow">
      ${progressHtml()}
      <div class="rv-step-body">${stepBody()}</div>
      ${footerHtml()}
    </div>`;
  }

  function progressHtml() {
    const pct = Math.round(flow.step / TOTAL_STEPS * 100);
    return `<div class="rv-progress">
      <div class="rv-progress-track"><div class="rv-progress-fill" style="width:${pct}%"></div></div>
      <span class="rv-progress-label">${flow.step}/${TOTAL_STEPS}</span>
    </div>`;
  }

  function stepBody() {
    switch (flow.step) {
      case 1: return step1Inbox();
      case 2: return step2Overdue();
      case 3: return step3Stalled();
      case 4: return step4Plan();
      case 5: return step5Close();
      default: return '';
    }
  }

  function footerHtml() {
    const backDisabled = flow.step === 1 ? ' disabled' : '';
    const isLast = flow.step === TOTAL_STEPS;
    const nextBlocked = flow.step === 1 && InboxService.count() > 0;

    const nextBtn = isLast
      ? `<button class="rv-next" onclick="ReviewView.finish()"><i class="ti ti-check"></i> Concluir revisão</button>`
      : `<button class="rv-next"${nextBlocked ? ' disabled' : ''} onclick="ReviewView.next()">Próximo <i class="ti ti-arrow-right"></i></button>`;

    const hint = nextBlocked
      ? `<div class="rv-foot-hint">Processe todos os itens primeiro
           <button class="rv-link" onclick="ReviewView.deferInbox()">ou adiar restantes</button>
         </div>`
      : '';

    return `<div class="rv-footer">
      ${hint}
      <div class="rv-foot-btns">
        <button class="rv-back"${backDisabled} onclick="ReviewView.back()"><i class="ti ti-arrow-left"></i> Voltar</button>
        ${nextBtn}
      </div>
    </div>`;
  }

  function next() {
    if (flow.step === 4) saveGoals(); // captura edições não confirmadas por blur
    if (flow.step < TOTAL_STEPS) { flow.step++; render(); }
  }

  function back() {
    if (flow.step === 4) saveGoals();
    if (flow.step > 1) { flow.step--; render(); }
  }

  // ===== Passo 1 — Caixa de entrada =====

  function step1Inbox() {
    const items = InboxService.getAll();
    const body = items.length
      ? items.map(inboxRowHtml).join('')
      : `<div class="rv-empty"><div class="rv-empty-emoji">🧘</div>
           <p>Caixa de entrada vazia. Tudo processado.</p></div>`;
    return stepHeader('Caixa de entrada',
      'Decida o destino de cada captura: vira tarefa, vai como nota num projeto, ou some.')
      + `<div class="rv-list">${body}</div>`;
  }

  function inboxRowHtml(item) {
    const projOpts = ProjectService.getAll().map(p =>
      `<option value="${p.id}">${escapeHtml(p.icon || '📁')} ${escapeHtml(p.name)}</option>`).join('');
    return `<div class="rv-item">
      <div class="rv-item-text">${escapeHtml(item.text)}</div>
      <div class="rv-item-actions">
        <button class="rv-act rv-act-primary" onclick="ReviewView.inboxToTask('${item.id}')">
          <i class="ti ti-checkbox"></i> Virar tarefa
        </button>
        <select class="rv-act rv-act-select" onchange="ReviewView.inboxToProject('${item.id}', this.value)">
          <option value="">Anotar em projeto…</option>
          ${projOpts}
        </select>
        <button class="rv-act rv-act-muted" onclick="ReviewView.inboxDiscard('${item.id}')">
          <i class="ti ti-trash"></i> Descartar
        </button>
      </div>
    </div>`;
  }

  function inboxToTask(id) {
    const item = InboxService.getById(id);
    if (!item) return;
    const parsed = QuickParser.parse(item.text, AreaService.getAll());
    TaskService.create({
      name: parsed.name || item.text,
      area: parsed.areaId,
      priority: parsed.priority || 'nenhuma',
      date: parsed.date || '',
      start: parsed.time || '',
      end: parsed.timeend || '',
      recurrence: parsed.recurrence || ''
    });
    InboxService.remove(id);
    flow.processed++;
    render();
  }

  function inboxToProject(id, projectId) {
    if (!projectId) return;
    const item = InboxService.getById(id);
    if (!item) return;
    ProjectService.addNote(projectId, { title: item.text.slice(0, 80), content: item.text });
    InboxService.remove(id);
    flow.processed++;
    render();
  }

  function inboxDiscard(id) {
    InboxService.remove(id);
    flow.processed++;
    render();
  }

  /** Adiar restantes: avança deixando os itens na caixa para a próxima semana */
  function deferInbox() {
    flow.step = 2;
    render();
  }

  // ===== Passo 2 — Tarefas atrasadas =====

  function step2Overdue() {
    const overdue = ReviewService.overdueTasks();
    const counter = `<div class="rv-counter">${overdue.length} ${overdue.length === 1 ? 'atrasada' : 'atrasadas'} → 0 ideal</div>`;
    const body = overdue.length
      ? overdue.map(overdueRowHtml).join('')
      : `<div class="rv-empty"><div class="rv-empty-emoji">✅</div>
           <p>Nenhuma tarefa atrasada. Em dia.</p></div>`;
    return stepHeader('Tarefas atrasadas',
      'Cada pendência vencida precisa de uma decisão — não de culpa.')
      + counter + `<div class="rv-list">${body}</div>`;
  }

  function overdueRowHtml(t) {
    const area = AreaService.getById(t.area);
    return `<div class="rv-item">
      <div class="rv-item-main">
        <div class="rv-item-text">${escapeHtml(t.name)}</div>
        <div class="rv-item-meta">
          <span style="color:var(--red)">${Utils.fmtDate(t.date)}</span>
          ${area ? `<span style="color:${area.color}">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>` : ''}
        </div>
      </div>
      <div class="rv-item-actions">
        <button class="rv-act rv-act-primary" onclick="ReviewView.overdueToday('${t.id}')">
          <i class="ti ti-sun"></i> Fazer hoje
        </button>
        <label class="rv-act rv-act-date">
          <i class="ti ti-calendar"></i> Reagendar
          <input type="date" min="${Utils.today()}" onchange="ReviewView.overdueReschedule('${t.id}', this.value)">
        </label>
        <button class="rv-act rv-act-muted" onclick="ReviewView.overdueArchive('${t.id}')">
          <i class="ti ti-archive"></i> Arquivar
        </button>
      </div>
    </div>`;
  }

  function overdueToday(id) {
    TaskService.updateField(id, 'date', Utils.today());
    render();
  }

  function overdueReschedule(id, value) {
    if (!value) return;
    TaskService.updateField(id, 'date', value);
    render();
  }

  function overdueArchive(id) {
    TaskService.archive(id);
    render();
  }

  // ===== Passo 3 — Projetos parados =====

  function step3Stalled() {
    const stalled = ReviewService.stalledProjects()
      .filter(p => !flow.resolvedProjects.includes(p.id));
    if (!stalled.length) {
      return stepHeader('Projetos parados', '')
        + `<div class="rv-empty"><div class="rv-empty-emoji">👏</div>
             <p>Todos os projetos ativos tiveram movimento esta semana.</p></div>`;
    }
    return stepHeader('Projetos parados',
      `Sem tarefas concluídas nos últimos ${Constants.REVIEW.STALLED_DAYS} dias. O que fazer com cada um?`)
      + `<div class="rv-list">${stalled.map(stalledRowHtml).join('')}</div>`;
  }

  function stalledRowHtml(p) {
    const area = AreaService.getById(p.area);
    return `<div class="rv-item">
      <div class="rv-item-main">
        <div class="rv-item-text">${escapeHtml(p.icon || '📁')} ${escapeHtml(p.name)}</div>
        ${area ? `<div class="rv-item-meta"><span style="color:${area.color}">${escapeHtml(area.name)}</span></div>` : ''}
      </div>
      <div class="rv-item-actions">
        <button class="rv-act rv-act-primary" onclick="ReviewView.projectKeep('${p.id}')">
          <i class="ti ti-check"></i> Continua ativo
        </button>
        <button class="rv-act" onclick="ReviewView.projectPause('${p.id}')">
          <i class="ti ti-player-pause"></i> Pausar
        </button>
        <button class="rv-act rv-act-muted" onclick="ReviewView.projectArchive('${p.id}')">
          <i class="ti ti-circle-check"></i> Concluir
        </button>
      </div>
    </div>`;
  }

  function projectKeep(id) {
    flow.resolvedProjects.push(id);
    render();
  }

  function projectPause(id) {
    ProjectService.updateField(id, 'status', 'pausado');
    render();
  }

  function projectArchive(id) {
    ProjectService.updateField(id, 'status', 'concluido');
    render();
  }

  // ===== Passo 4 — Planejar a semana =====

  function step4Plan() {
    const ws = ReviewService.nextWeekStart();
    return stepHeader('Planejar a próxima semana',
      'Defina as 3 grandes — o que precisa acontecer, mesmo que o resto não aconteça.')
      + bigThreeHtml()
      + `<div class="rv-week-grid">${weekCardsHtml(ws)}</div>`;
  }

  function bigThreeHtml() {
    const inputs = [];
    for (let i = 0; i < Constants.REVIEW.GOALS_MAX; i++) {
      inputs.push(`<div class="rv-goal-row">
        <span class="rv-goal-num">${i + 1}</span>
        <input class="rv-goal-input" id="rv-goal-${i}" maxlength="120"
               placeholder="Grande prioridade ${i + 1}"
               onchange="ReviewView.saveGoals()">
      </div>`);
    }
    return `<div class="rv-bigthree"><div class="rv-bigthree-title">As 3 grandes da semana</div>${inputs.join('')}</div>`;
  }

  function prefillGoals() {
    const saved = ReviewService.getWeeklyGoals(ReviewService.nextWeekStart());
    const goals = (saved && saved.goals) || [];
    for (let i = 0; i < Constants.REVIEW.GOALS_MAX; i++) {
      const el = document.getElementById('rv-goal-' + i);
      if (el) el.value = goals[i] || '';
    }
  }

  function saveGoals() {
    const goals = [];
    for (let i = 0; i < Constants.REVIEW.GOALS_MAX; i++) {
      goals.push((document.getElementById('rv-goal-' + i) || {}).value || '');
    }
    ReviewService.saveWeeklyGoals(ReviewService.nextWeekStart(), goals);
  }

  function weekCardsHtml(weekStart) {
    const cards = [];
    for (let i = 0; i < 7; i++) {
      const iso = Utils.addDays(weekStart, i);
      const d = Utils.parseISO(iso);
      const tasks = TaskService.getAll().filter(t =>
        Utils.taskCoversDay(t, iso) || Utils.taskRecursOnDay(t, iso));
      const names = tasks.slice(0, 4).map(t =>
        `<div class="rv-week-task">${escapeHtml(t.name)}</div>`).join('');
      const more = tasks.length > 4 ? `<div class="rv-week-more">+${tasks.length - 4}</div>` : '';
      cards.push(`<div class="rv-week-card">
        <div class="rv-week-day">${Constants.CALENDAR.WEEK_DAY_NAMES_FULL[d.getDay()]} ${d.getDate()}</div>
        ${tasks.length ? names + more : '<div class="rv-week-empty">livre</div>'}
      </div>`);
    }
    return cards.join('');
  }

  // ===== Passo 5 — Fechamento =====

  function step5Close() {
    const s = ReviewService.weekStats();
    const comeback = ReviewService.recentComeback();
    const habitLabel = s.habitRate === null ? '—' : `${s.habitRate}%`;
    const saldoColor = s.saldo < 0 ? 'var(--red)' : 'var(--emerald)';

    return stepHeader('Fechamento', moodPhrase(s))
      + `<div class="rv-close-card">
        <div class="rv-close-grid">
          ${closeStat(s.completedTasks, 'tarefas concluídas')}
          ${closeStat(habitLabel, `hábitos (${s.habitDone}/${s.habitDue})`)}
          ${closeStat(Utils.formatBRL(s.saldo), 'saldo da semana', saldoColor)}
          ${closeStat(s.streaks, s.streaks === 1 ? 'sequência ativa' : 'sequências ativas')}
        </div>
        ${comeback ? comebackLineHtml(comeback) : ''}
      </div>`;
  }

  function closeStat(value, label, color) {
    return `<div class="rv-close-stat">
      <div class="rv-close-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
      <div class="rv-close-label">${label}</div>
    </div>`;
  }

  /** Parte C: menção gentil a um recomeço recente */
  function comebackLineHtml(comeback) {
    const n = Utils.diffDays(comeback.date, Utils.today());
    const when = n === 0 ? 'Você voltou hoje e já está aqui'
      : `Você voltou faz ${n} ${n === 1 ? 'dia' : 'dias'} e está aqui de novo`;
    return `<div class="rv-close-comeback"><i class="ti ti-seeding"></i> ${when}. Isso é constância.</div>`;
  }

  /** Frase sóbria adaptada ao resultado da semana */
  function moodPhrase(s) {
    const strong = (s.habitRate !== null && s.habitRate >= 70) || s.completedTasks >= 10;
    const some = s.completedTasks > 0 || (s.habitRate !== null && s.habitRate > 0);
    if (strong) return 'Semana sólida. O trabalho aparece nos números.';
    if (some) return 'Semana de altos e baixos. O que importa é ter seguido.';
    return 'Semana difícil. Sem drama — segue na próxima.';
  }

  function finish() {
    const goals = ReviewService.getWeeklyGoals(ReviewService.nextWeekStart());
    ReviewService.addReviewLog({
      processedInboxCount: flow.processed,
      weeklyGoals: (goals && goals.goals) || []
    });
    flow = null;
    render();
    Feedback.celebrate('large');
    Feedback.toast('Revisão concluída', 'success');
    DashboardView.render(); // atualiza o gatilho de revisão no painel
  }

  // ===== Helpers =====

  function stepHeader(title, sub) {
    return `<div class="rv-step-head">
      <h2 class="rv-step-title">${title}</h2>
      ${sub ? `<p class="rv-step-sub">${sub}</p>` : ''}
    </div>`;
  }

  return {
    render, start, exit, next, back, finish, isFlowActive,
    inboxToTask, inboxToProject, inboxDiscard, deferInbox,
    overdueToday, overdueReschedule, overdueArchive,
    projectKeep, projectPause, projectArchive,
    saveGoals
  };
})();
