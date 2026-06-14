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
    if (!d.orcamentos) d.orcamentos = [];
    if (!d.recorrencias) d.recorrencias = [];
    if (!d.cartoes) d.cartoes = [];
    if (!d.faturaPagamentos) d.faturaPagamentos = [];
    return d;
  }

  // ===== Helpers de mês (prefixo 'YYYY-MM') =====

  /** Soma 'delta' meses ao prefixo 'YYYY-MM' (delta pode ser negativo). */
  function _addMonths(prefix, delta) {
    let [y, m] = prefix.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  /** Dias restantes do mês a partir de 'hoje' (ISO), incluindo o próprio dia. */
  function _diasRestantesMes(hoje) {
    const d = Utils.parseISO(hoje);
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return ultimoDia - d.getDate() + 1;
  }

  /** Gasto (saídas) de uma categoria no mês 'YYYY-MM', em centavos. */
  function _gastoCategoriaMes(categoriaId, mes) {
    return db().transacoes
      .filter(t => t.tipo === 'saida' && t.categoriaId === categoriaId && (t.data || '').startsWith(mes))
      .reduce((s, t) => s + t.valorCentavos, 0);
  }

  /** Estado do orçamento (sobre a base): ok < alerta < estourado. */
  function _estado(gastoCentavos, baseCentavos) {
    if (baseCentavos <= 0) return gastoCentavos > 0 ? 'estourado' : 'ok';
    const pct = gastoCentavos / baseCentavos * 100;
    if (pct > 100) return 'estourado';
    if (pct >= Constants.FINANCE.ORCAMENTO.ALERTA_PCT) return 'alerta';
    return 'ok';
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
      // Compra no cartão não mexe em conta (caixa zero); só o pagamento da fatura sim
      if (t.cartaoId && !t.pagamentoFatura) return;
      if (t.tipo === 'entrada' && ids.has(t.contaId)) saldo += t.valorCentavos;
      else if (t.tipo === 'saida' && ids.has(t.contaId)) saldo -= t.valorCentavos;
      else if (t.tipo === 'transferencia') {
        if (ids.has(t.contaId)) saldo -= t.valorCentavos;
        if (ids.has(t.contaDestinoId)) saldo += t.valorCentavos;
      }
    });
    return saldo;
  }

  /**
   * Saldo em centavos considerando SÓ transações com data <= 'data' (caixa
   * realizado até aquele dia). Base do "saldo de hoje" da projeção (Fase 6):
   * lançamentos com data futura não inflam o saldo atual — entram como evento.
   * Sem contaId: agrega as contas NÃO-meta (caixa disponível, exclui metas).
   */
  function getSaldoAte(contaId, data) {
    const contas = contaId
      ? [getContaById(contaId)].filter(Boolean)
      : listContas({ incluirArquivadas: true }).filter(c => c.tipo !== 'meta');
    const ids = new Set(contas.map(c => c.id));
    let saldo = contas.reduce((s, c) => s + (c.saldoInicialCentavos || 0), 0);
    db().transacoes.forEach(t => {
      if (data && (t.data || '') > data) return;       // só até a data
      if (t.cartaoId && !t.pagamentoFatura) return;     // compra de cartão não é caixa
      if (t.tipo === 'entrada' && ids.has(t.contaId)) saldo += t.valorCentavos;
      else if (t.tipo === 'saida' && ids.has(t.contaId)) saldo -= t.valorCentavos;
      else if (t.tipo === 'transferencia') {
        if (ids.has(t.contaId)) saldo -= t.valorCentavos;
        if (ids.has(t.contaDestinoId)) saldo += t.valorCentavos;
      }
    });
    return saldo;
  }

  /**
   * { entradas, saidas, saldoMes } em centavos para o mês 'YYYY-MM'.
   * Visão de COMPETÊNCIA: compras de cartão contam (valor total na data da compra).
   * Pagamentos de fatura são excluídos (evita dupla contagem; são movimento de CAIXA).
   */
  function getResumoMes(mes) {
    const ts = db().transacoes.filter(t => (t.data || '').startsWith(mes) && !t.pagamentoFatura);
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

  // ===== Orçamentos (Fase 2) =====

  function listOrcamentos() {
    return db().orcamentos;
  }

  function getOrcamentoByCategoria(categoriaId) {
    return db().orcamentos.find(o => o.categoriaId === categoriaId);
  }

  /** Cria ou atualiza o orçamento (um por categoria de despesa). */
  function setOrcamento({ categoriaId, limiteCentavos, rollover = false }) {
    if (!categoriaId) return null;
    const limite = Math.abs(parseInt(limiteCentavos, 10) || 0);
    const now = new Date().toISOString();
    let o = getOrcamentoByCategoria(categoriaId);
    if (o) {
      o.limiteCentavos = limite;
      o.rollover = !!rollover;
      o.atualizadoEm = now;
    } else {
      o = {
        id: Utils.uid(), categoriaId, limiteCentavos: limite,
        rollover: !!rollover, criadoEm: Utils.today(), atualizadoEm: now
      };
      db().orcamentos.push(o);
    }
    AppState.persist();
    return o;
  }

  function removeOrcamento(categoriaId) {
    db().orcamentos = db().orcamentos.filter(o => o.categoriaId !== categoriaId);
    AppState.persist();
  }

  /**
   * Carryover (rollover) de uma categoria para o mês 'YYYY-MM': acumulado de
   * (limite − gasto) de cada mês anterior em que o orçamento existiu. Pode ser
   * negativo (um estouro passado reduz a base do mês). Zero se rollover desligado.
   */
  function getCarryover(categoriaId, mes) {
    const o = getOrcamentoByCategoria(categoriaId);
    if (!o || !o.rollover) return 0;
    const inicio = (o.criadoEm || '').slice(0, 7);
    if (!inicio || inicio >= mes) return 0;
    let carry = 0;
    for (let m = inicio; m < mes; m = _addMonths(m, 1)) {
      carry += o.limiteCentavos - _gastoCategoriaMes(categoriaId, m);
    }
    return carry;
  }

  /** Métricas de cada orçamento para o mês 'YYYY-MM'. */
  function getOrcamentoMes(mes) {
    const ehMesCorrente = mes === currentMonthPrefix();
    const diasRestantes = ehMesCorrente ? _diasRestantesMes(Utils.today()) : null;
    return db().orcamentos.map(o => {
      const gastoCentavos = _gastoCategoriaMes(o.categoriaId, mes);
      const carryoverCentavos = getCarryover(o.categoriaId, mes);
      const baseCentavos = o.limiteCentavos + carryoverCentavos;
      const restanteCentavos = baseCentavos - gastoCentavos;
      const percentual = baseCentavos > 0
        ? Math.round(gastoCentavos / baseCentavos * 100)
        : (gastoCentavos > 0 ? 100 : 0);
      const porDiaCentavos = ehMesCorrente
        ? Math.floor(Math.max(0, restanteCentavos) / Math.max(1, diasRestantes))
        : null;
      return {
        categoriaId: o.categoriaId, limiteCentavos: o.limiteCentavos,
        gastoCentavos, carryoverCentavos, baseCentavos, restanteCentavos,
        percentual, estado: _estado(gastoCentavos, baseCentavos), porDiaCentavos
      };
    });
  }

  /** Dias restantes do mês corrente; null se 'mes' não for o mês atual. */
  function diasRestantesMes(mes) {
    return mes === currentMonthPrefix() ? _diasRestantesMes(Utils.today()) : null;
  }

  /** Totais do mês + categorias de despesa ainda sem orçamento. */
  function getResumoOrcamento(mes) {
    const orcs = getOrcamentoMes(mes);
    const comOrcamento = new Set(orcs.map(o => o.categoriaId));
    return {
      totalOrcadoCentavos: orcs.reduce((s, o) => s + o.limiteCentavos, 0),
      totalGastoCentavos: orcs.reduce((s, o) => s + o.gastoCentavos, 0),
      totalRestanteCentavos: orcs.reduce((s, o) => s + o.restanteCentavos, 0),
      categoriasSemOrcamento: listCategorias('despesa')
        .filter(c => !comOrcamento.has(c.id)).map(c => c.id)
    };
  }

  // ===== Recorrências (Fase 3) =====

  /**
   * Último dia do mês 1-based 'm' em ISO, com o dia limitado a 'dia' (clamp:
   * dia 31 num mês curto cai no último dia real). Componentes locais, sem UTC.
   */
  function _occurrenceISO(ano, mes, dia) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const d = Math.min(dia, ultimoDia);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** Ocorrência da recorrência no mês (ano, mes 1-based), ou null se não houver. */
  function _occurrenceInMonth(rec, ano, mes) {
    if (rec.frequencia === 'anual') {
      if (mes !== rec.mesDoAno) return null;
      return _occurrenceISO(ano, mes, rec.diaDoMes);
    }
    return _occurrenceISO(ano, mes, rec.diaDoMes);
  }

  function _normalizeRecorrencia(f) {
    const tipo = f.tipo === 'entrada' ? 'entrada' : 'saida';
    const frequencia = f.frequencia === 'anual' ? 'anual' : 'mensal';
    // Alvo: cartão OU conta (mutuamente exclusivos). Assinatura no cartão entra
    // no fluxo de caixa só via fatura; recorrência em conta é evento direto.
    const cartaoId = f.cartaoId || '';
    return {
      tipo,
      valorCentavos: Math.abs(parseInt(f.valorCentavos, 10) || 0),
      descricao: (f.descricao || '').trim(),
      categoriaId: f.categoriaId || '',
      cartaoId,
      contaId: cartaoId ? '' : (f.contaId || ''),
      frequencia,
      diaDoMes: Math.min(31, Math.max(1, parseInt(f.diaDoMes, 10) || 1)),
      mesDoAno: frequencia === 'anual'
        ? Math.min(12, Math.max(1, parseInt(f.mesDoAno, 10) || 1)) : null,
      dataInicio: f.dataInicio || Utils.today(),
      dataFim: f.dataFim || null,
      ativa: f.ativa !== false,
      ehAssinatura: !!f.ehAssinatura
    };
  }

  function getRecorrenciaById(id) {
    return db().recorrencias.find(r => r.id === id);
  }

  function listRecorrencias({ tipo, ativa } = {}) {
    return db().recorrencias
      .filter(r => tipo === undefined || r.tipo === tipo)
      .filter(r => ativa === undefined || !!r.ativa === ativa)
      .sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));
  }

  function addRecorrencia(dto) {
    const now = new Date().toISOString();
    const r = _normalizeRecorrencia(dto);
    r.id = Utils.uid();
    // ultimaGeracao pode vir preenchida (lançamento + repetir: a 1ª ocorrência
    // já é o próprio lançamento manual, então não deve ser regerada).
    r.ultimaGeracao = dto.ultimaGeracao || null;
    r.criadoEm = now;
    r.atualizadoEm = now;
    db().recorrencias.push(r);
    AppState.persist();
    return r;
  }

  function updateRecorrencia(id, patch) {
    const r = getRecorrenciaById(id);
    if (!r) return null;
    Object.assign(r, _normalizeRecorrencia({ ...r, ...patch }));
    r.atualizadoEm = new Date().toISOString();
    AppState.persist();
    return r;
  }

  function removeRecorrencia(id) {
    db().recorrencias = db().recorrencias.filter(r => r.id !== id);
    AppState.persist();
  }

  function toggleAtiva(id) {
    const r = getRecorrenciaById(id);
    if (!r) return null;
    r.ativa = !r.ativa;
    r.atualizadoEm = new Date().toISOString();
    AppState.persist();
    return r;
  }

  /**
   * Próxima ocorrência da recorrência em ISO >= 'aPartirDe', respeitando
   * dataInicio e dataFim. null se não houver nenhuma (ex.: já passou dataFim).
   */
  function proximaData(rec, aPartirDe) {
    const inicio = rec.dataInicio || Utils.today();
    let cursor = aPartirDe > inicio ? aPartirDe : inicio; // ISO compara lexicalmente
    const d = Utils.parseISO(cursor);
    let ano = d.getFullYear(), mes = d.getMonth() + 1;
    for (let i = 0; i < 400; i++) {
      if (rec.dataFim && `${ano}-${String(mes).padStart(2, '0')}-01` > rec.dataFim) return null;
      const occ = _occurrenceInMonth(rec, ano, mes);
      if (occ && occ >= cursor && (!rec.dataFim || occ <= rec.dataFim)) return occ;
      mes++; if (mes > 12) { mes = 1; ano++; }
    }
    return null;
  }

  /** Cria a transação de uma ocorrência; pula (idempotente) se já existir. */
  function _criarOcorrencia(rec, data) {
    const existe = db().transacoes.some(t => t.recorrenciaId === rec.id && t.data === data);
    if (existe) return false;
    const now = new Date().toISOString();
    const t = rec.cartaoId
      ? {  // assinatura no cartão → compra de cartão (caixa só via fatura)
          tipo: 'saida', valorCentavos: Math.abs(rec.valorCentavos || 0),
          descricao: rec.descricao, categoriaId: rec.categoriaId || '',
          cartaoId: rec.cartaoId, contaId: '', parcelas: 1, data, fonte: 'recorrencia'
        }
      : _normalize({
          tipo: rec.tipo, valorCentavos: rec.valorCentavos, descricao: rec.descricao,
          categoriaId: rec.categoriaId, contaId: rec.contaId, data, fonte: 'recorrencia'
        });
    t.id = Utils.uid();
    t.recorrenciaId = rec.id;
    t.criadoEm = now;
    t.atualizadoEm = now;
    db().transacoes.push(t);
    return true;
  }

  /** Gera as ocorrências faltantes de uma recorrência até 'ateData'. */
  function _gerarFaltantes(rec, ateData) {
    const from = rec.ultimaGeracao ? Utils.addDays(rec.ultimaGeracao, 1) : rec.dataInicio;
    if (!from) return false;
    let changed = false;
    let occ = proximaData(rec, from);
    while (occ && occ <= ateData) {
      _criarOcorrencia(rec, occ);
      rec.ultimaGeracao = occ; // avança mesmo se a transação já existia (dedup)
      changed = true;
      occ = proximaData(rec, Utils.addDays(occ, 1));
    }
    return changed;
  }

  /**
   * Gera as transações faltantes de todas as recorrências ativas até 'ateData'.
   * Idempotente e seguro p/ multi-dispositivo: a dedup por recorrenciaId+data
   * evita duplicar quando vários aparelhos processam após o sync.
   */
  function processarRecorrencias(ateData = Utils.today()) {
    let changed = false;
    listRecorrencias({ ativa: true }).forEach(rec => {
      if (_gerarFaltantes(rec, ateData)) changed = true;
    });
    if (changed) AppState.persist();
    return changed;
  }

  /**
   * Ocorrências FUTURAS ainda não geradas no intervalo [de, ate] (base dos
   * "próximos lançamentos" e da projeção da Fase 6). Não inclui as já geradas.
   * Cada item carrega o alvo: contaId OU cartaoId (recorrência em cartão).
   */
  function getProximasOcorrencias({ de, ate } = {}) {
    de = de || Utils.today();
    ate = ate || de;
    const out = [];
    listRecorrencias({ ativa: true }).forEach(rec => {
      let occ = proximaData(rec, de);
      while (occ && occ <= ate) {
        const jaGerada = (rec.ultimaGeracao && occ <= rec.ultimaGeracao)
          || db().transacoes.some(t => t.recorrenciaId === rec.id && t.data === occ);
        if (!jaGerada) {
          out.push({
            recorrenciaId: rec.id, data: occ, tipo: rec.tipo,
            valorCentavos: rec.valorCentavos, descricao: rec.descricao,
            categoriaId: rec.categoriaId, contaId: rec.contaId || '',
            cartaoId: rec.cartaoId || ''
          });
        }
        occ = proximaData(rec, Utils.addDays(occ, 1));
      }
    });
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }

  /** Custo fixo mensal: anuais normalizados dividindo por 12. Só recorrências ativas. */
  function getCustoFixo() {
    let saida = 0, entrada = 0;
    listRecorrencias({ ativa: true }).forEach(r => {
      const mensal = r.frequencia === 'anual' ? Math.round(r.valorCentavos / 12) : r.valorCentavos;
      if (r.tipo === 'saida') saida += mensal; else entrada += mensal;
    });
    return {
      fixoMensalSaidaCentavos: saida,
      fixoMensalEntradaCentavos: entrada,
      fixoMensalLiquidoCentavos: entrada - saida
    };
  }

  function listAssinaturas() {
    return listRecorrencias({ ativa: true }).filter(r => r.ehAssinatura);
  }

  // ===== Projeção de saldo / fluxo de caixa (Fase 6) =====

  /** Último dia do mês de 'iso' em ISO local. */
  function _fimDoMes(iso) {
    const d = Utils.parseISO(iso);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
  }

  /** Resolve o fim do horizonte: 'ate' explícito > 'dias' a partir de hoje > fim do mês. */
  function _resolverHorizonte(hoje, ate, dias) {
    if (ate) return ate;
    if (dias) return Utils.addDays(hoje, parseInt(dias, 10));
    return _fimDoMes(hoje);
  }

  /**
   * Fatura projetada = getFatura (parcelas/compras já lançadas) + as ocorrências
   * de recorrência de cartão AINDA não geradas cuja competência da compra cai
   * nesta competência (marcadas previsto:true). totalCentavos inclui os previstos.
   */
  function getFaturaProjetada(cartaoId, competencia) {
    const fatura = CartaoService.getFatura(cartaoId, competencia);
    if (!fatura) return null;
    const cartao = CartaoService.getCartaoById(cartaoId);
    // Compras que caem nesta competência têm data até ~o fechamento do mês seguinte
    const ate = `${_addMonths(competencia, 1)}-28`;
    const previstos = getProximasOcorrencias({ de: Utils.today(), ate })
      .filter(o => o.cartaoId === cartaoId)
      .filter(o => CartaoService.competenciaDaCompra(cartao, o.data) === competencia)
      .map(o => ({
        transacaoId: '', recorrenciaId: o.recorrenciaId,
        descricao: o.descricao, categoriaId: o.categoriaId,
        parcelaNum: 1, parcelaTotal: 1,
        valorParcelaCentavos: o.valorCentavos, previsto: true
      }));
    const itens = fatura.itens.concat(previstos);
    const totalCentavos = itens.reduce((s, i) => s + i.valorParcelaCentavos, 0);
    const previstoCentavos = previstos.reduce((s, i) => s + i.valorParcelaCentavos, 0);
    return { ...fatura, itens, totalCentavos, previstoCentavos };
  }

  function _ev(data, descricao, valorCentavos, tipo, origemId, extra) {
    return { data, descricao: descricao || 'Lançamento', valorCentavos, tipo, origemId, ...extra };
  }

  /** Eventos de caixa: transações futuras já lançadas (exclui compras de cartão). */
  function _eventosTransacoes(hoje, fim, idsNaoMeta) {
    const out = [];
    db().transacoes.forEach(t => {
      const data = t.data || '';
      if (data <= hoje || data > fim) return;
      if (t.cartaoId && !t.pagamentoFatura) return; // compra de cartão entra só via fatura
      if (t.tipo === 'entrada' && idsNaoMeta.has(t.contaId)) {
        out.push(_ev(data, t.descricao, t.valorCentavos,
          t.fonte === 'recorrencia' ? 'recorrencia' : 'planejado', t.id));
      } else if (t.tipo === 'saida' && idsNaoMeta.has(t.contaId)) {
        const tipo = t.pagamentoFatura ? 'fatura' : t.fonte === 'recorrencia' ? 'recorrencia' : 'planejado';
        out.push(_ev(data, t.descricao, -t.valorCentavos, tipo, t.id));
      } else if (t.tipo === 'transferencia') {
        let delta = 0;
        if (idsNaoMeta.has(t.contaId)) delta -= t.valorCentavos;
        if (idsNaoMeta.has(t.contaDestinoId)) delta += t.valorCentavos;
        if (delta !== 0) out.push(_ev(data, t.descricao || 'Transferência', delta, delta > 0 ? 'entrada' : 'saida', t.id));
      }
    });
    return out;
  }

  /** Eventos de caixa: recorrências futuras em CONTA (cartão entra só via fatura). */
  function _eventosRecorrencias(hoje, fim, idsNaoMeta) {
    return getProximasOcorrencias({ de: hoje, ate: fim })
      .filter(o => o.contaId && !o.cartaoId && idsNaoMeta.has(o.contaId))
      .map(o => _ev(o.data, o.descricao,
        o.tipo === 'entrada' ? o.valorCentavos : -o.valorCentavos,
        'recorrencia', o.recorrenciaId));
  }

  /** Eventos de caixa: pagamento (no vencimento) de faturas não pagas no horizonte. */
  function _eventosFaturas(hoje, fim) {
    const out = [];
    const compInicio = _addMonths(currentMonthPrefix(), -1);
    const compFim = _addMonths(fim.slice(0, 7), 1);
    CartaoService.listCartoes().forEach(c => {
      for (let comp = compInicio; comp <= compFim; comp = _addMonths(comp, 1)) {
        const f = getFaturaProjetada(c.id, comp);
        if (!f || f.paga || f.totalCentavos <= 0) continue;
        if (f.dataVencimento <= hoje || f.dataVencimento > fim) continue;
        out.push(_ev(f.dataVencimento, `Fatura ${c.nome}`, -f.totalCentavos, 'fatura', c.id,
          { competencia: comp, previstoCentavos: f.previstoCentavos }));
      }
    });
    return out;
  }

  /**
   * Projeção de fluxo de caixa: parte do saldo disponível hoje (getSaldoAte) e
   * caminha dia a dia até o fim do horizonte aplicando os eventos de caixa.
   * VISÃO DE CAIXA (não competência): compra de cartão entra só via pagamento
   * de fatura no vencimento. Horizonte default = fim do mês corrente.
   */
  function getProjecaoSaldo({ ate, dias } = {}) {
    const hoje = Utils.today();
    const fim = _resolverHorizonte(hoje, ate, dias);
    const saldoInicial = getSaldoAte(null, hoje);
    const idsNaoMeta = new Set(
      listContas({ incluirArquivadas: true }).filter(c => c.tipo !== 'meta').map(c => c.id)
    );

    const eventos = [
      ..._eventosTransacoes(hoje, fim, idsNaoMeta),
      ..._eventosRecorrencias(hoje, fim, idsNaoMeta),
      ..._eventosFaturas(hoje, fim)
    ].filter(e => e.data > hoje && e.data <= fim)
     .sort((a, b) => a.data.localeCompare(b.data));

    const pontos = [];
    let saldo = saldoInicial;
    let menorSaldo = { data: hoje, valorCentavos: saldoInicial };
    let i = 0;
    for (let d = hoje; d <= fim; d = Utils.addDays(d, 1)) {
      while (i < eventos.length && eventos[i].data === d) { saldo += eventos[i].valorCentavos; i++; }
      pontos.push({ data: d, saldoCentavos: saldo });
      if (saldo < menorSaldo.valorCentavos) menorSaldo = { data: d, valorCentavos: saldo };
    }

    return {
      saldoInicialCentavos: saldoInicial,
      pontos,
      eventos,
      saldoFinalCentavos: saldo,
      menorSaldo,
      ficaNegativo: menorSaldo.valorCentavos < 0
    };
  }

  /** Conveniência para o card do Dashboard: saldo projetado no fim do mês corrente. */
  function getSaldoProjetadoFimMes() {
    return getProjecaoSaldo({}).saldoFinalCentavos;
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

    _seedRolloverBudget(conta, desp[2], mes); // Transporte: orçamento com rollover
    _seedRecorrencias(conta, desp, rec, mes); // recorrências + histórico gerado
    if (window.CartaoService) CartaoService._seedCartoes(); // Fase 4: cartões
    _seedProjecao(conta, desp, rec, mes);     // Fase 6: curva de projeção
  }

  /**
   * Cenário da projeção (Fase 6): cartão com fatura grande vencendo no fim do mês
   * (inclui uma assinatura de cartão prevista + uma parcela), uma saída planejada
   * dimensionada para o saldo mergulhar abaixo de zero e uma entrada que o recupera.
   * Gera uma curva com vale negativo e recuperação dentro do horizonte do mês.
   */
  function _seedProjecao(conta, desp, rec, mes) {
    if (window.location.hostname !== 'localhost') return;
    if (db().cartoes.some(c => c.nome === 'Visa Projeção')) return;
    if (!window.CartaoService) return;
    const dia = n => `${mes}-${String(n).padStart(2, '0')}`;
    const moradia = desp.find(c => c.nome === 'Moradia') || desp[3];
    const diversao = desp.find(c => c.nome === 'Diversão') || desp[5];
    const receita = rec[0];

    const cartao = CartaoService.addCartao({
      nome: 'Visa Projeção', cor: '#f59e0b',
      limiteCentavos: 800000, diaFechamento: 20, diaVencimento: 28,
      contaPagamentoId: conta.id
    });
    // Compra grande e parcela já lançadas → fatura de junho (vence dia 28)
    CartaoService.addCompraCartao({ cartaoId: cartao.id, descricao: 'Notebook',
      categoriaId: diversao && diversao.id, valorTotalCentavos: 280000, parcelas: 1, dataCompra: dia(3) });
    CartaoService.addCompraCartao({ cartaoId: cartao.id, descricao: 'Móveis',
      categoriaId: moradia && moradia.id, valorTotalCentavos: 120000, parcelas: 6, dataCompra: dia(5) });
    // Assinatura no cartão (dia 15): entra na fatura como PREVISTO, não como caixa avulso
    addRecorrencia({ tipo: 'saida', valorCentavos: 2290, descricao: 'Spotify Cartão',
      categoriaId: diversao && diversao.id, cartaoId: cartao.id,
      frequencia: 'mensal', diaDoMes: 15, dataInicio: dia(1), ehAssinatura: true });
    // Compra de cartão FUTURA (dia 30) → cai na competência seguinte, não mexe na curva do mês
    CartaoService.addCompraCartao({ cartaoId: cartao.id, descricao: 'Compra futura',
      categoriaId: diversao && diversao.id, valorTotalCentavos: 50000, parcelas: 1, dataCompra: dia(30) });

    // Saída planejada que joga o saldo abaixo de zero + entrada que o recupera
    const saldoHoje = getSaldoAte(null, Utils.today());
    addTransaction({ tipo: 'saida', valorCentavos: saldoHoje + 300000, descricao: 'Sinal do apartamento',
      categoriaId: moradia && moradia.id, contaId: conta.id, data: dia(24), fonte: 'manual' });
    addTransaction({ tipo: 'entrada', valorCentavos: 900000, descricao: 'Resgate investimento',
      categoriaId: receita && receita.id, contaId: conta.id, data: dia(29), fonte: 'manual' });
  }

  /**
   * Recorrências de exemplo (aluguel mensal dia 5, salário dia 1, 2 assinaturas),
   * com início há 3 meses, e gera o histórico via processarRecorrencias.
   */
  function _seedRecorrencias(conta, desp, rec, mes) {
    if (db().recorrencias.length) return; // não duplicar em re-seed
    const inicio = `${_addMonths(mes, -3)}-01`;
    const moradia = desp.find(c => c.nome === 'Moradia') || desp[3];
    const diversao = desp.find(c => c.nome === 'Diversão') || desp[5];
    addRecorrencia({ tipo: 'saida', valorCentavos: 180000, descricao: 'Aluguel',
      categoriaId: moradia && moradia.id, contaId: conta.id,
      frequencia: 'mensal', diaDoMes: 5, dataInicio: inicio });
    addRecorrencia({ tipo: 'entrada', valorCentavos: 600000, descricao: 'Salário',
      categoriaId: rec[0] && rec[0].id, contaId: conta.id,
      frequencia: 'mensal', diaDoMes: 1, dataInicio: inicio });
    addRecorrencia({ tipo: 'saida', valorCentavos: 5590, descricao: 'Netflix',
      categoriaId: diversao && diversao.id, contaId: conta.id,
      frequencia: 'mensal', diaDoMes: 15, dataInicio: inicio, ehAssinatura: true });
    addRecorrencia({ tipo: 'saida', valorCentavos: 2190, descricao: 'Spotify',
      categoriaId: diversao && diversao.id, contaId: conta.id,
      frequencia: 'mensal', diaDoMes: 20, dataInicio: inicio, ehAssinatura: true });
    processarRecorrencias();
  }

  /**
   * Cenário de carryover: orçamento de Transporte (R$600/mês, rollover) criado
   * há 3 meses, com gasto abaixo do teto nos meses anteriores. A sobra acumulada
   * deve somar à base do mês atual.
   */
  function _seedRolloverBudget(conta, cat, mes) {
    if (!cat) return;
    const o = setOrcamento({ categoriaId: cat.id, limiteCentavos: 60000, rollover: true });
    o.criadoEm = `${_addMonths(mes, -3)}-01`; // backdata para acumular 3 meses
    [[-3, 52000], [-2, 45000], [-1, 50000]].forEach(([delta, valor]) => {
      addTransaction({
        tipo: 'saida', valorCentavos: valor, descricao: 'Transporte',
        categoriaId: cat.id, contaId: conta.id,
        data: `${_addMonths(mes, delta)}-15`, fonte: 'manual'
      });
    });
    AppState.persist();
  }

  return {
    _seedDefaults, _seedTestData,
    listContas, getContaById, addConta, arquivarConta,
    listCategorias, getCategoriaById, addCategoria,
    addTransaction, updateTransaction, deleteTransaction,
    getTransacaoById, listTransactions,
    getSaldo, getSaldoAte, getResumoMes, currentMonthPrefix, entryDates,
    getFaturaProjetada, getProjecaoSaldo, getSaldoProjetadoFimMes,
    listOrcamentos, getOrcamentoByCategoria, setOrcamento, removeOrcamento,
    getCarryover, getOrcamentoMes, getResumoOrcamento, diasRestantesMes,
    getRecorrenciaById, listRecorrencias, addRecorrencia, updateRecorrencia,
    removeRecorrencia, toggleAtiva, proximaData, processarRecorrencias,
    getProximasOcorrencias, getCustoFixo, listAssinaturas
  };
})();
