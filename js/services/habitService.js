/**
 * ===================== HABIT SERVICE =====================
 * Hábitos, registros diários (habitLogs) e escudos de sequência.
 * Também guarda o estado por dia do "modo dia difícil" (hardModeDates).
 * Knows nothing about the DOM.
 *
 * habit:    { id, name, icon, color, frequency:{type,days}, minVersion, createdAt, archived }
 * habitLog: { habitId, date:'YYYY-MM-DD', status:'done'|'minimal'|'shielded', source?:'manual'|'task' }
 */

const HabitService = (() => {

  /** DBs antigos não têm as coleções da Fase 4 — inicializa sob demanda */
  function _db() {
    const db = AppState.getDB();
    if (!db.habits) db.habits = [];
    if (!db.habitLogs) db.habitLogs = [];
    if (!db.hardModeDates) db.hardModeDates = [];
    return db;
  }

  // ===== CRUD =====

  function getAll() {
    return _db().habits.filter(h => !h.archived);
  }

  function getById(id) {
    return _db().habits.find(h => h.id === id);
  }

  function create({ name, icon, color, frequency, minVersion }) {
    const habit = {
      id: Utils.uid(),
      name,
      icon: icon || '✅',
      color: color || Constants.COLORS[0],
      frequency: frequency || { type: 'daily', days: [] },
      minVersion,
      createdAt: Utils.today(),
      archived: false
    };
    _db().habits.push(habit);
    AppState.persist();
    return habit;
  }

  function update(id, patch) {
    const habit = getById(id);
    if (!habit) return null;
    Object.assign(habit, patch);
    AppState.persist();
    return habit;
  }

  /** Arquiva o hábito; os logs nunca são apagados. Limpa o vínculo das tarefas. */
  function archive(id) {
    if (typeof TaskService !== 'undefined') TaskService.clearHabitLink(id);
    return update(id, { archived: true });
  }

  // ===== Logs =====

  function getLog(habitId, date) {
    return _db().habitLogs.find(l => l.habitId === habitId && l.date === date);
  }

  /**
   * Marca/desmarca um dia: mesmo status (ou status vazio) remove o log;
   * status diferente atualiza; sem log existente, cria.
   */
  function toggle(habitId, date, status) {
    const db = _db();
    const log = getLog(habitId, date);
    if (log && (log.status === status || !status)) {
      db.habitLogs = db.habitLogs.filter(l => l !== log);
    } else if (log) {
      log.status = status;
    } else if (status) {
      db.habitLogs.push({ habitId, date, status, source: 'manual' });
    }
    AppState.persist();
  }

  /**
   * Marca o hábito 'done' a partir da conclusão de uma tarefa vinculada.
   * Se já existe log no dia (ex.: marcação manual anterior), mantém — não duplica.
   */
  function markFromTask(habitId, date) {
    if (!date || getLog(habitId, date)) return;
    _db().habitLogs.push({ habitId, date, status: 'done', source: 'task' });
    AppState.persist();
  }

  /** Desfaz a marcação SÓ se o log veio da tarefa (marcação manual fica intacta) */
  function unmarkFromTask(habitId, date) {
    const log = getLog(habitId, date);
    if (!log || log.source !== 'task') return;
    const db = _db();
    db.habitLogs = db.habitLogs.filter(l => l !== log);
    AppState.persist();
  }

  // ===== Frequência =====

  /** O hábito é devido nesta data? (antes da criação nunca é devido) */
  function isDueOn(habit, date) {
    if (date < habit.createdAt) return false;
    const freq = habit.frequency || { type: 'daily' };
    if (freq.type === 'daily') return true;
    const dow = Utils.parseISO(date).getDay();
    if (freq.type === 'weekdays') return dow >= 1 && dow <= 5;
    return (freq.days || []).includes(dow);
  }

  function _dueDates(habit, endDate) {
    const dates = [];
    for (let d = habit.createdAt; d <= endDate; d = Utils.addDays(d, 1)) {
      if (isDueOn(habit, d)) dates.push(d);
    }
    return dates;
  }

  // ===== Escudos =====

  /**
   * Reconstrói o saldo de escudos e protege automaticamente UMA falha isolada
   * quando há escudo disponível (grava log 'shielded'). Retorna o saldo atual.
   * Regras: +1 escudo a cada 7 cumprimentos reais consecutivos (máx. 3);
   * dia 'shielded' mantém a sequência mas não conta para ganhar escudo;
   * duas falhas devidas seguidas quebram mesmo com escudo disponível.
   */
  function _applyShields(habit) {
    const td = Utils.today();
    let shields = 0, earnRun = 0, prevFulfilled = true, changed = false;

    for (const date of _dueDates(habit, td)) {
      const log = getLog(habit.id, date);
      if (log && log.status !== 'shielded') {
        earnRun++;
        if (earnRun % Constants.HABITS.SHIELD_EVERY === 0) {
          shields = Math.min(Constants.HABITS.SHIELD_MAX, shields + 1);
        }
        prevFulfilled = true;
      } else if (log) {
        // 'shielded': consumo já registrado; não é cumprimento real (zera a
        // contagem rumo ao próximo escudo) e a falha seguinte quebra a sequência
        shields = Math.max(0, shields - 1);
        earnRun = 0;
        prevFulfilled = false;
      } else if (date === td) {
        break; // hoje ainda em aberto: não é falha
      } else if (prevFulfilled && shields > 0) {
        _db().habitLogs.push({ habitId: habit.id, date, status: 'shielded' });
        shields--;
        prevFulfilled = false;
        changed = true;
      } else {
        earnRun = 0;
        prevFulfilled = false;
      }
    }
    if (changed) AppState.persist();
    return shields;
  }

  /** Aplica escudos pendentes e retorna { streak, shields } do hábito */
  function stats(habitId) {
    const habit = getById(habitId);
    if (!habit) return { streak: 0, shields: 0 };
    const shields = _applyShields(habit);
    return { streak: streak(habitId), shields };
  }

  // ===== Métricas =====

  /**
   * Dias devidos consecutivos cumpridos (done/minimal/shielded), de hoje para
   * trás. Dias não-devidos não quebram; hoje em aberto também não quebra.
   */
  function streak(habitId) {
    const habit = getById(habitId);
    if (!habit) return 0;
    const td = Utils.today();
    let count = 0;
    for (let date = td; date >= habit.createdAt; date = Utils.addDays(date, -1)) {
      if (!isDueOn(habit, date)) continue;
      if (getLog(habitId, date)) count++;
      else if (date === td) continue;
      else break;
    }
    return count;
  }

  /** % de dias devidos cumpridos no mês (ym='YYYY-MM'); null se não há dias devidos */
  function monthlyRate(habitId, ym) {
    const habit = getById(habitId);
    if (!habit) return null;
    const td = Utils.today();
    let due = 0, met = 0;
    for (let d = ym + '-01'; d.startsWith(ym) && d <= td; d = Utils.addDays(d, 1)) {
      if (!isDueOn(habit, d)) continue;
      due++;
      if (getLog(habitId, d)) met++;
    }
    return due ? Math.round(met / due * 100) : null;
  }

  /** Maior sequência histórica de dias devidos cumpridos (hoje em aberto não quebra) */
  function longestStreak(habitId) {
    const habit = getById(habitId);
    if (!habit) return 0;
    const td = Utils.today();
    let best = 0, run = 0;
    for (const date of _dueDates(habit, td)) {
      if (getLog(habitId, date)) { run++; best = Math.max(best, run); }
      else if (date !== td) run = 0; // hoje sem marcar ainda não quebra
    }
    return best;
  }

  /** Total de escudos já consumidos (logs 'shielded' materializados) */
  function shieldsConsumed() {
    return _db().habitLogs.filter(l => l.status === 'shielded').length;
  }

  /** Datas com algum registro de hábito (qualquer status) — sinal de atividade
   *  para a sequência global do app. */
  function loggedDates() {
    return _db().habitLogs.map(l => l.date);
  }

  // ===== Modo dia difícil (estado por dia, sincronizado) =====

  function isHardDay(date) {
    return _db().hardModeDates.includes(date);
  }

  function toggleHardDay(date) {
    const db = _db();
    db.hardModeDates = db.hardModeDates.includes(date)
      ? db.hardModeDates.filter(d => d !== date)
      : [...db.hardModeDates, date];
    AppState.persist();
  }

  // ===== Teste manual =====

  /**
   * APENAS PARA TESTE MANUAL NO CONSOLE — não usar em produção.
   * Cria habitLogs retroativos para um hábito existente a partir de um padrão.
   * `pattern`: cada caractere é um dia, do mais antigo (esquerda) para hoje
   * (direita) — D=done, M=minimal, .=devido-não-cumprido, _=não-devido.
   * Recua o createdAt do hábito para o dia mais antigo e limpa logs anteriores.
   * Ex.: HabitService._seedTestData(id, "DDDDDDD.D")
   */
  function _seedTestData(habitId, pattern) {
    const habit = getById(habitId);
    if (!habit) return;
    const db = _db();
    const td = Utils.today();
    const n = pattern.length;
    habit.createdAt = Utils.addDays(td, -(n - 1));
    db.habitLogs = db.habitLogs.filter(l => l.habitId !== habitId);
    pattern.split('').forEach((ch, i) => {
      const date = Utils.addDays(td, -(n - 1 - i));
      if (ch === 'D') db.habitLogs.push({ habitId, date, status: 'done' });
      else if (ch === 'M') db.habitLogs.push({ habitId, date, status: 'minimal' });
      // '.' (devido-não-cumprido) e '_' (não-devido) não geram log
    });
    AppState.persist();
  }

  return {
    getAll, getById, create, update, archive,
    getLog, toggle, markFromTask, unmarkFromTask,
    isDueOn, streak, monthlyRate, longestStreak, shieldsConsumed, loggedDates, stats,
    isHardDay, toggleHardDay,
    _seedTestData
  };
})();
