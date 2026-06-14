/**
 * ===================== CARTAO SERVICE (Fase 4) =====================
 * Cartões de crédito, faturas virtuais (computadas, não armazenadas) e
 * parcelamentos. Conceito central: competência vs. caixa.
 *
 * COMPETÊNCIA: compra no cartão → gasto na data da compra (orçamento/resumo).
 * CAIXA: pagar a fatura → saída real na conta de pagamento (saldo).
 *
 * Camada de serviço: ZERO DOM. Persiste via AppState.persist().
 */

const CartaoService = (() => {

  function db() {
    const d = AppState.getDB();
    if (!d.cartoes) d.cartoes = [];
    if (!d.faturaPagamentos) d.faturaPagamentos = [];
    return d;
  }

  // ===== Helpers de mês/data =====

  function _addMonths(prefix, delta) {
    let [y, m] = prefix.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  function _lastDay(ano, mes) {
    return new Date(ano, mes, 0).getDate();
  }

  /** Dia clamped ao último dia real do mês, em ISO local. */
  function _dateISO(ano, mes, dia) {
    const d = Math.min(dia, _lastDay(ano, mes));
    return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // ===== Cartões =====

  function listCartoes({ incluirArquivados = false } = {}) {
    return db().cartoes.filter(c => incluirArquivados || !c.arquivado);
  }

  function getCartaoById(id) {
    return db().cartoes.find(c => c.id === id) || null;
  }

  function addCartao({ nome, cor, limiteCentavos, diaFechamento, diaVencimento, contaPagamentoId = '' }) {
    const c = {
      id: Utils.uid(),
      nome: (nome || '').trim(),
      cor: cor || '#7c6fff',
      limiteCentavos: Math.abs(parseInt(limiteCentavos, 10) || 0),
      diaFechamento: Math.min(31, Math.max(1, parseInt(diaFechamento, 10) || 1)),
      diaVencimento: Math.min(31, Math.max(1, parseInt(diaVencimento, 10) || 1)),
      contaPagamentoId: contaPagamentoId || '',
      arquivado: false,
      criadoEm: Utils.today()
    };
    db().cartoes.push(c);
    AppState.persist();
    return c;
  }

  function updateCartao(id, patch) {
    const c = getCartaoById(id);
    if (!c) return null;
    if (patch.nome !== undefined) c.nome = (patch.nome || '').trim();
    if (patch.cor !== undefined) c.cor = patch.cor;
    if (patch.limiteCentavos !== undefined) c.limiteCentavos = Math.abs(parseInt(patch.limiteCentavos, 10) || 0);
    if (patch.diaFechamento !== undefined) c.diaFechamento = Math.min(31, Math.max(1, parseInt(patch.diaFechamento, 10) || 1));
    if (patch.diaVencimento !== undefined) c.diaVencimento = Math.min(31, Math.max(1, parseInt(patch.diaVencimento, 10) || 1));
    if (patch.contaPagamentoId !== undefined) c.contaPagamentoId = patch.contaPagamentoId || '';
    AppState.persist();
    return c;
  }

  function arquivarCartao(id) {
    const c = getCartaoById(id);
    if (c) { c.arquivado = true; AppState.persist(); }
  }

  function removeCartao(id) {
    db().cartoes = db().cartoes.filter(c => c.id !== id);
    AppState.persist();
  }

  // ===== Competência da compra =====

  /**
   * Retorna 'YYYY-MM' da competência em que a compra cai.
   *   dia < diaFechamento  → competência do mês da compra.
   *   dia >= diaFechamento → competência do mês seguinte.
   */
  function competenciaDaCompra(cartao, dataCompra) {
    const d = Utils.parseISO(dataCompra);
    const dia = d.getDate();
    let ano = d.getFullYear(), mes = d.getMonth() + 1;
    if (dia >= cartao.diaFechamento) {
      mes++;
      if (mes > 12) { mes = 1; ano++; }
    }
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }

  // ===== Compra no cartão =====

  /**
   * Cria UMA transação com os metadados completos de parcelamento.
   * valorCentavos = valor TOTAL da compra (não a parcela).
   * A fatura expande virtualmente parcela a parcela em getFatura().
   */
  function addCompraCartao({ cartaoId, descricao, categoriaId, valorTotalCentavos, parcelas = 1, dataCompra }) {
    const now = new Date().toISOString();
    const t = {
      id: Utils.uid(),
      tipo: 'saida',
      valorCentavos: Math.abs(parseInt(valorTotalCentavos, 10) || 0),
      descricao: (descricao || '').trim(),
      categoriaId: categoriaId || '',
      cartaoId,
      contaId: '',
      parcelas: Math.max(1, parseInt(parcelas, 10) || 1),
      data: dataCompra || Utils.today(),
      fonte: 'manual',
      criadoEm: now,
      atualizadoEm: now
    };
    AppState.getDB().transacoes.push(t);
    AppState.persist();
    return t;
  }

  // ===== Fatura (calculada, não armazenada) =====

  /**
   * Computa a fatura de uma competência 'YYYY-MM'.
   * Expande virtualmente cada transação parcelada para encontrar a parcela
   * que cai nesta competência. A última parcela absorve o arredondamento.
   */
  function getFatura(cartaoId, competencia) {
    const cartao = getCartaoById(cartaoId);
    if (!cartao) return null;

    const [cAno, cMes] = competencia.split('-').map(Number);
    const dataFechamento = _dateISO(cAno, cMes, cartao.diaFechamento);

    // Vencimento: se diaVencimento < diaFechamento → mês seguinte da competência
    let vAno = cAno, vMes = cMes;
    if (cartao.diaVencimento < cartao.diaFechamento) {
      vMes++; if (vMes > 12) { vMes = 1; vAno++; }
    }
    const dataVencimento = _dateISO(vAno, vMes, cartao.diaVencimento);

    const itens = [];
    const transacoes = AppState.getDB().transacoes || [];

    transacoes.forEach(t => {
      if (t.cartaoId !== cartaoId) return;
      const totalParcelas = t.parcelas || 1;
      const compBase = competenciaDaCompra(cartao, t.data);
      const baseVal = Math.floor(t.valorCentavos / totalParcelas);

      for (let k = 1; k <= totalParcelas; k++) {
        if (_addMonths(compBase, k - 1) !== competencia) continue;
        // Última parcela absorve o arredondamento
        const valorParcela = k === totalParcelas
          ? t.valorCentavos - baseVal * (totalParcelas - 1)
          : baseVal;
        itens.push({
          transacaoId: t.id,
          descricao: t.descricao,
          categoriaId: t.categoriaId,
          parcelaNum: k,
          parcelaTotal: totalParcelas,
          valorParcelaCentavos: valorParcela
        });
      }
    });

    const totalCentavos = itens.reduce((s, i) => s + i.valorParcelaCentavos, 0);
    const pagamento = db().faturaPagamentos.find(
      p => p.cartaoId === cartaoId && p.competencia === competencia
    ) || null;

    return { competencia, dataFechamento, dataVencimento, itens, totalCentavos, paga: !!pagamento, pagamento };
  }

  /**
   * "Fatura atual" = a competência em que cairiam compras feitas hoje.
   * É a fatura que o usuário está acumulando agora.
   */
  function getFaturaAtual(cartaoId) {
    const cartao = getCartaoById(cartaoId);
    if (!cartao) return null;
    return getFatura(cartaoId, competenciaDaCompra(cartao, Utils.today()));
  }

  /**
   * Lista faturas com itens ou com pagamento registrado, dentro do intervalo.
   * Retorna objetos getFatura() ordenados por competência.
   */
  function listFaturas(cartaoId, { de, ate } = {}) {
    const cartao = getCartaoById(cartaoId);
    if (!cartao) return [];
    const competencias = new Set();
    (AppState.getDB().transacoes || []).forEach(t => {
      if (t.cartaoId !== cartaoId) return;
      const compBase = competenciaDaCompra(cartao, t.data);
      for (let k = 0; k < (t.parcelas || 1); k++) competencias.add(_addMonths(compBase, k));
    });
    db().faturaPagamentos.forEach(p => { if (p.cartaoId === cartaoId) competencias.add(p.competencia); });
    return [...competencias]
      .filter(c => (!de || c >= de) && (!ate || c <= ate))
      .sort()
      .map(c => getFatura(cartaoId, c));
  }

  // ===== Parcelas comprometidas (futuras, abertas) =====

  /**
   * Total em centavos e número de compras com parcelas em competências
   * FUTURAS (depois do mês atual) ainda não pagas. Usado no card do cartão.
   */
  function getParcelasComprometidas(cartaoId) {
    const cartao = getCartaoById(cartaoId);
    if (!cartao) return { totalCentavos: 0, numCompras: 0 };
    const mesAtual = FinanceService.currentMonthPrefix();
    const transacoes = AppState.getDB().transacoes || [];
    let total = 0;
    const compras = new Set();

    transacoes.forEach(t => {
      if (t.cartaoId !== cartaoId) return;
      const totalParcelas = t.parcelas || 1;
      const compBase = competenciaDaCompra(cartao, t.data);
      const baseVal = Math.floor(t.valorCentavos / totalParcelas);
      for (let k = 1; k <= totalParcelas; k++) {
        const comp = _addMonths(compBase, k - 1);
        if (comp <= mesAtual) continue;
        if (db().faturaPagamentos.some(p => p.cartaoId === cartaoId && p.competencia === comp)) continue;
        total += k === totalParcelas ? t.valorCentavos - baseVal * (totalParcelas - 1) : baseVal;
        compras.add(t.id);
      }
    });

    return { totalCentavos: total, numCompras: compras.size };
  }

  // ===== Limite disponível =====

  /**
   * limiteCentavos − soma de TODAS as parcelas em faturas ainda não pagas
   * (abertas do passado, atual e futuras comprometidas).
   */
  function getLimiteDisponivel(cartaoId) {
    const cartao = getCartaoById(cartaoId);
    if (!cartao) return 0;
    const transacoes = AppState.getDB().transacoes || [];
    let usado = 0;

    transacoes.forEach(t => {
      if (t.cartaoId !== cartaoId) return;
      const totalParcelas = t.parcelas || 1;
      const compBase = competenciaDaCompra(cartao, t.data);
      const baseVal = Math.floor(t.valorCentavos / totalParcelas);
      for (let k = 1; k <= totalParcelas; k++) {
        const comp = _addMonths(compBase, k - 1);
        if (db().faturaPagamentos.some(p => p.cartaoId === cartaoId && p.competencia === comp)) continue;
        usado += k === totalParcelas ? t.valorCentavos - baseVal * (totalParcelas - 1) : baseVal;
      }
    });

    return cartao.limiteCentavos - usado;
  }

  // ===== Pagar fatura =====

  /**
   * Registra o pagamento: cria a transação de saída na conta (pagamentoFatura: true)
   * e o registro FaturaPagamento. Não conta no orçamento (sem categoriaId).
   */
  function pagarFatura({ cartaoId, competencia, contaId, valorCentavos, data }) {
    const now = new Date().toISOString();
    const cartao = getCartaoById(cartaoId);
    const t = {
      id: Utils.uid(),
      tipo: 'saida',
      valorCentavos: Math.abs(parseInt(valorCentavos, 10) || 0),
      descricao: `Fatura ${cartao ? cartao.nome : 'cartão'} ${competencia}`,
      categoriaId: '',
      contaId,
      cartaoId: '',
      pagamentoFatura: true,
      data: data || Utils.today(),
      fonte: 'manual',
      criadoEm: now,
      atualizadoEm: now
    };
    AppState.getDB().transacoes.push(t);

    const p = {
      id: Utils.uid(), cartaoId, competencia, contaId,
      valorCentavos: t.valorCentavos, pagoEm: t.data, transacaoId: t.id
    };
    db().faturaPagamentos.push(p);
    AppState.persist();
    return p;
  }

  /**
   * Desfaz o pagamento de uma fatura: remove a transação de caixa e o registro
   * FaturaPagamento, restaurando o status da fatura para "em aberto".
   */
  function desfazerPagamento(cartaoId, competencia) {
    const idx = db().faturaPagamentos.findIndex(
      p => p.cartaoId === cartaoId && p.competencia === competencia
    );
    if (idx < 0) return false;
    const p = db().faturaPagamentos[idx];
    const d = AppState.getDB();
    d.transacoes = d.transacoes.filter(t => t.id !== p.transacaoId);
    db().faturaPagamentos.splice(idx, 1);
    AppState.persist();
    return true;
  }

  // ===== Seed de teste (chamado de financeService._seedTestData) =====

  function _seedCartoes() {
    if (window.location.hostname !== 'localhost') return;
    if (db().cartoes.length) return;

    const contas = FinanceService.listContas();
    const conta = contas[0];
    if (!conta) return;

    const desp = FinanceService.listCategorias('despesa');
    const catAlim = desp.find(c => c.nome === 'Alimentação') || desp[0];
    const catDiv  = desp.find(c => c.nome === 'Diversão')    || desp[1];
    const catMerc = desp.find(c => c.nome === 'Mercado/casa')|| desp[1];

    const cartao = addCartao({
      nome: 'Nubank', cor: '#7c6fff',
      limiteCentavos: 500000,  // R$ 5.000
      diaFechamento: 28, diaVencimento: 5,
      contaPagamentoId: conta.id
    });

    // Fatura passada (2026-05): compra à vista + pagamento registrado
    addCompraCartao({
      cartaoId: cartao.id, descricao: 'Jantar especial',
      categoriaId: catAlim && catAlim.id,
      valorTotalCentavos: 9500, parcelas: 1, dataCompra: '2026-05-20'
    });
    pagarFatura({
      cartaoId: cartao.id, competencia: '2026-05',
      contaId: conta.id, valorCentavos: 9500, data: '2026-06-03'
    });

    // Fatura atual (2026-06): compras à vista
    addCompraCartao({
      cartaoId: cartao.id, descricao: 'Supermercado',
      categoriaId: catMerc && catMerc.id,
      valorTotalCentavos: 18500, parcelas: 1, dataCompra: '2026-06-10'
    });
    addCompraCartao({
      cartaoId: cartao.id, descricao: 'Cinema + pipoca',
      categoriaId: catDiv && catDiv.id,
      valorTotalCentavos: 6400, parcelas: 1, dataCompra: '2026-06-12'
    });

    // Parcelado 12x em junho: TV Samsung R$3.600 → 12x R$300
    addCompraCartao({
      cartaoId: cartao.id, descricao: 'TV Samsung 55"',
      categoriaId: catDiv && catDiv.id,
      valorTotalCentavos: 360000, parcelas: 12, dataCompra: '2026-06-05'
    });

    // Compra no dia do fechamento (dia 28): deve cair na competência julho
    addCompraCartao({
      cartaoId: cartao.id, descricao: 'Roupa no fechamento',
      categoriaId: catAlim && catAlim.id,
      valorTotalCentavos: 15900, parcelas: 1, dataCompra: '2026-06-28'
    });
  }

  return {
    listCartoes, getCartaoById, addCartao, updateCartao, arquivarCartao, removeCartao,
    addCompraCartao, competenciaDaCompra, getFatura, getFaturaAtual, listFaturas,
    getParcelasComprometidas, getLimiteDisponivel, pagarFatura, desfazerPagamento,
    _seedCartoes
  };
})();
