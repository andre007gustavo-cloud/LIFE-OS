/**
 * ===================== AI SERVICE =====================
 * Orquestrador do assistente: monta o contexto (system prompt dinâmico com o
 * "mapa" do app), mantém o histórico no formato Anthropic, roda o loop de tool
 * calling, gerencia a confirmação das ações de escrita e persiste a conversa.
 *
 * A UI (aiChatView) registra um callback via onUpdate() e reage às mudanças;
 * para confirmar/cancelar uma ação chama confirm(true|false). Knows nothing
 * about the DOM.
 */

const AiService = (() => {

  const MODEL = 'claude-sonnet-4-6';
  const MAX_TOKENS = 2048;
  const HISTORY_LIMIT = 40;   // mantém só as últimas N mensagens persistidas
  const LOOP_GUARD = 12;      // teto de iterações do loop de tool calling

  // O transcript é dado LOCAL do dispositivo (como as preferências do feedback.js):
  // guardamos em localStorage próprio, fora do DB sincronizado. Assim o chat não
  // entra no documento do Firestore (evita inchar e provocar falha de sync) nem
  // dispara uma gravação na nuvem a cada mensagem. Exceção registrada no CLAUDE.md.
  const STORE_KEY = 'lifeos_ai_chat';

  let messages = [];          // histórico no formato Anthropic { role, content }
  let _thinking = false;      // esperando a API
  let _pending = null;        // { block, resolve } da confirmação em curso
  let _didWrite = false;      // alguma escrita executou nesta volta (re-render)
  const _listeners = [];

  // ===== Notificação para a UI =====

  function onUpdate(cb) { if (typeof cb === 'function') _listeners.push(cb); }
  function _emit() { _listeners.forEach(cb => { try { cb(); } catch { /* UI */ } }); }

  // ===== System prompt dinâmico =====

  function _areaNome(id) { const a = AreaService.getById(id); return a ? a.name : '—'; }

  function buildSystemPrompt() {
    const hoje = Utils.today();
    const mes = FinanceService.currentMonthPrefix();

    const areas = AreaService.getAll().map(a => `${a.id}: ${a.name}`).join(' | ') || 'nenhuma';
    const projetos = ProjectService.getAll().filter(p => p.status === 'ativo')
      .map(p => `${p.id}: ${p.name} (${_areaNome(p.area)})`).join(' | ') || 'nenhum';
    const contas = FinanceService.listContas().map(c => `${c.id}: ${c.nome}`).join(' | ') || 'nenhuma';
    const catDesp = FinanceService.listCategorias('despesa').map(c => `${c.id}: ${c.nome}`).join(' | ') || 'nenhuma';
    const catRec = FinanceService.listCategorias('receita').map(c => `${c.id}: ${c.nome}`).join(' | ') || 'nenhuma';

    const tarefasHoje = TaskService.forDay(hoje).filter(Utils.isTaskOpen).length;
    const saldo = Utils.formatBRL(FinanceService.getSaldo());
    const alertas = FinanceService.getAlertas().map(a => a.titulo).join('; ') || 'nenhum';
    const blocos = JSON.stringify(TrelloService.WORK_BLOCKS);

    return `Você é o assistente pessoal do Life OS do André. Hoje é ${hoje}.
Responda em português brasileiro, de forma direta e objetiva.

MAPA DO APP:
- Áreas: ${areas}
- Projetos ativos: ${projetos}
- Contas: ${contas}
- Categorias de despesa: ${catDesp}
- Categorias de receita: ${catRec}
- Blocos de trabalho do André (0=Dom … 6=Sáb): ${blocos}

RESUMO DE HOJE:
- Tarefas de hoje: ${tarefasHoje}
- Saldo atual: ${saldo}
- Alertas: ${alertas}

REGRAS:
- Dinheiro é informado em reais; o sistema converte para centavos.
- Use as ferramentas de leitura antes de afirmar números ou listas — nunca invente.
- Ações que modificam dados (criar, editar, lançar, excluir) serão CONFIRMADAS pelo usuário antes de executar. Proponha a ação chamando a ferramenta normalmente.
- Você pode passar nomes (de área, projeto, conta, categoria) que o sistema resolve para os ids.
- Seja conciso. Não repita o que o usuário já sabe.`;
  }

  // ===== Chamada à API (via proxy /api/chat) =====

  async function callApi() {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        tools: AiTools.schemas(),
        messages
      })
    });
    return res.json();
  }

  // ===== Confirmação de escrita =====

  /** Devolve uma Promise que a UI resolve via confirm(true|false). */
  function _aguardarConfirmacao(block) {
    return new Promise(resolve => {
      _pending = { block, resolve };
      _emit();
    });
  }

  function confirm(ok) {
    if (!_pending) return;
    const p = _pending;
    _pending = null;
    _emit();
    p.resolve(!!ok);
  }

  function getPending() { return _pending ? _pending.block : null; }

  /** Resumo amigável de uma ação pendente, para a UI montar o card. Função pura. */
  const ACTION_TITLES = {
    create_task: 'Criar tarefa', plan_day: 'Planejar o dia', create_project: 'Criar projeto',
    create_note: 'Criar nota', add_transaction: 'Lançar no financeiro', capture_inbox: 'Capturar na inbox',
    update_task: 'Editar tarefa', delete_task: 'Excluir tarefa',
    update_transaction: 'Editar lançamento', delete_transaction: 'Excluir lançamento'
  };

  function actionPreview(block) {
    const input = block.input || {};
    const detalhes = [];
    Object.keys(input).forEach(k => {
      let v = input[k];
      if (v == null || v === '') return;
      if (k === 'valorReais') v = Utils.formatBRL(Math.round((Number(v) || 0) * 100));
      else if (typeof v === 'object') v = JSON.stringify(v);
      detalhes.push({ rotulo: k, valor: String(v) });
    });
    return { titulo: ACTION_TITLES[block.name] || block.name, detalhes };
  }

  // ===== Loop de tool calling =====

  async function _loop() {
    let guard = 0;
    while (guard++ < LOOP_GUARD) {
      _thinking = true; _emit();
      const resp = await callApi();
      _thinking = false;

      if (!resp || resp.error || !resp.content) {
        const msg = resp && resp.error
          ? (resp.error.message || JSON.stringify(resp.error))
          : 'Resposta inválida do servidor.';
        messages.push({ role: 'assistant', content: [{ type: 'text', text: '⚠️ ' + msg }] });
        _emit();
        return;
      }

      messages.push({ role: 'assistant', content: resp.content });
      _emit();

      if (resp.stop_reason !== 'tool_use') return; // resposta final em texto

      const toolResults = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        let result;
        if (AiTools.isWrite(block.name)) {
          const ok = await _aguardarConfirmacao(block);
          if (ok) { result = AiTools.run(block.name, block.input); _didWrite = true; }
          else { result = { cancelado: true, motivo: 'Usuário cancelou' }; }
        } else {
          result = AiTools.run(block.name, block.input);
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
      _emit();
    }
  }

  // ===== API pública =====

  async function send(text) {
    const txt = String(text || '').trim();
    if (!txt || _thinking) return;
    messages.push({ role: 'user', content: txt });
    _didWrite = false;
    _emit();
    try {
      await _loop();
    } catch (err) {
      messages.push({ role: 'assistant', content: [{ type: 'text', text: '⚠️ Erro de conexão: ' + String(err && err.message || err) }] });
    } finally {
      _thinking = false;
      _trim();
      _persist();
      _emit();
      // Ações de escrita confirmadas já persistiram via os services; atualiza as views
      if (_didWrite && typeof Navigation !== 'undefined') Navigation.renderAll();
    }
  }

  function _trim() {
    if (messages.length > HISTORY_LIMIT) messages = messages.slice(-HISTORY_LIMIT);
  }

  function _persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT)));
    } catch { /* cota cheia / modo privado: o chat em memória segue funcionando */ }
  }

  function init() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      messages = Array.isArray(parsed) ? parsed : [];
    } catch { messages = []; }
  }

  function getMessages() { return messages; }
  function isThinking() { return _thinking; }

  function clear() {
    messages = [];
    _pending = null;
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignora */ }
    _emit();
  }

  return {
    init, send, getMessages, clear,
    onUpdate, confirm, getPending, actionPreview, isThinking
  };
})();
