/**
 * ===================== ACTIVITY SERVICE =====================
 * Sequência global do app ("streak"): dias ATIVOS consecutivos, onde um dia é
 * ativo se houve qualquer ação real do usuário — tarefa concluída, hábito
 * registrado, item capturado na caixa de entrada ou lançamento financeiro.
 *
 * Tudo é derivado dos services existentes; não há entidade de log de atividade.
 * Só dois estados pequenos são persistidos (sincronizam via Storage):
 *   activityShields: { available, history:[{ earnedAt, consumedAt|null }] }  (máx. 3)
 *   activityRecord:  { max, achievedAt }
 *
 * Escudos: a cada 7 dias ativos consecutivos ganha-se 1 (cap 3). Um dia inativo
 * isolado dentro da sequência consome 1 escudo (vira "shielded") e a sequência
 * segue; dois dias inativos seguidos quebram mesmo com escudo disponível.
 *
 * Knows nothing about the DOM: refresh() devolve o que aconteceu e a view decide
 * a comemoração — mantém a regra "services nunca tocam o DOM".
 */
const ActivityService = (() => {

  /** DBs antigos não têm os estados da sequência — inicializa sob demanda */
  function _shields() {
    const db = AppState.getDB();
    if (!db.activityShields) db.activityShields = { available: 0, history: [] };
    return db.activityShields;
  }

  function _record() {
    const db = AppState.getDB();
    if (!db.activityRecord) db.activityRecord = { max: 0, achievedAt: '' };
    return db.activityRecord;
  }

  // ===== Dias ativos (derivado dos services) =====

  /** Conjunto de datas 'YYYY-MM-DD' com qualquer ação real do usuário. */
  function _activeDates() {
    return new Set([
      ...TaskService.completedDates(),
      ...HabitService.loggedDates(),
      ...InboxService.capturedDates(),
      ...FinanceService.entryDates()
    ]);
  }

  function isActiveDay(date) {
    return _activeDates().has(date);
  }

  /** Datas inativas já cobertas por um escudo (consumedAt registrado). */
  function _shieldedDates() {
    return new Set(_shields().history.map(s => s.consumedAt).filter(Boolean));
  }

  // ===== Sequência (leitura pura) =====

  /**
   * Dias ativos consecutivos, de hoje para trás. Hoje conta como bônus só se já
   * houve ação (em aberto não quebra). Um dia inativo protegido por escudo conta
   * como coberto; o primeiro dia descoberto encerra a sequência. A reconciliação
   * de escudos fica em refresh() — aqui só se lê o estado já reconciliado.
   */
  function currentStreak() {
    const active = _activeDates();
    const shielded = _shieldedDates();
    const td = Utils.today();
    let n = active.has(td) ? 1 : 0;
    for (let date = Utils.addDays(td, -1); active.has(date) || shielded.has(date);
         date = Utils.addDays(date, -1)) {
      n++;
    }
    return n;
  }

  function shieldsAvailable() {
    return _shields().available;
  }

  function personalRecord() {
    return { ..._record() };
  }

  // ===== Reconciliação + recorde =====

  /**
   * Recalcula escudos de forma determinística (idempotente) e atualiza o recorde.
   * Devolve { streak, recordBeaten } para a view comemorar. Só persiste quando
   * algo muda — evita escritas (e sync) espúrias a cada render.
   */
  function refresh() {
    const before = JSON.stringify(_shields());
    _reconcileShields();
    let changed = JSON.stringify(_shields()) !== before;

    const streak = currentStreak();
    const record = _record();
    let recordBeaten = false;
    if (streak > record.max) {
      record.max = streak;
      record.achievedAt = Utils.today();
      recordBeaten = true;
      changed = true;
    }
    if (changed) AppState.persist();
    return { streak, recordBeaten };
  }

  /**
   * Reconstrói os escudos do zero, do primeiro dia ativo até ontem (hoje fica em
   * aberto). Ganha 1 escudo a cada 7 dias ativos consecutivos (cap 3); gasta 1
   * num dia inativo isolado, marcando-o 'shielded'; dois inativos seguidos não
   * viram ponte (a sequência quebra ali). Recomputar do zero garante idempotência.
   */
  function _reconcileShields() {
    const active = _activeDates();
    if (!active.size) { _setShields(0, []); return; }
    const start = [...active].sort()[0];
    const end = Utils.addDays(Utils.today(), -1);

    let available = 0, earnRun = 0, prevBlocked = false;
    const history = [];
    for (let date = start; date <= end; date = Utils.addDays(date, 1)) {
      if (active.has(date)) {
        earnRun++;
        if (earnRun % Constants.ACTIVITY.SHIELD_EVERY === 0
            && available < Constants.ACTIVITY.SHIELD_MAX) {
          history.push({ earnedAt: date, consumedAt: null });
          available++;
        }
        prevBlocked = false;
      } else if (!prevBlocked && available > 0) {
        history.find(s => !s.consumedAt).consumedAt = date;
        available--;
        earnRun = 0;
        prevBlocked = true; // dia coberto por escudo: o inativo seguinte quebra
      } else {
        earnRun = 0;
        prevBlocked = true;
      }
    }
    _setShields(available, history);
  }

  function _setShields(available, history) {
    const s = _shields();
    s.available = available;
    s.history = history;
  }

  // ===== Teste manual (apenas localhost) =====

  /**
   * APENAS localhost — semeia atividade simulada para testar a sequência.
   * `pattern`: do dia mais antigo (esquerda) a hoje (direita); A = dia ativo,
   * . = dia inativo. Marca habitLogs num hábito "Atividade Teste" (criando-o se
   * preciso) e zera escudos/recorde para um teste determinístico.
   * Ex.: ActivityService._seedTestActivity("AAAAAAAA.AAAA") → streak 13.
   */
  function _seedTestActivity(pattern) {
    if (window.location.hostname !== 'localhost') return;
    let habit = HabitService.getAll().find(h => h.name === 'Atividade Teste');
    if (!habit) {
      habit = HabitService.create({ name: 'Atividade Teste', icon: '🧪', frequency: { type: 'daily' } });
    }
    HabitService._seedTestData(habit.id, pattern.replace(/A/g, 'D'));
    _setShields(0, []);
    Object.assign(_record(), { max: 0, achievedAt: '' });
    refresh();
  }

  return {
    isActiveDay, currentStreak, shieldsAvailable, personalRecord, refresh,
    _seedTestActivity
  };
})();
