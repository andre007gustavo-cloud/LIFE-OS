/**
 * ===================== AI TOOLS =====================
 * Catálogo de ferramentas (tools) que o modelo pode chamar, no formato da API
 * Anthropic (name / description / input_schema), cada uma mapeada aos services
 * existentes. Separa LEITURA (write:false — executa direto) de ESCRITA
 * (write:true — exige confirmação na UI antes de rodar).
 *
 * Este arquivo é o núcleo (registro, resolução por nome, validação e helpers);
 * as ferramentas de cada domínio se registram em aiToolsPlanner.js e
 * aiToolsFinance.js. O mesmo catálogo serve o assistente do app e o conector
 * MCP (api/_mcp/appRuntime.js roda estes arquivos no servidor).
 *
 * Convenções:
 *  - Dinheiro chega em REAIS (mais natural pro modelo); o executor converte
 *    para centavos inteiros (toCentavos).
 *  - categoria/conta/area/projeto/cartão podem vir como NOME ou id: resolvemos
 *    por match case-insensitive. Não encontrou → devolve { erro } pro modelo se
 *    corrigir, nunca lança exceção.
 *  - Todo executor devolve um objeto JSON serializável (resultado ou erro).
 *  - Executores são síncronos (aiChatView chama run() sem await).
 *
 * Knows nothing about the DOM.
 */

