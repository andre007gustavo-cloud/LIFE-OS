/**
 * ===================== FINANCE SERVICE =====================
 * Fase 1: lançamentos (entrada/saída/transferência), contas e categorias.
 * Dinheiro sempre em centavos inteiros (ver CLAUDE.md). Camada de serviço:
 * lê/escreve o estado central e persiste via AppState; ZERO DOM.
 */

const FinanceService = (() => {

  /**
   * Acesso ao DB garantindo que os arrays de finanças existem. Caches locais
   * anteriores à Fase 1 não têm essas chaves; sem isso, leituras quebrariam.
   */
  function db() {
    const d = AppState.getDB();
    if (!d.contas) d.contas = [];
    if (!d.categorias) d.categorias = [];
    if (!d.transacoes) d.transacoes = [];
    return d;
  }

  // ===== Seed do primeiro uso =====

  /** Cria categorias padrão + a conta "Carteira" se ainda não existirem. */
  function _seedDefaults() {
    const d = db();
    if (!d.contas) d.contas = [];
    if (!d.categorias) d.categorias = [];
    if (!d.transacoes) d.transacoes = [];
    let changed = false;

    if (d.categorias.length === 0) {
      d.categorias = Constants.FINANCE.SEED_CATEGORIAS.map(c => ({
        id: Utils.uid(), nome: c.nome, tipo: c.tipo, icone: c.icone, cor: c.cor,
        arquivada: false, criadoEm: Utils.today()
      }));
      changed = true;
    }
    if (d.contas.length === 0) {
      const s = Constants.FINANCE.SEED_CONTA;
      d.contas = [{
        id: Utils.uid(), nome: s.nome, tipo: s.tipo,
        saldoInicialCentavos: s.saldoInicialCentavos, cor: s.cor, icone: s.icone,
        arquivada: false, criadoEm: Utils.today()
      }];
      changed = true;
    }
    if (changed) AppState.persist();
  }

  // ===== Contas =====

  function listContas({ incluirArquivadas = false } = {}) {
    return db().contas.filter(c => incluirArquivadas || !c.arquivada);
  }

  function getContaById(id) {
    return db().contas.find(c => c.id === id);
  }

  function addConta({ nome, tipo = 'dinheiro', saldoInicialCentavos = 0, cor, icone = '💵' }) {
    const conta = {
      id: Utils.uid(), nome: (nome || '').trim(), tipo,
      saldoInicialCentavos: parseInt(saldoInicialCentavos, 10) || 0,
      cor: cor || Constants.COLORS[0], icone,
      arquivada: false, criadoEm: Utils.today()
    };
    db().contas.push(conta);
    AppState.persist();
    return conta;
  }

  function arquivarConta(id) {
    const c = getContaById(id);
    if (c) { c.arquivada = true; AppState.persist(); }
  }

  // ===== Categorias =====

  function listCategorias(tipo) {
    return db().categorias.filter(c => !c.arquivada && (!tipo || c.tipo === tipo));
  }

  function getCategoriaById(id) {
    return db().categorias.find(c => c.id === id);
  }

  function addCategoria({ nome, tipo = 'despesa', icone = '📦', cor }) {
    const cat = {
      id: Utils.uid(), nome: (nome || '').trim(), tipo, icone,
      cor: cor || Constants.COLORS[0], arquivada: false, criadoEm: Utils.today()
    };
    db().categorias.push(cat);
    AppState.persist();
    return cat;
  }

  // ===== Transações =====

  /** Normaliza campos vindos da UI/parser num registro consistente. */
  function _normalize(f) {
    const tipo = f.tipo || 'saida';
    const isTransf = tipo === 'transferencia';
    return {
      tipo,
      valorCentavos: Math.abs(parseInt(f.valorCentavos, 10) || 0),
      descricao: (f.descricao || '').trim(),
      categoriaId: isTransf ? '' : (f.categoriaId || ''),
      contaId: f.contaId || '',
      contaDestinoId: isTransf ? (f.contaDestinoId || '') : '',
      data: f.data || Utils.today(),
      fonte: f.fonte || 'manual'
    };
  }

  function getTransacaoById(id) {
    return db().transacoes.find(t => t.id === id);
  }

  function addTransaction(fields) {
    const now = new Date().toISOString();
    const t = _normalize(fields);
    t.id = Utils.uid();
    t.criadoEm = now;
    t.atualizadoEm = now;
    db().transacoes.push(t);
    AppState.persist();
    return t;
  }

  function updateTransaction(id, fields) {
    const t = getTransacaoById(id);
    if (!t) return null;
    Object.assign(t, _normalize({ ...t, ...fields }));
    t.atualizadoEm = new Date().toISOString();
    AppState.persist();
    return t;
  }

  function deleteTransaction(id) {
    db().transacoes = db().transacoes.filter(t => t.id !== id);
    AppState.persist();
  }

  /** Lista filtrada e ordenada por data desc (depois por criação desc). */
  function listTransactions({ mes, contaId, categoriaId } = {}) {
    return db().transacoes
      .filter(t => !mes || (t.data || '').startsWith(mes))
      .filter(t => !contaId || t.contaId === contaId || t.contaDestinoId === contaId)
      .filter(t => !categoriaId || t.categoriaId === categoriaId)
      .sort((a, b) =>
        (b.data || '').localeCompare(a.data || '') ||
        (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  }

  // ===== Saldos / resumo =====

  /**
   * Saldo em centavos. Sem contaId: total de todas as contas (transferências
   * se anulam entre contas, não mexem no total). Com contaId: só aquela conta.
   */
  function getSaldo(contaId) {
    const contas = contaId
      ? [getContaById(contaId)].filter(Boolean)
      : listContas({ incluirArquivadas: true });
    const ids = new Set(contas.map(c => c.id));
    let saldo = contas.reduce((s, c) => s + (c.saldoInicialCentavos || 0), 0);
    db().transacoes.forEach(t => {
      if (t.tipo === 'entrada' && ids.has(t.contaId)) saldo += t.valorCentavos;
      else if (t.tipo === 'saida' && ids.has(t.contaId)) saldo -= t.valorCentavos;
      else if (t.tipo === 'transferencia') {
        if (ids.has(t.contaId)) saldo -= t.valorCentavos;
        if (ids.has(t.contaDestinoId)) saldo += t.valorCentavos;
      }
    });
    return saldo;
  }

  /** { entradas, saidas, saldoMes } em centavos para o mês 'YYYY-MM'. */
  function getResumoMes(mes) {
    const ts = db().transacoes.filter(t => (t.data || '').startsWith(mes));
    const entradas = ts.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valorCentavos, 0);
    const saidas = ts.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valorCentavos, 0);
    return { entradas, saidas, saldoMes: entradas - saidas };
  }

  function currentMonthPrefix() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Datas com lançamento — sinal de atividade para a sequência global. */
  function entryDates() {
    return db().transacoes.filter(t => t.data).map(t => t.data);
  }

  // ===== Teste manual (apenas localhost) =====

  /** APENAS localhost — semeia lançamentos do mês atual para testar a view. */
  function _seedTestData() {
    if (window.location.hostname !== 'localhost') return;
    _seedDefaults();
    const conta = listContas()[0];
    const desp = listCategorias('despesa');
    const rec = listCategorias('receita');
    const mes = currentMonthPrefix();
    const dia = n => `${mes}-${String(n).padStart(2, '0')}`;

    addTransaction({ tipo: 'entrada', valorCentavos: 500000, descricao: 'Salário',
      categoriaId: rec[0] && rec[0].id, contaId: conta.id, data: dia(5), fonte: 'manual' });
    [['Almoço', 3200, 0], ['Mercado do mês', 18550, 1], ['Uber', 2400, 2],
     ['Farmácia', 6790, 4], ['Cinema', 4500, 5]
    ].forEach((a, i) => addTransaction({
      tipo: 'saida', valorCentavos: a[1], descricao: a[0],
      categoriaId: desp[a[2]] && desp[a[2]].id, contaId: conta.id,
      data: dia(6 + i), fonte: 'manual'
    }));
  }

  return {
    _seedDefaults, _seedTestData,
    listContas, getContaById, addConta, arquivarConta,
    listCategorias, getCategoriaById, addCategoria,
    addTransaction, updateTransaction, deleteTransaction,
    getTransacaoById, listTransactions,
    getSaldo, getResumoMes, currentMonthPrefix, entryDates
  };
})();
