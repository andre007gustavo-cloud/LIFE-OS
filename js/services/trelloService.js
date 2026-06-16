/**
 * ===================== TRELLO SERVICE =====================
 * Polling da lista "Andre" no Trello a cada 5 minutos.
 * Cards novos viram tarefas na área Trabalho, alocados nos
 * blocos de horário de trabalho definidos por dia da semana.
 *
 * Credenciais (apiKey + token) ficam no Firestore sob:
 *   db.integrations.trello = { apiKey, token, listId, lastSyncedCardIds: [] }
 *
 * Fluxo:
 *   1. TrelloService.init() → lê credenciais do Firestore
 *   2. Polling a cada POLL_INTERVAL ms
 *   3. Card novo → aloca no próximo slot de trabalho → TaskService.create()
 *   4. Persiste os IDs já processados para não duplicar
 *
 * Knows nothing about the DOM. Usa AppState.persist() como todos os services.
 */

const TrelloService = (() => {

  // ─── Constantes ───────────────────────────────────────────────────────────

  const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutos em ms
  const API_BASE      = 'https://api.trello.com/1';

  /**
   * Blocos de trabalho por dia da semana (0=Dom, 1=Seg … 6=Sab).
   * Altere aqui quando o horário mudar.
   */
  const WORK_BLOCKS = {
    1: { start: '08:00', end: '17:00' }, // Segunda
    2: { start: '08:00', end: '15:45' }, // Terça
    3: { start: '08:00', end: '17:00' }, // Quarta
    4: { start: '08:00', end: '17:00' }, // Quinta
    5: { start: '08:00', end: '17:00' }, // Sexta
  };

  // ─── Estado interno ───────────────────────────────────────────────────────

  let _pollTimer  = null;
  let _configured = false;
  let _errorNotified = false; // avisa o usuário no máximo uma vez por sessão

  // ─── Acesso ao DB ─────────────────────────────────────────────────────────

  function _integrations() {
    const db = AppState.getDB();
    if (!db.integrations)        db.integrations = {};
    if (!db.integrations.trello) db.integrations.trello = {
      apiKey: '', token: '', listId: '', lastSyncedCardIds: []
    };
    return db.integrations.trello;
  }

  function _creds() {
    const t = _integrations();
    return { apiKey: t.apiKey, token: t.token, listId: t.listId };
  }

  function _isConfigured() {
    const { apiKey, token, listId } = _creds();
    return !!(apiKey && token && listId);
  }

  // ─── Persistência de credenciais ──────────────────────────────────────────

  /**
   * Salva as credenciais no Firestore via AppState.persist().
   * Chame da tela de configurações:
   *   TrelloService.saveCredentials({ apiKey, token, listId })
   */
  function saveCredentials({ apiKey, token, listId }) {
    const t = _integrations();
    t.apiKey  = (apiKey  || '').trim();
    t.token   = (token   || '').trim();
    t.listId  = (listId  || '').trim();
    AppState.persist();
    _configured = _isConfigured();
    if (_configured) _startPolling();
    return _configured;
  }

  function getCredentials() {
    const { apiKey, token, listId } = _creds();
    return { apiKey, token, listId };
  }

  // ─── API do Trello ────────────────────────────────────────────────────────

  async function _fetch(path, params = {}) {
    const { apiKey, token } = _creds();
    const qs = new URLSearchParams({ key: apiKey, token, ...params });
    const res = await fetch(`${API_BASE}${path}?${qs}`);
    if (!res.ok) throw new Error(`Trello API ${res.status}: ${path}`);
    return res.json();
  }

  /**
   * Busca todas as listas do quadro e devolve o id da lista cujo nome
   * começa com "Andre" (case-insensitive). Útil para configuração automática.
   */
  async function findListId(boardId) {
    const lists = await _fetch(`/boards/${boardId}/lists`);
    const match = lists.find(l => l.name.toLowerCase().startsWith('andre'));
    return match ? match.id : null;
  }

  /** Retorna os cards abertos da lista configurada. */
  async function _fetchCards() {
    const { listId } = _creds();
    return _fetch(`/lists/${listId}/cards`, { fields: 'id,name,desc,due,url' });
  }

  // ─── Alocação de horário ──────────────────────────────────────────────────

  /**
   * Devolve a data ISO (YYYY-MM-DD) do próximo dia útil a partir de `fromDate`
   * (inclusive), que tenha bloco de trabalho definido.
   */
  function _nextWorkDay(fromDate) {
    let d = Utils.parseISO(fromDate);
    for (let i = 0; i < 14; i++) {
      if (WORK_BLOCKS[d.getDay()]) return Utils.toISO(d);
      d.setDate(d.getDate() + 1);
    }
    return fromDate; // fallback
  }

  /**
   * Dado um dia ISO e a lista de tarefas já existentes na área Trabalho,
   * devolve { date, start, end } para a nova tarefa.
   *
   * Estratégia simples: usa o bloco do dia. Se já houver tarefas com horário
   * nesse dia, coloca a nova na mesma faixa (o usuário rearranja se precisar).
   * O campo `start`/`end` vai preenchido para aparecer na view de calendário.
   */
  function _allocateSlot(targetDate) {
    const dow   = Utils.parseISO(targetDate).getDay();
    const block = WORK_BLOCKS[dow] || { start: '08:00', end: '17:00' };
    return { date: targetDate, start: block.start, end: block.end };
  }

  // ─── Conversão card → tarefa ──────────────────────────────────────────────

  /**
   * Encontra o ID da área Trabalho pelo nome (case-insensitive).
   * Cacheia em memória para não percorrer o array a cada card.
   */
  let _workAreaId = null;
  function _getWorkAreaId() {
    if (_workAreaId) return _workAreaId;
    const area = AreaService.getAll().find(
      a => a.name.toLowerCase().includes('trabalho')
    );
    _workAreaId = area ? area.id : null;
    return _workAreaId;
  }

  function _cardToTask(card) {
    const areaId     = _getWorkAreaId();
    const today      = Utils.today();
    const targetDate = card.due
      ? _nextWorkDay(card.due.slice(0, 10))  // respeita prazo do card se existir
      : _nextWorkDay(today);                  // senão, próximo dia útil

    const slot = _allocateSlot(targetDate);

    return {
      name:     card.name,
      notes:    [
        card.desc || '',
        card.url  ? `Trello: ${card.url}` : ''
      ].filter(Boolean).join('\n'),
      area:     areaId  || '',
      project:  '',
      priority: 'nenhuma',
      status:   'afazer',
      date:     slot.date,
      start:    slot.start,
      end:      slot.end,
      tags:     ['trello'],
      // Guarda o ID do card para rastreabilidade
      trelloCardId: card.id,
    };
  }

  // ─── Lógica de sync ───────────────────────────────────────────────────────

  /** Traduz o erro técnico do fetch numa mensagem acionável para o usuário. */
  function _humanError(err) {
    const m = (err && err.message) || '';
    if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(m)) {
      return 'Trello: não consegui acessar api.trello.com (rede ou firewall bloqueou). Tente em outra rede/dispositivo.';
    }
    if (/\b40[13]\b/.test(m)) {
      return 'Trello recusou a chave/token (autenticação). Reconfigure as credenciais.';
    }
    return 'Trello: falha ao sincronizar — ' + (m || 'erro desconhecido');
  }

  async function _sync() {
    if (!_isConfigured()) return;

    try {
      const cards      = await _fetchCards();
      _errorNotified   = false; // o sync voltou a funcionar
      const trello     = _integrations();
      const synced     = new Set(trello.lastSyncedCardIds || []);
      const newCards   = cards.filter(c => !synced.has(c.id));

      if (!newCards.length) return;

      // Invalida cache da área caso o usuário tenha criado/renomeado
      _workAreaId = null;

      newCards.forEach(card => {
        const taskData = _cardToTask(card);
        TaskService.create(taskData);
        synced.add(card.id);
      });

      trello.lastSyncedCardIds = [...synced];
      AppState.persist();

      console.info(`[TrelloService] ${newCards.length} card(s) importado(s).`);

      // Notifica a UI se disponível
      if (typeof Feedback !== 'undefined' && newCards.length) {
        const plural = newCards.length > 1 ? 'tarefas' : 'tarefa';
        Feedback.toast(
          `${newCards.length} ${plural} do Trello adicionada${newCards.length > 1 ? 's' : ''}`,
          'success'
        );
        if (typeof Navigation !== 'undefined') Navigation.renderAll();
      }

    } catch (err) {
      console.error('[TrelloService] Erro no sync:', err.message);
      // Antes esse erro era invisível: o polling falhava em silêncio e os cards
      // simplesmente não importavam. Avisa o usuário uma vez por sessão.
      if (!_errorNotified && typeof Feedback !== 'undefined') {
        Feedback.toast(_humanError(err), 'warn');
        _errorNotified = true;
      }
    }
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  function _startPolling() {
    _stopPolling();
    _sync(); // roda imediatamente ao iniciar
    _pollTimer = setInterval(_sync, POLL_INTERVAL);
    console.info('[TrelloService] Polling iniciado (a cada 5 min).');
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  // ─── Init (chamado em app.js após login) ──────────────────────────────────

  function init() {
    _workAreaId = null; // reseta cache de área ao reinicializar
    if (_isConfigured()) {
      _configured = true;
      _startPolling();
    }
  }

  /** Para o polling (ex.: ao fazer logout) */
  function stop() {
    _stopPolling();
    _configured = false;
  }

  /** Força um sync manual (ex.: botão "Sincronizar agora" nas configurações) */
  async function syncNow() {
    _errorNotified = false; // disparo manual sempre reporta o resultado
    if (!_isConfigured()) {
      if (typeof Feedback !== 'undefined') {
        Feedback.toast('Trello não está configurado neste dispositivo.', 'warn');
      }
      return;
    }
    return _sync();
  }

  /** Limpa o histórico de cards já importados (reimporta tudo na próxima rodada) */
  function resetSyncedCards() {
    _integrations().lastSyncedCardIds = [];
    AppState.persist();
  }

  // ─── Configuração do quadro (helper para a UI de settings) ───────────────

  /**
   * Dado um boardId, tenta encontrar automaticamente a lista "Andre".
   * Retorna { listId, listName } ou null se não encontrar.
   * Use na tela de configuração para poupar o usuário de copiar o ID manualmente.
   */
  async function autoConfigureFromBoard(boardId) {
    try {
      const listId = await findListId(boardId);
      if (!listId) return null;
      const lists = await _fetch(`/boards/${boardId}/lists`);
      const list  = lists.find(l => l.id === listId);
      return { listId, listName: list ? list.name : 'Andre' };
    } catch (err) {
      console.error('[TrelloService] autoConfigureFromBoard:', err.message);
      return null;
    }
  }

  return {
    init,
    stop,
    syncNow,
    saveCredentials,
    getCredentials,
    resetSyncedCards,
    autoConfigureFromBoard,
    WORK_BLOCKS, // exposto para a tela de config exibir/editar os horários
  };
})();
