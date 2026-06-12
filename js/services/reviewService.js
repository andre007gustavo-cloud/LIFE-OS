/**
 * ===================== REVIEW SERVICE =====================
 * Revisão semanal guiada + recomeço sem culpa (Fase 6).
 * Domínio puro: metas da semana, logs de revisão, eventos de recomeço e as
 * consultas que alimentam cada passo do fluxo. Knows nothing about the DOM.
 *
 * weeklyGoal: { weekStart:'YYYY-MM-DD', goals:[string,string,string], createdAt }
 * reviewLog:  { id, date, processedInboxCount, weeklyGoals, completedAt }
 * event:      { id, type:'comeback', daysAway, choice, date, createdAt }
 */

const ReviewService = (() => {

  /** DBs antigos não têm as coleções da Fase 6 — inicializa sob demanda */
  function _db() {
    const db = AppState.getDB();
    if (!db.weeklyGoals) db.weeklyGoals = [];
    if (!db.reviewLogs) db.reviewLogs = [];
    if (!db.events) db.events = [];
    if (!db.meta) db.meta = {};
    return db;
  }

  // ===== Semana (seg–dom) =====

  function currentWeekStart() { return Utils.startOfWeek(Utils.today()); }
  function nextWeekStart() { return Utils.addDays(currentWeekStart(), 7); }
  function weekEnd(weekStart) { return Utils.addDays(weekStart, 6); }

  // ===== Metas da semana =====

  function getWeeklyGoals(weekStart) {
    return _db().weeklyGoals.find(g => g.weekStart === weekStart) || null;
  }

  function saveWeeklyGoals(weekStart, goals) {
    const clean = (goals || [])
      .map(g => String(g || '').trim())
      .slice(0, Constants.REVIEW.GOALS_MAX);
    const db = _db();
    const entry = db.weeklyGoals.find(g => g.weekStart === weekStart);
    if (entry) {
      entry.goals = clean;
    } else {
      db.weeklyGoals.push({ weekStart, goals: clean, createdAt: Date.now() });
    }
    AppState.persist();
  }

  // ===== Logs de revisão =====

  function lastReviewLog() {
    const logs = _db().reviewLogs;
    return logs.length ? logs.reduce((a, b) => (a.date >= b.date ? a : b)) : null;
  }

  /** Dias desde a última revisão concluída; Infinity se nunca revisou */
  function daysSinceLastReview() {
    const last = lastReviewLog();
    return last ? Utils.diffDays(last.date, Utils.today()) : Infinity;
  }

  function addReviewLog({ processedInboxCount, weeklyGoals }) {
    const entry = {
      id: Utils.uid(),
      date: Utils.today(),
      processedInboxCount: processedInboxCount || 0,
      weeklyGoals: weeklyGoals || [],
      completedAt: Date.now()
    };
    _db().reviewLogs.push(entry);
    AppState.persist();
    return entry;
  }

  // ===== Eventos de recomeço =====

  function addEvent(evt) {
    const entry = { id: Utils.uid(), date: Utils.today(), createdAt: Date.now(), ...evt };
    _db().events.push(entry);
    AppState.persist();
    return entry;
  }

  /** Recomeço mais recente dentro da janela (default 7 dias); null se nenhum */
  function recentComeback(days = Constants.REVIEW.COMEBACK_RECENT_DAYS) {
    const td = Utils.today();
    return _db().events
      .filter(e => e.type === 'comeback' && Utils.diffDays(e.date, td) <= days)
      .sort((a, b) => (a.date >= b.date ? -1 : 1))[0] || null;
  }

  // ===== Recomeço: detecção de ausência =====

  /** Última atividade carimbada em AppState.persist; null se nunca houve */
  function detectComeback() {
    const last = _db().meta.lastActivity;
    if (!last) return null;
    const daysAway = Utils.diffDays(last, Utils.today());
    return daysAway > Constants.REVIEW.COMEBACK_DAYS ? { daysAway } : null;
  }

  /** Carimba que o app foi aberto hoje (zera o relógio de ausência) */
  function stampActivity() {
    AppState.persist();
  }

  // ===== Tarefas vencidas =====

  /** Em aberto, com data anterior a hoje e que não cobre hoje (multi-dia ok) */
  function overdueTasks(td = Utils.today()) {
    return TaskService.getAll().filter(t =>
      Utils.isTaskOpen(t) && t.date && t.date < td && !Utils.taskCoversDay(t, td));
  }

  /** Vencidas de prioridade alta, mais antigas primeiro, limitadas */
  function topOverdue(limit = Constants.REVIEW.REVIEW_OVERDUE_KEEP, td = Utils.today()) {
    return overdueTasks(td)
      .filter(t => t.priority === 'alta')
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(0, limit);
  }

  /** Arquiva todas as vencidas exceto as exceções; retorna quantas arquivou */
  function archiveOverdue(exceptIds = [], td = Utils.today()) {
    const keep = new Set(exceptIds);
    const victims = overdueTasks(td).filter(t => !keep.has(t.id));
    victims.forEach(t => { t.status = 'descartada'; });
    if (victims.length) AppState.persist();
    return victims.length;
  }

  // ===== Projetos parados =====

  /** Ativos sem nenhuma tarefa concluída nos últimos STALLED_DAYS dias */
  function stalledProjects(td = Utils.today()) {
    const cutoff = Utils.addDays(td, -Constants.REVIEW.STALLED_DAYS);
    return ProjectService.getAll().filter(p => {
      if (p.status !== 'ativo') return false;
      if (p.createdAt && p.createdAt >= cutoff) return false; // recém-criado
      const moved = TaskService.forProject(p.id).some(t =>
        t.status === 'concluida' && t.date && t.date >= cutoff);
      return !moved;
    });
  }

  // ===== Estatísticas da semana (fechamento) =====

  function weekStats(weekStart = currentWeekStart()) {
    const end = weekEnd(weekStart);
    const td = Utils.today();

    const completedTasks = TaskService.getAll().filter(t =>
      t.status === 'concluida' && t.date && t.date >= weekStart && t.date <= end).length;

    const habits = HabitService.getAll();
    let habitDue = 0, habitDone = 0;
    habits.forEach(h => {
      for (let d = weekStart; d <= end && d <= td; d = Utils.addDays(d, 1)) {
        if (!HabitService.isDueOn(h, d)) continue;
        habitDue++;
        if (HabitService.getLog(h.id, d)) habitDone++;
      }
    });
    const habitRate = habitDue ? Math.round(habitDone / habitDue * 100) : null;

    const finEntries = FinanceService.getAll()
      .filter(e => e.date >= weekStart && e.date <= end);
    const saldo = FinanceService.summarize(finEntries).saldo;

    const streaks = habits.filter(h => HabitService.stats(h.id).streak > 0).length;

    return { completedTasks, habitRate, habitDone, habitDue, saldo, streaks };
  }

  // ===== Teste manual =====

  /**
   * APENAS PARA TESTE MANUAL NO CONSOLE — não usar em produção.
   * Recua a data da última atividade para simular ausência e disparar a tela de
   * recomeço no próximo carregamento. Grava direto (sem AppState.persist, que
   * recarimbaria a data de hoje). Ex.: ReviewService._simulateAbsence(6).
   */
  function _simulateAbsence(days = 6) {
    const db = AppState.getDB();
    if (!db.meta) db.meta = {};
    db.meta.lastActivity = Utils.addDays(Utils.today(), -days);
    localStorage.setItem(Constants.STORAGE_KEY, JSON.stringify(db));
    Storage.saveToCloud(db);
    console.log(`Ausência de ${days} dias simulada. Recarregue a página (F5).`);
  }

  return {
    currentWeekStart, nextWeekStart, weekEnd,
    getWeeklyGoals, saveWeeklyGoals,
    lastReviewLog, daysSinceLastReview, addReviewLog,
    addEvent, recentComeback,
    detectComeback, stampActivity,
    overdueTasks, topOverdue, archiveOverdue,
    stalledProjects, weekStats,
    _simulateAbsence
  };
})();