const AiTools = (() => {

  const TOOLS = {};

  const brl = c => Utils.formatBRL(c);
  const norm = s => Utils.normalizeText(s);
  const toCentavos = reais => Math.round((Number(reais) || 0) * 100);

  // ===== Resolução por nome/id =====

  /** Acha numa lista por id exato ou por nome normalizado. null se não achar. */
  function match(lista, valor, nomeKey = 'nome') {
    if (!valor) return null;
    const alvo = String(valor);
    return lista.find(x => x.id === alvo)
      || lista.find(x => norm(x[nomeKey]) === norm(alvo))
      || lista.find(x => norm(x[nomeKey]).includes(norm(alvo)))
      || null;
  }

  function _naoEncontrado(rotulo, valor, lista, nomeKey = 'nome') {
    return { erro: `${rotulo} "${valor}" não encontrado(a). Disponíveis: ${lista.map(x => x[nomeKey]).join(', ') || 'nenhum(a)'}` };
  }

  function resolveCategoria(valor, tipo) {
    const lista = FinanceService.listCategorias(tipo);
    const cat = match(lista, valor);
    return cat ? { cat } : _naoEncontrado('Categoria', valor, lista);
  }

  /** Sem valor: primeira conta que não é meta. incluirMetas para transferências. */
  function resolveConta(valor, { incluirMetas = false } = {}) {
    const lista = FinanceService.listContas().filter(c => incluirMetas || c.tipo !== 'meta');
    if (!valor) return lista[0] ? { conta: lista[0] } : { erro: 'Nenhuma conta cadastrada.' };
    const conta = match(lista, valor);
    return conta ? { conta } : _naoEncontrado('Conta', valor, lista);
  }

  function resolveCartao(valor) {
    const lista = CartaoService.listCartoes();
    const cartao = match(lista, valor);
    return cartao ? { cartao } : _naoEncontrado('Cartão', valor, lista);
  }

  function resolveArea(valor) {
    const area = match(AreaService.getAll(), valor, 'name');
    return area ? { area } : _naoEncontrado('Área', valor, AreaService.getAll(), 'name');
  }

  function resolveProjeto(valor) {
    const proj = match(ProjectService.getAll(), valor, 'name');
    return proj ? { proj } : _naoEncontrado('Projeto', valor, ProjectService.getAll(), 'name');
  }

  function resolveHabito(valor) {
    const habit = match(HabitService.getAll(), valor, 'name');
    return habit ? { habit } : _naoEncontrado('Hábito', valor, HabitService.getAll(), 'name');
  }

  // ===== Helpers de exibição =====

  function nomeArea(id) { const a = AreaService.getById(id); return a ? a.name : ''; }
  function nomeProjeto(id) { const p = ProjectService.getById(id); return p ? p.name : ''; }
  function nomeCategoria(id) { const c = FinanceService.getCategoriaById(id); return c ? c.nome : ''; }
  function nomeConta(id) { const c = FinanceService.getContaById(id); return c ? c.nome : ''; }
  function nomeCartao(id) { const c = CartaoService.getCartaoById(id); return c ? c.nome : ''; }

  function tarefaResumo(t) {
    return {
      id: t.id,
      nome: t.name,
      data: t.date || null,
      horario: t.start ? (t.start + (t.end ? '–' + t.end : '')) : null,
      prioridade: t.priority,
      status: t.status,
      projeto: nomeProjeto(t.project) || null
    };
  }

  /** Tarefas de uma janela [de, ate], em aberto, sem duplicar (multi-dia). */
  function tarefasNoIntervalo(de, ate, comHorario = false) {
    const vistas = new Set();
    const out = [];
    for (let d = de; d <= ate; d = Utils.addDays(d, 1)) {
      TaskService.forDay(d).forEach(t => {
        if (vistas.has(t.id) || !Utils.isTaskOpen(t)) return;
        if (comHorario && !t.start) return;
        vistas.add(t.id);
        out.push(t);
      });
    }
    return out;
  }

  // ===== Validação comum (antes de qualquer executor) =====
  // Os services confiam no que recebem (quem valida é a tela). Aqui barramos o
  // que o modelo pode errar: reais não numéricos e datas/horas fora do formato.

  const _CAMPOS_DATA = ['data', 'de', 'ate', 'dataFim', 'dataInicio', 'dataObjetivo', 'prazo'];
  const _CAMPOS_HORA = ['inicio', 'fim'];
  const _CAMPOS_MES = ['mes', 'competencia'];

  function _erroDeCampo(chave, valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (/Reais$/.test(chave) && !Number.isFinite(Number(valor))) return `${chave} deve ser um número em reais (ex.: 85.5).`;
    if (_CAMPOS_DATA.includes(chave) && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${chave} deve estar no formato YYYY-MM-DD.`;
    if (_CAMPOS_HORA.includes(chave) && !/^\d{2}:\d{2}$/.test(valor)) return `${chave} deve estar no formato HH:MM.`;
    if (_CAMPOS_MES.includes(chave) && !/^\d{4}-\d{2}$/.test(valor)) return `${chave} deve estar no formato YYYY-MM.`;
    return null;
  }

  /** Primeira violação encontrada (também dentro de 'patch' e de listas), ou null. */
  function _validarInput(input) {
    for (const [chave, valor] of Object.entries(input || {})) {
      if (valor && typeof valor === 'object') {
        const filhos = Array.isArray(valor) ? valor.filter(v => v && typeof v === 'object') : [valor];
        const interno = filhos.map(_validarInput).find(Boolean);
        if (interno) return interno;
        continue;
      }
      const erro = _erroDeCampo(chave, valor);
      if (erro) return erro;
    }
    return null;
  }

  // ===== Ferramenta do núcleo =====

  register({
    get_overview: {
      write: false,
      schema: {
        name: 'get_overview',
        description: 'Resumo geral do dia: tarefas de hoje, saldo atual, resumo do mês, saldo projetado para o fim do mês, alertas financeiros, inbox e nº de projetos ativos.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const hoje = Utils.today();
        const resumo = FinanceService.getResumoMes(FinanceService.currentMonthPrefix());
        const tarefas = TaskService.forDay(hoje).filter(Utils.isTaskOpen);
        return {
          data: hoje,
          qtdTarefasHoje: tarefas.length,
          tarefasHoje: tarefas.map(tarefaResumo),
          saldoAtual: brl(FinanceService.getSaldo()),
          mes: { entradas: brl(resumo.entradas), saidas: brl(resumo.saidas), saldo: brl(resumo.saldoMes) },
          saldoProjetadoFimMes: brl(FinanceService.getSaldoProjetadoFimMes()),
          alertas: FinanceService.getAlertas().map(a => a.titulo),
          itensNaInbox: InboxService.count(),
          projetosAtivos: ProjectService.getAll().filter(p => p.status === 'ativo').length
        };
      }
    }
  });

  // ===== API pública =====

  /** Acrescenta ferramentas ao catálogo (chamado pelos arquivos de domínio). */
  function register(tools) { Object.assign(TOOLS, tools); }

  function schemas() { return Object.values(TOOLS).map(t => t.schema); }
  function isWrite(name) { return !!(TOOLS[name] && TOOLS[name].write); }

  /** Executa a tool. Erros viram { erro } estruturado (nunca quebram o loop). */
  function run(name, input) {
    const tool = TOOLS[name];
    if (!tool) return { erro: `Ferramenta "${name}" não existe.` };
    const invalido = _validarInput(input);
    if (invalido) return { erro: invalido };
    try {
      return tool.run(input || {});
    } catch (err) {
      return { erro: 'Falha ao executar: ' + String(err && err.message || err) };
    }
  }

  /** Helpers compartilhados com os arquivos de domínio. */
  const helpers = {
    brl, norm, toCentavos, match,
    resolveCategoria, resolveConta, resolveCartao, resolveArea, resolveProjeto, resolveHabito,
    nomeArea, nomeProjeto, nomeCategoria, nomeConta, nomeCartao,
    tarefaResumo, tarefasNoIntervalo
  };

  return { register, schemas, isWrite, run, helpers };
})();
