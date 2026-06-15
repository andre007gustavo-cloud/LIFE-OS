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

  function addConta({ nome, tipo = 'dinheiro', saldoInicialCentavos = 0, cor, icone = '💵',
                      valorObjetivoCentavos = 0, dataObjetivo = '' }) {
    const conta = {
      id: Utils.uid(), nome: (nome || '').trim(), tipo,
      saldoInicialCentavos: parseInt(saldoInicialCentavos, 10) || 0,
      cor: cor || Constants.COLORS[0], icone,
      arquivada: false, criadoEm: Utils.today()
    };
    // Fase 7d: metas guardam objetivo + prazo (opcionais) para os alertas
    if (tipo === 'meta') {
      conta.valorObjetivoCentavos = Math.abs(parseInt(valorObjetivoCentavos, 10) || 0);
      conta.dataObjetivo = dataObjetivo || '';
    }
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
      ehAssinatura: !!f.ehAssinatura,
      // Fase 7d: última vez que o usuário confirmou que ainda usa a assinatura
      ultimaConfirmacao: f.ultimaConfirmacao || null
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

  /** Fase 7d: marca a assinatura como confirmada hoje (zera o alerta dela). */
  function confirmarAssinatura(id) {
    const r = getRecorrenciaById(id);
    if (!r) return null;
    r.ultimaConfirmacao = Utils.today();
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
   * Expande uma compra hipotética em parcelas por competência (mesma regra da
   * fatura real: 1ª competência = competenciaDaCompra; última absorve o resto).
   * Usada na simulação (Fase 7c) — nunca persistida.
   */
  function _parcelasHipoteticas(cartao, compra) {
    const total = Math.abs(parseInt(compra.valorCentavos, 10) || 0);
    const parcelas = Math.max(1, parseInt(compra.parcelas, 10) || 1);
    const compBase = CartaoService.competenciaDaCompra(cartao, compra.data || Utils.today());
    const baseVal = Math.floor(total / parcelas);
    const out = [];
    for (let k = 1; k <= parcelas; k++) {
      out.push({
        competencia: _addMonths(compBase, k - 1),
        parcelaNum: k, parcelaTotal: parcelas,
        valorParcelaCentavos: k === parcelas ? total - baseVal * (parcelas - 1) : baseVal
      });
    }
    return out;
  }

  /**
   * Fatura projetada = getFatura (parcelas/compras já lançadas) + as ocorrências
   * de recorrência de cartão AINDA não geradas cuja competência da compra cai
   * nesta competência (marcadas previsto:true). totalCentavos inclui os previstos.
   * comprasHipoteticas (Fase 7c): compras simuladas no cartão, somadas à fatura
   * da competência correspondente sem nunca serem persistidas.
   */
  function getFaturaProjetada(cartaoId, competencia, comprasHipoteticas = []) {
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
    const hipoteticos = [];
    comprasHipoteticas.forEach(compra => {
      _parcelasHipoteticas(cartao, compra).forEach(p => {
        if (p.competencia !== competencia) return;
        hipoteticos.push({
          transacaoId: '', recorrenciaId: '',
          descricao: compra.descricao || 'Simulação', categoriaId: compra.categoriaId || '',
          parcelaNum: p.parcelaNum, parcelaTotal: p.parcelaTotal,
          valorParcelaCentavos: p.valorParcelaCentavos, hipotetico: true
        });
      });
    });
    const itens = fatura.itens.concat(previstos, hipoteticos);
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
  function _eventosFaturas(hoje, fim, hipCartao = []) {
    const out = [];
    const compInicio = _addMonths(currentMonthPrefix(), -1);
    const compFim = _addMonths(fim.slice(0, 7), 1);
    CartaoService.listCartoes().forEach(c => {
      const hipDoCartao = hipCartao.filter(h => h.cartaoId === c.id);
      for (let comp = compInicio; comp <= compFim; comp = _addMonths(comp, 1)) {
        const f = getFaturaProjetada(c.id, comp, hipDoCartao);
        if (!f || f.paga || f.totalCentavos <= 0) continue;
        if (f.dataVencimento <= hoje || f.dataVencimento > fim) continue;
        out.push(_ev(f.dataVencimento, `Fatura ${c.nome}`, -f.totalCentavos, 'fatura', c.id,
          { competencia: comp, previstoCentavos: f.previstoCentavos }));
      }
    });
    return out;
  }

  /** Sinal/valor de caixa de uma transação hipotética: entrada +, saída −. */
  function _hipSinal(h) {
    const v = Math.abs(parseInt(h.valorCentavos, 10) || 0);
    return h.tipo === 'entrada' ? v : -v;
  }

  /** Eventos de caixa das hipotéticas em CONTA (Fase 7c). data<=hoje vira saldo inicial. */
  function _eventosHipoteticasConta(hoje, fim, idsNaoMeta, hipConta) {
    return hipConta
      .filter(h => idsNaoMeta.has(h.contaId))
      .map(h => _ev(h.data || hoje, h.descricao || 'Simulação', _hipSinal(h), 'planejado', 'hipotetico', { hipotetico: true }));
  }

  /**
   * Projeção de fluxo de caixa: parte do saldo disponível hoje (getSaldoAte) e
   * caminha dia a dia até o fim do horizonte aplicando os eventos de caixa.
   * VISÃO DE CAIXA (não competência): compra de cartão entra só via pagamento
   * de fatura no vencimento. Horizonte default = fim do mês corrente.
   * transacoesHipoteticas (Fase 7c): saídas em conta ou compras de cartão
   * simuladas, injetadas no MESMO pipeline e NUNCA persistidas.
   */
  function getProjecaoSaldo({ ate, dias, transacoesHipoteticas = [] } = {}) {
    const hoje = Utils.today();
    const fim = _resolverHorizonte(hoje, ate, dias);
    const idsNaoMeta = new Set(
      listContas({ incluirArquivadas: true }).filter(c => c.tipo !== 'meta').map(c => c.id)
    );
    const hipConta = transacoesHipoteticas.filter(h => h.contaId && !h.cartaoId);
    const hipCartao = transacoesHipoteticas.filter(h => h.cartaoId);

    let saldoInicial = getSaldoAte(null, hoje);
    // Hipotética em conta com data passada/hoje afeta o saldo de partida (como o caixa real)
    hipConta.forEach(h => {
      if ((h.data || hoje) <= hoje && idsNaoMeta.has(h.contaId)) saldoInicial += _hipSinal(h);
    });

    const eventos = [
      ..._eventosTransacoes(hoje, fim, idsNaoMeta),
      ..._eventosRecorrencias(hoje, fim, idsNaoMeta),
      ..._eventosFaturas(hoje, fim, hipCartao),
      ..._eventosHipoteticasConta(hoje, fim, idsNaoMeta, hipConta)
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

  // ===== Relatórios & Insights (Fase 7a) =====
  // Visão de COMPETÊNCIA: despesa conta na DATA do lançamento (compra de cartão
  // entra no mês da compra). Exclui pagamento de fatura (movimento de CAIXA);
  // transferências e aportes a metas são tipo 'transferencia', logo já ficam de
  // fora de qualquer filtro por tipo 'saida'.

  /** Saídas do mês (competência): exclui pagamentos de fatura. */
  function _despesasMes(mes) {
    return db().transacoes.filter(t =>
      t.tipo === 'saida' && !t.pagamentoFatura && (t.data || '').startsWith(mes));
  }

  /** Variação % de 'anterior' para 'atual'. null se anterior=0 (sem base p/ %). */
  function _variacaoPct(atualCentavos, anteriorCentavos) {
    if (anteriorCentavos === 0) return null;
    return (atualCentavos - anteriorCentavos) / anteriorCentavos * 100;
  }

  /** Gasto por categoria no mês, ordenado desc. percentual sobre o total de saídas. */
  function getGastosPorCategoria(mes) {
    const despesas = _despesasMes(mes);
    const total = despesas.reduce((s, t) => s + t.valorCentavos, 0);
    const porCat = new Map();
    despesas.forEach(t => {
      porCat.set(t.categoriaId, (porCat.get(t.categoriaId) || 0) + t.valorCentavos);
    });
    return [...porCat.entries()]
      .map(([categoriaId, totalCentavos]) => {
        const cat = getCategoriaById(categoriaId);
        return {
          categoriaId,
          nome: cat ? cat.nome : 'Sem categoria',
          cor: cat ? cat.cor : '#94a3b8',
          totalCentavos,
          percentual: total > 0 ? totalCentavos / total * 100 : 0
        };
      })
      .sort((a, b) => b.totalCentavos - a.totalCentavos);
  }

  /** Últimos nMeses (terminando no mês corrente): entradas/saídas/saldo em competência. */
  function getEvolucaoMensal(nMeses = 6) {
    const atual = currentMonthPrefix();
    const out = [];
    for (let i = nMeses - 1; i >= 0; i--) {
      const mes = _addMonths(atual, -i);
      const r = getResumoMes(mes);
      out.push({
        mes,
        entradasCentavos: r.entradas,
        saidasCentavos: r.saidas,
        saldoMesCentavos: r.saldoMes
      });
    }
    return out;
  }

  /** As 'limite' maiores despesas do mês, ordenadas por valor desc. */
  function getMaioresGastos(mes, limite = 5) {
    return _despesasMes(mes)
      .sort((a, b) =>
        b.valorCentavos - a.valorCentavos ||
        (b.data || '').localeCompare(a.data || ''))
      .slice(0, limite)
      .map(t => {
        const cat = getCategoriaById(t.categoriaId);
        return {
          transacaoId: t.id,
          descricao: t.descricao || (cat ? cat.nome : 'Lançamento'),
          categoriaNome: cat ? cat.nome : 'Sem categoria',
          valorCentavos: t.valorCentavos,
          data: t.data
        };
      });
  }

  /** Total de saídas vs mês anterior + variação por categoria (ordenada por delta desc). */
  function getComparativoMes(mes) {
    const atual = getGastosPorCategoria(mes);
    const anterior = getGastosPorCategoria(_addMonths(mes, -1));
    const totalSaidasCentavos = atual.reduce((s, c) => s + c.totalCentavos, 0);
    const totalSaidasAnteriorCentavos = anterior.reduce((s, c) => s + c.totalCentavos, 0);

    const atMap = new Map(atual.map(c => [c.categoriaId, c.totalCentavos]));
    const antMap = new Map(anterior.map(c => [c.categoriaId, c.totalCentavos]));
    const porCategoria = [...new Set([...atMap.keys(), ...antMap.keys()])]
      .map(id => {
        const cat = getCategoriaById(id);
        const atualCentavos = atMap.get(id) || 0;
        const anteriorCentavos = antMap.get(id) || 0;
        return {
          categoriaId: id,
          nome: cat ? cat.nome : 'Sem categoria',
          atualCentavos,
          anteriorCentavos,
          variacaoPct: _variacaoPct(atualCentavos, anteriorCentavos)
        };
      })
      .sort((a, b) =>
        (b.atualCentavos - b.anteriorCentavos) - (a.atualCentavos - a.anteriorCentavos));

    return {
      totalSaidasCentavos,
      totalSaidasAnteriorCentavos,
      variacaoPct: _variacaoPct(totalSaidasCentavos, totalSaidasAnteriorCentavos),
      porCategoria
    };
  }

  /** (entradas − saídas) / entradas no mês; 0 se não houver entradas. */
  function getTaxaPoupanca(mes) {
    const { entradas, saidas } = getResumoMes(mes);
    return entradas === 0 ? 0 : (entradas - saidas) / entradas;
  }

  // ===== Categorização automática por histórico (Fase 7b) =====
  // Sem dado novo armazenado: lê as transações já categorizadas do MESMO tipo
  // e vota a categoria mais provável para uma descrição nova. Sem chute.

  const _SUG_MIN_TOKEN = 3;     // ignora tokens curtos ("de", "no", "12")
  const _SUG_MIN_MATCHES = 2;   // precisa de ao menos 2 transações parecidas
  const _SUG_MIN_CONFIANCA = 0.5;

  /** Tokens significativos da descrição normalizada (>=3 chars, sem repetição). */
  function _tokens(descricao) {
    const norm = Utils.normalizeText(descricao);
    return [...new Set(norm.split(/[^a-z0-9]+/).filter(t => t.length >= _SUG_MIN_TOKEN))];
  }

  /**
   * Sugere uma categoria para 'descricao' com base no histórico de transações do
   * MESMO 'tipo' ('saida'/'entrada'). Retorna { categoriaId, confianca } ou null.
   * Vota a categoria mais frequente entre as transações que compartilham >=1 token
   * (peso pelo nº de tokens em comum + leve bônus de recência). confianca = nº de
   * correspondências da vencedora / total de correspondências.
   */
  function sugerirCategoria(descricao, tipo) {
    if (tipo !== 'saida' && tipo !== 'entrada') return null;
    const tokens = _tokens(descricao);
    if (!tokens.length) return null;

    const candidatas = db().transacoes
      .filter(t => t.tipo === tipo && t.categoriaId && !t.pagamentoFatura);
    if (!candidatas.length) return null;

    // Mais recente recebe bônus levemente maior (ordena asc por data → índice cresce)
    const ordenadas = candidatas.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const n = ordenadas.length;

    const score = new Map();   // categoriaId → peso acumulado (voto)
    const matches = new Map(); // categoriaId → nº de transações correspondentes
    let total = 0;
    ordenadas.forEach((t, i) => {
      const comuns = _tokens(t.descricao).filter(tk => tokens.includes(tk)).length;
      if (!comuns) return;
      const recencia = 1 + (i / n) * 0.2; // bônus leve (até +20%) para as mais recentes
      score.set(t.categoriaId, (score.get(t.categoriaId) || 0) + comuns * recencia);
      matches.set(t.categoriaId, (matches.get(t.categoriaId) || 0) + 1);
      total++;
    });

    if (total < _SUG_MIN_MATCHES) return null;

    let vencedora = null, melhor = -1;
    score.forEach((peso, catId) => { if (peso > melhor) { melhor = peso; vencedora = catId; } });
    const confianca = matches.get(vencedora) / total;
    if (confianca < _SUG_MIN_CONFIANCA) return null;
    return { categoriaId: vencedora, confianca };
  }

  // ===== "Posso gastar isso?" — simulação (Fase 7c) =====
  // Tudo computado: a compra entra como transação hipotética no mesmo pipeline da
  // projeção (Fase 6) e como soma ao gasto da categoria (competência). NADA é salvo.

  /** Impacto da compra no orçamento da categoria (competência). null sem categoria. */
  function _simularOrcamento(categoriaId, valorTotalCentavos, mes) {
    if (!categoriaId) return null;
    const cat = getCategoriaById(categoriaId);
    const categoriaNome = cat ? cat.nome : 'Sem categoria';
    const gastoAtualCentavos = _gastoCategoriaMes(categoriaId, mes);
    const gastoDepoisCentavos = gastoAtualCentavos + valorTotalCentavos;
    const o = getOrcamentoByCategoria(categoriaId);
    if (!o) {
      return {
        temOrcamento: false, categoriaNome, gastoAtualCentavos, gastoDepoisCentavos,
        limiteCentavos: 0, restanteDepoisCentavos: 0, percentualDepois: 0, estadoDepois: 'ok'
      };
    }
    const baseCentavos = o.limiteCentavos + getCarryover(categoriaId, mes);
    const restanteDepoisCentavos = baseCentavos - gastoDepoisCentavos;
    const percentualDepois = baseCentavos > 0
      ? Math.round(gastoDepoisCentavos / baseCentavos * 100)
      : (gastoDepoisCentavos > 0 ? 100 : 0);
    return {
      temOrcamento: true, categoriaNome, gastoAtualCentavos, gastoDepoisCentavos,
      limiteCentavos: o.limiteCentavos, restanteDepoisCentavos, percentualDepois,
      estadoDepois: _estado(gastoDepoisCentavos, baseCentavos)
    };
  }

  /** Veredito a partir do orçamento e da projeção pós-compra. */
  function _veredito(orcamento, projecao) {
    if (projecao.ficaNegativoDepois) {
      return { nivel: 'cuidado', mensagem: `Te deixa no vermelho em ${Utils.fmtDate(projecao.menorSaldoDepois.data)}` };
    }
    if (orcamento && orcamento.temOrcamento) {
      if (orcamento.estadoDepois === 'estourado') {
        return { nivel: 'atencao', mensagem: `Estoura ${orcamento.categoriaNome} em ${Utils.formatBRL(-orcamento.restanteDepoisCentavos)}` };
      }
      if (orcamento.estadoDepois === 'alerta') {
        return { nivel: 'atencao', mensagem: `Aperta ${orcamento.categoriaNome} (${orcamento.percentualDepois}%)` };
      }
    }
    return { nivel: 'ok', mensagem: 'Pode gastar tranquilo' };
  }

  /**
   * Simula uma compra sem salvar nada. Retorna o impacto no orçamento da categoria,
   * na projeção de fim de mês (saldo antes/depois e menor saldo) e um veredito.
   */
  function simularGasto({ valorCentavos, categoriaId, contaId, cartaoId, parcelas = 1, data } = {}) {
    const valor = Math.abs(parseInt(valorCentavos, 10) || 0);
    const dataCompra = data || Utils.today();
    const mes = dataCompra.slice(0, 7);

    const hipotetica = cartaoId
      ? { tipo: 'saida', valorCentavos: valor, categoriaId: categoriaId || '', cartaoId, contaId: '', parcelas: Math.max(1, parseInt(parcelas, 10) || 1), data: dataCompra }
      : { tipo: 'saida', valorCentavos: valor, categoriaId: categoriaId || '', contaId: contaId || '', cartaoId: '', parcelas: 1, data: dataCompra };

    const orcamento = _simularOrcamento(categoriaId, valor, mes);

    const antes = getProjecaoSaldo({});
    const depois = getProjecaoSaldo({ transacoesHipoteticas: [hipotetica] });
    const projecao = {
      saldoFimMesAntesCentavos: antes.saldoFinalCentavos,
      saldoFimMesDepoisCentavos: depois.saldoFinalCentavos,
      menorSaldoAntes: antes.menorSaldo,
      menorSaldoDepois: depois.menorSaldo,
      ficaNegativoDepois: depois.ficaNegativo || depois.menorSaldo.valorCentavos < 0
    };

    return { orcamento, projecao, veredito: _veredito(orcamento, projecao) };
  }

  // ===== Metas (modelo mínimo) + Alertas proativos (Fase 7d) =====

  /** Diferença em meses (mesAte − mesDe), ambos 'YYYY-MM'. */
  function _mesesEntre(mesDe, mesAte) {
    const [ya, ma] = mesDe.split('-').map(Number);
    const [yb, mb] = mesAte.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }

  function listMetas() {
    return db().contas.filter(c => c.tipo === 'meta' && !c.arquivada);
  }

  /**
   * Resumo de uma conta-meta: saldo atual, quanto falta, prazo, aporte mensal
   * necessário e último aporte. null se não for meta. Saldo = aportes acumulados
   * (transferências para a conta), computado por getSaldo.
   */
  function getMetaResumo(contaId) {
    const c = getContaById(contaId);
    if (!c || c.tipo !== 'meta') return null;
    const objetivoCentavos = c.valorObjetivoCentavos || 0;
    const saldoAtualCentavos = getSaldo(contaId);
    const faltaCentavos = Math.max(0, objetivoCentavos - saldoAtualCentavos);
    const dataObjetivo = c.dataObjetivo || '';

    const aportes = db().transacoes
      .filter(t => t.tipo === 'transferencia' && t.contaDestinoId === contaId && t.data)
      .map(t => t.data).sort();
    const ultimoAporte = aportes.length ? aportes[aportes.length - 1] : null;

    let mesesRestantes = null, aporteMensalNecessarioCentavos = null;
    if (dataObjetivo) {
      mesesRestantes = _mesesEntre(currentMonthPrefix(), dataObjetivo.slice(0, 7));
      if (faltaCentavos > 0) {
        aporteMensalNecessarioCentavos = mesesRestantes > 0
          ? Math.ceil(faltaCentavos / mesesRestantes)
          : faltaCentavos; // prazo vencido: precisa de tudo agora
      }
    }
    return {
      contaId, nome: c.nome, objetivoCentavos, saldoAtualCentavos, faltaCentavos,
      dataObjetivo, mesesRestantes, aporteMensalNecessarioCentavos, ultimoAporte,
      concluida: objetivoCentavos > 0 && faltaCentavos === 0
    };
  }

  const _SEV_RANK = { critico: 0, atencao: 1, info: 2 };

  function _alertasOrcamento(mes, out) {
    const diasRestantes = diasRestantesMes(mes);
    getOrcamentoMes(mes).forEach(o => {
      const cat = getCategoriaById(o.categoriaId);
      const nome = cat ? cat.nome : 'Categoria';
      if (o.estado === 'estourado') {
        out.push({
          id: 'orc-' + o.categoriaId, tipo: 'orcamento', severidade: 'critico',
          titulo: `${nome} estourou`,
          descricao: `${nome} estourou ${Utils.formatBRL(-o.restanteCentavos)} do orçamento`
        });
      } else if (o.estado === 'alerta') {
        const sufixo = diasRestantes ? `, faltam ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}` : '';
        out.push({
          id: 'orc-' + o.categoriaId, tipo: 'orcamento', severidade: 'atencao',
          titulo: `${nome} em ${o.percentual}%`,
          descricao: `Já usou ${o.percentual}% de ${nome}${sufixo}`
        });
      }
    });
  }

  function _alertasProjecao(out) {
    const proj = getProjecaoSaldo({});
    if (!proj.ficaNegativo) return;
    out.push({
      id: 'proj-neg', tipo: 'projecao', severidade: 'critico',
      titulo: 'Saldo fica negativo',
      descricao: `Saldo chega a ${Utils.formatBRL(proj.menorSaldo.valorCentavos)} em ${Utils.fmtDate(proj.menorSaldo.data)}`
    });
  }

  function _alertasFaturas(out) {
    const hoje = Utils.today();
    const mes = currentMonthPrefix();
    CartaoService.listCartoes().forEach(c => {
      [_addMonths(mes, -1), mes].forEach(comp => {
        const f = CartaoService.getFatura(c.id, comp);
        if (!f || f.paga || f.totalCentavos <= 0) return;
        const dias = Utils.diffDays(hoje, f.dataVencimento);
        if (dias < 0 || dias > Constants.FINANCE.ALERTAS.FATURA_DIAS) return;
        out.push({
          id: 'fat-' + c.id + '-' + comp, tipo: 'fatura', severidade: 'atencao',
          titulo: `Fatura ${c.nome} vence em ${Utils.fmtDate(f.dataVencimento)}`,
          descricao: `Fatura de ${Utils.formatBRL(f.totalCentavos)} vence em ${Utils.fmtDate(f.dataVencimento)}`,
          acao: { label: 'Pagar fatura', tipo: 'pagar', alvoId: c.id }
        });
      });
    });
  }

  function _alertasAssinaturas(out) {
    const hoje = Utils.today();
    const limite = Constants.FINANCE.ALERTAS.ASSINATURA_DIAS;
    listAssinaturas().forEach(r => {
      const base = r.ultimaConfirmacao || r.dataInicio || (r.criadoEm || '').slice(0, 10);
      if (!base) return;
      const dias = Utils.diffDays(base, hoje);
      if (dias < limite) return;
      const meses = Math.max(1, Math.floor(dias / 30));
      out.push({
        id: 'assin-' + r.id, tipo: 'assinatura', severidade: 'info',
        titulo: `Ainda usa ${r.descricao}?`,
        descricao: `Não confirmada há ${meses} ${meses > 1 ? 'meses' : 'mês'}`,
        acao: { label: 'Confirmar', tipo: 'confirmar', alvoId: r.id }
      });
    });
  }

  function _alertasMetas(out) {
    const semAporteMeses = Constants.FINANCE.ALERTAS.META_SEM_APORTE_MESES;
    const mesAtual = currentMonthPrefix();
    listMetas().forEach(c => {
      const m = getMetaResumo(c.id);
      if (!m || m.concluida || m.faltaCentavos <= 0 || !m.dataObjetivo) return;
      const semAporte = !m.ultimoAporte
        || _mesesEntre(m.ultimoAporte.slice(0, 7), mesAtual) >= semAporteMeses;
      const prazoVencido = m.mesesRestantes !== null && m.mesesRestantes <= 0;
      if (!semAporte && !prazoVencido) return;
      out.push({
        id: 'meta-' + c.id, tipo: 'meta', severidade: 'atencao',
        titulo: `Meta ${m.nome} atrasada`,
        descricao: `Precisa de ${Utils.formatBRL(m.aporteMensalNecessarioCentavos)}/mês pra bater o prazo`
      });
    });
  }

  /** Lista de alertas proativos do estado atual, ordenada por severidade. */
  function getAlertas() {
    const out = [];
    const mes = currentMonthPrefix();
    _alertasOrcamento(mes, out);
    _alertasProjecao(out);
    _alertasFaturas(out);
    _alertasAssinaturas(out);
    _alertasMetas(out);
    return out.sort((a, b) => _SEV_RANK[a.severidade] - _SEV_RANK[b.severidade]);
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
    _seedRelatorios(conta, desp, rec, mes);   // Fase 7a: histórico p/ gráficos
    _seedCategorizacao(conta, desp, rec, mes); // Fase 7b: descrições repetidas
    _seedPossoGastar(conta, desp, mes);        // Fase 7c: categoria perto do teto
    _seedAlertas(conta, desp, mes);            // Fase 7d: vários alertas de uma vez
  }

  /**
   * Cenário de alertas (Fase 7d): orçamento estourado, fatura vencendo em ~3 dias,
   * meta atrasada sem aporte recente. Projeção negativa e assinaturas não
   * confirmadas já vêm de _seedProjecao / _seedRecorrencias.
   */
  function _seedAlertas(conta, desp, mes) {
    // Orçamento estourado: limite bem abaixo do já gasto em Mercado/casa neste mês
    const merc = desp.find(c => c.nome === 'Mercado/casa') || desp[1];
    if (merc) setOrcamento({ categoriaId: merc.id, limiteCentavos: 20000, rollover: false });

    // Cartão com fatura aberta vencendo em ~3 dias (datas relativas a hoje)
    if (window.CartaoService && !db().cartoes.some(c => c.nome === 'Cartão Alerta')) {
      const hoje = Utils.today();
      const vencDia = Utils.parseISO(Utils.addDays(hoje, 3)).getDate();
      const cartao = CartaoService.addCartao({
        nome: 'Cartão Alerta', cor: '#ef4444', limiteCentavos: 300000,
        diaFechamento: vencDia, diaVencimento: vencDia, contaPagamentoId: conta.id
      });
      CartaoService.addCompraCartao({
        cartaoId: cartao.id, descricao: 'Compra recente',
        categoriaId: (desp[5] && desp[5].id), valorTotalCentavos: 45000, parcelas: 1, dataCompra: hoje
      });
    }

    // Meta atrasada: objetivo grande, prazo em 2 meses, único aporte há 3 meses
    if (!db().contas.some(c => c.tipo === 'meta')) {
      const meta = addConta({
        nome: 'Viagem', tipo: 'meta', icone: '✈️', cor: '#06b6d4',
        valorObjetivoCentavos: 500000, dataObjetivo: `${_addMonths(mes, 2)}-01`
      });
      addTransaction({
        tipo: 'transferencia', valorCentavos: 50000, descricao: 'Aporte inicial',
        contaId: conta.id, contaDestinoId: meta.id, data: `${_addMonths(mes, -3)}-10`, fonte: 'manual'
      });
    }
  }

  /**
   * Cenário do "Posso gastar?" (Fase 7c): orçamento de Alimentação perto do teto
   * (~90%), pra simular uma compra dar veredito significativo (aperta/estoura).
   * A projeção já tem um ponto apertado via _seedProjecao.
   */
  function _seedPossoGastar(conta, desp, mes) {
    const alim = desp.find(c => c.nome === 'Alimentação') || desp[0];
    if (!alim) return;
    setOrcamento({ categoriaId: alim.id, limiteCentavos: 50000, rollover: false });
    if (db().transacoes.some(t => t.fonte === 'seed-pg')) return;
    addTransaction({
      tipo: 'saida', valorCentavos: 42000, descricao: 'Compras alimentação',
      categoriaId: alim.id, contaId: conta.id, data: `${mes}-02`, fonte: 'seed-pg'
    });
  }

  /**
   * Histórico com descrições repetidas por categoria (Fase 7b) para testar a
   * sugestão automática: ex. 3x "iFood" em Alimentação, 2x "Posto" em Transporte.
   */
  function _seedCategorizacao(conta, desp, rec, mes) {
    if (db().transacoes.some(t => t.fonte === 'seed-cat')) return;
    const cat = nome => desp.find(c => c.nome === nome) || desp[0];
    const dia = (delta, d) => `${_addMonths(mes, delta)}-${String(d).padStart(2, '0')}`;
    [ // [deltaMes, dia, categoria, descrição, centavos]
      [-2, 7,  'Alimentação', 'iFood jantar', 4500],
      [-1, 12, 'Alimentação', 'iFood almoço', 3800],
      [-1, 25, 'Alimentação', 'iFood lanche', 2900],
      [-2, 9,  'Transporte',  'Posto Shell', 18000],
      [-1, 18, 'Transporte',  'Posto Ipiranga', 20000],
      [-1, 5,  'Mercado/casa','Mercado Extra', 23000],
      [-2, 15, 'Mercado/casa','Mercado Extra', 19500]
    ].forEach(([delta, d, c, desc, v]) => addTransaction({
      tipo: 'saida', valorCentavos: v, descricao: desc,
      categoriaId: cat(c).id, contaId: conta.id, data: dia(delta, d), fonte: 'seed-cat'
    }));
  }

  /**
   * Histórico variado dos últimos meses (Fase 7a) para os gráficos terem forma:
   * entradas nos meses sem recorrência de salário, despesas espalhadas por
   * categoria e uma compra de cartão num mês passado (prova a competência:
   * entra no mês da compra, não no do pagamento).
   */
  function _seedRelatorios(conta, desp, rec, mes) {
    if (db().transacoes.some(t => t.fonte === 'seed-rel')) return;
    const cat = nome => desp.find(c => c.nome === nome) || desp[0];
    const receita = rec[0];
    const dia = (delta, d) => `${_addMonths(mes, delta)}-${String(d).padStart(2, '0')}`;

    // Entradas nos meses sem recorrência de salário (-5, -4): evolução/taxa poupança
    [-5, -4].forEach(delta => addTransaction({
      tipo: 'entrada', valorCentavos: 580000, descricao: 'Salário',
      categoriaId: receita && receita.id, contaId: conta.id, data: dia(delta, 5), fonte: 'seed-rel'
    }));

    [ // [deltaMes, categoria, descrição, centavos, dia]
      [-5, 'Alimentação', 'Padaria', 7800, 9], [-5, 'Transporte', 'Combustível', 22000, 12],
      [-5, 'Moradia', 'Conta de luz', 18900, 18],
      [-4, 'Alimentação', 'Restaurante', 9400, 7], [-4, 'Diversão', 'Show', 12000, 14],
      [-4, 'Saúde', 'Dentista', 30000, 20],
      [-3, 'Mercado/casa', 'Mercado', 24300, 6], [-3, 'Transporte', 'Uber', 4500, 11],
      [-3, 'Diversão', 'Streaming extra', 2990, 16],
      [-2, 'Alimentação', 'Delivery', 6800, 10], [-2, 'Moradia', 'Internet', 11900, 15],
      [-2, 'Saúde', 'Farmácia', 5400, 22],
      [-1, 'Mercado/casa', 'Mercado', 26700, 4], [-1, 'Diversão', 'Cinema', 5200, 13],
      [-1, 'Transporte', 'Combustível', 21000, 19]
    ].forEach(([delta, c, d, v, day]) => addTransaction({
      tipo: 'saida', valorCentavos: v, descricao: d,
      categoriaId: cat(c).id, contaId: conta.id, data: dia(delta, day), fonte: 'seed-rel'
    }));

    // Compra de cartão num mês passado: aparece no relatório pela competência (mês da compra)
    if (window.CartaoService) {
      const cartao = CartaoService.listCartoes()[0];
      if (cartao) CartaoService.addCompraCartao({
        cartaoId: cartao.id, descricao: 'Fone bluetooth',
        categoriaId: cat('Diversão').id, valorTotalCentavos: 19900, parcelas: 1, dataCompra: dia(-2, 8)
      });
    }
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
    getSaldo, getSaldoAte, getResumoMes, currentMonthPrefix, addMonths: _addMonths, entryDates,
    getGastosPorCategoria, getEvolucaoMensal, getMaioresGastos, getComparativoMes, getTaxaPoupanca,
    sugerirCategoria, simularGasto,
    getFaturaProjetada, getProjecaoSaldo, getSaldoProjetadoFimMes,
    listOrcamentos, getOrcamentoByCategoria, setOrcamento, removeOrcamento,
    getCarryover, getOrcamentoMes, getResumoOrcamento, diasRestantesMes,
    getRecorrenciaById, listRecorrencias, addRecorrencia, updateRecorrencia,
    removeRecorrencia, toggleAtiva, confirmarAssinatura, proximaData, processarRecorrencias,
    getProximasOcorrencias, getCustoFixo, listAssinaturas,
    listMetas, getMetaResumo, getAlertas
  };
})();
