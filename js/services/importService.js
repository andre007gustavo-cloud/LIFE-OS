/**
 * ===================== IMPORT SERVICE (Fase 8) =====================
 * Cria lançamentos a partir de linhas já parseadas pelo OFXService, com:
 *   - dedup por FITID (reimportar período sobreposto não duplica);
 *   - reconstrução das parcelas FUTURAS como previstas (modelo Fase 8);
 *   - casamento de parcela prevista × real (substitui sem duplicar);
 *   - histórico de lotes para desfazer.
 *
 * Visão de competência × caixa (ver CartaoService):
 *   FATURA  → itens de cartão concretos presos a uma competência.
 *   EXTRATO → entradas/saídas numa conta; pagamento de fatura fica fora do orçamento.
 *
 * Camada de serviço: ZERO DOM. Persiste via AppState.persist().
 */

const ImportService = (() => {

  function db() {
    const d = AppState.getDB();
    if (!d.transacoes) d.transacoes = [];
    if (!d.importacoes) d.importacoes = [];     // histórico de lotes
    if (!d.parcelasPrevistas) d.parcelasPrevistas = []; // parcelas futuras reconstruídas
    return d;
  }

  // ===== Helpers comuns =====

  function fitidExiste(fitid) {
    if (!fitid) return false;
    return db().transacoes.some(t => t.fitid === fitid);
  }

  /** Chave de grupo de um parcelamento: mesmo cartão, total de parcelas e descrição base. */
  function _mesmaCompra(cartaoId, parcelaTotal, descricaoBase) {
    const base = Utils.normalizeText(descricaoBase);
    return o => o.cartaoId === cartaoId
      && o.parcelaTotal === parcelaTotal
      && Utils.normalizeText(o.descricao) === base;
  }

  function _previstoIndex(cartaoId, competencia, parcelaTotal, descricaoBase) {
    const match = _mesmaCompra(cartaoId, parcelaTotal, descricaoBase);
    return db().parcelasPrevistas.findIndex(p => match(p) && p.competencia === competencia);
  }

  function _realExiste(cartaoId, competencia, parcelaTotal, descricaoBase) {
    const match = _mesmaCompra(cartaoId, parcelaTotal, descricaoBase);
    return db().transacoes.some(t => t.faturaImportada && t.competencia === competencia && match(t));
  }

  function _grupoExistente(cartaoId, parcelaTotal, descricaoBase) {
    const match = _mesmaCompra(cartaoId, parcelaTotal, descricaoBase);
    const prev = db().parcelasPrevistas.find(match);
    if (prev) return prev.parcelaGrupo;
    const real = db().transacoes.find(t => t.faturaImportada && t.parcelaGrupo && match(t));
    return real ? real.parcelaGrupo : null;
  }

  function _registrarLote(meta) {
    db().importacoes.push({
      id: meta.importLote, tipo: meta.tipo, arquivo: meta.arquivo || '',
      alvoId: meta.alvoId || '', competencia: meta.competencia || '',
      criados: meta.criados, futurasCriadas: meta.futurasCriadas || 0,
      criadoEm: new Date().toISOString()
    });
  }

  // ===== Extrato (conta) =====

  /**
   * Importa linhas de extrato numa conta. CREDIT → entrada, DEBIT → saída.
   * Linhas de pagamento de fatura ficam com pagamentoFatura:true e sem categoria
   * (não entram no orçamento; mantêm o caixa coerente). Dedup por FITID.
   */
  function importarExtrato({ contaId, linhas, arquivo } = {}) {
    const importLote = Utils.uid();
    const incluidas = (linhas || []).filter(l => l.incluir);
    const ignorados = (linhas || []).length - incluidas.length;
    let criados = 0, duplicadosPulados = 0;
    const now = new Date().toISOString();

    incluidas.forEach(l => {
      if (fitidExiste(l.fitid)) { duplicadosPulados++; return; }
      const t = {
        id: Utils.uid(),
        tipo: l.tipoMov === 'CREDIT' ? 'entrada' : 'saida',
        valorCentavos: Math.abs(parseInt(l.valorCentavos, 10) || 0),
        descricao: (l.descricaoBase || '').trim(),
        categoriaId: l.pagamentoFatura ? '' : (l.categoriaId || ''),
        contaId, cartaoId: '', contaDestinoId: '',
        data: l.data || Utils.today(),
        fonte: 'import', fitid: l.fitid, importLote,
        criadoEm: now, atualizadoEm: now
      };
      if (l.pagamentoFatura) t.pagamentoFatura = true;
      db().transacoes.push(t);
      criados++;
    });

    _registrarLote({ importLote, tipo: 'conta', arquivo, alvoId: contaId, criados });
    AppState.persist();
    return { criados, ignorados, futurasCriadas: 0, duplicadosPulados, importLote };
  }

  // ===== Fatura (cartão) =====

  function _criarItemReal({ cartaoId, competencia, l, parcelaNum, parcelaTotal, parcelaGrupo, importLote }) {
    const now = new Date().toISOString();
    const t = {
      id: Utils.uid(),
      tipo: l.tipoMov === 'CREDIT' ? 'entrada' : 'saida',
      valorCentavos: Math.abs(parseInt(l.valorCentavos, 10) || 0),
      descricao: (l.descricaoBase || '').trim(),
      categoriaId: l.tipoMov === 'CREDIT' ? '' : (l.categoriaId || ''),
      cartaoId, contaId: '',
      faturaImportada: true, competencia,
      parcelaNum, parcelaTotal, previsto: false,
      data: l.data || `${competencia}-01`,
      fonte: 'import', fitid: l.fitid, importLote,
      criadoEm: now, atualizadoEm: now
    };
    if (parcelaGrupo) t.parcelaGrupo = parcelaGrupo;
    db().transacoes.push(t);
  }

  function _reconstruirFuturas({ cartaoId, competencia, l, parcela, parcelaGrupo, importLote }) {
    let futurasCriadas = 0;
    for (let k = parcela.num + 1; k <= parcela.total; k++) {
      const comp = FinanceService.addMonths(competencia, k - parcela.num);
      if (_previstoIndex(cartaoId, comp, parcela.total, l.descricaoBase) >= 0) continue;
      if (_realExiste(cartaoId, comp, parcela.total, l.descricaoBase)) continue;
      db().parcelasPrevistas.push({
        id: Utils.uid(), cartaoId, competencia: comp,
        descricao: (l.descricaoBase || '').trim(), categoriaId: l.categoriaId || '',
        valorCentavos: Math.abs(parseInt(l.valorCentavos, 10) || 0),
        parcelaNum: k, parcelaTotal: parcela.total, parcelaGrupo,
        previsto: true, importLote
      });
      futurasCriadas++;
    }
    return futurasCriadas;
  }

  /** Processa uma linha DEBIT parcelada: casa com a prevista, cria a real e reconstrói as futuras. */
  function _importarParcela({ cartaoId, competencia, l, importLote }) {
    const parcela = l.parcela;
    let grupo = _grupoExistente(cartaoId, parcela.total, l.descricaoBase) || Utils.uid();

    // Casamento: a parcela desta competência já existia como prevista → substitui pela real
    const idxPrev = _previstoIndex(cartaoId, competencia, parcela.total, l.descricaoBase);
    if (idxPrev >= 0) {
      grupo = db().parcelasPrevistas[idxPrev].parcelaGrupo || grupo;
      db().parcelasPrevistas.splice(idxPrev, 1);
    }

    _criarItemReal({ cartaoId, competencia, l, parcelaNum: parcela.num, parcelaTotal: parcela.total, parcelaGrupo: grupo, importLote });
    const futurasCriadas = _reconstruirFuturas({ cartaoId, competencia, l, parcela, parcelaGrupo: grupo, importLote });
    return { futurasCriadas };
  }

  /**
   * Importa as linhas de uma fatura na competência escolhida (modelo Fase 8).
   * DEBIT → item concreto; DEBIT parcelado → item + reconstrução das futuras.
   * CREDIT (pagamento/estorno) entra só se o usuário marcar (abate a fatura).
   * Dedup por FITID; casamento de parcela prevista × real.
   */
  function importarFaturaOFX({ cartaoId, competencia, linhas, arquivo } = {}) {
    const importLote = Utils.uid();
    const incluidas = (linhas || []).filter(l => l.incluir);
    const ignorados = (linhas || []).length - incluidas.length;
    let criados = 0, futurasCriadas = 0, duplicadosPulados = 0;

    incluidas.forEach(l => {
      if (fitidExiste(l.fitid)) { duplicadosPulados++; return; }
      if (l.tipoMov === 'DEBIT' && l.parcela) {
        const r = _importarParcela({ cartaoId, competencia, l, importLote });
        futurasCriadas += r.futurasCriadas;
      } else {
        _criarItemReal({ cartaoId, competencia, l, parcelaNum: 1, parcelaTotal: 1, parcelaGrupo: '', importLote });
      }
      criados++;
    });

    _registrarLote({ importLote, tipo: 'cartao', arquivo, alvoId: cartaoId, competencia, criados, futurasCriadas });
    AppState.persist();
    return { criados, ignorados, futurasCriadas, duplicadosPulados, importLote };
  }

  // ===== Histórico / desfazer =====

  function listImportacoes() {
    return db().importacoes.slice().sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  }

  /** Remove tudo que um lote criou: transações reais + parcelas previstas + o registro do histórico. */
  function desfazerImportacao(importLote) {
    if (!importLote) return false;
    const d = db();
    const tinha = d.importacoes.some(i => i.id === importLote);
    d.transacoes = d.transacoes.filter(t => t.importLote !== importLote);
    d.parcelasPrevistas = d.parcelasPrevistas.filter(p => p.importLote !== importLote);
    d.importacoes = d.importacoes.filter(i => i.id !== importLote);
    AppState.persist();
    return tinha;
  }

  return {
    fitidExiste,
    importarExtrato, importarFaturaOFX,
    listImportacoes, desfazerImportacao
  };
})();
