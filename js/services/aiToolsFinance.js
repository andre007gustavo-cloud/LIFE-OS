/**
 * ===================== AI TOOLS — FINANCE =====================
 * Ferramentas do assistente para finanças: lançamentos, transferências,
 * cartões e faturas, contas, categorias, orçamentos, recorrências, metas,
 * relatórios e projeção. Registra-se no catálogo do AiTools.
 * Dinheiro entra em REAIS e vira centavos inteiros aqui (toCentavos).
 * Knows nothing about the DOM.
 */

(() => {

  const {
    brl, toCentavos, match,
    resolveCategoria, resolveConta, resolveCartao,
    nomeCategoria, nomeConta, nomeCartao
  } = AiTools.helpers;

  const TIPOS_CONTA = ['corrente', 'poupanca', 'dinheiro', 'meta'];
  const LISTA_MAX = 50;
  const PROJECAO_EVENTOS_MAX = 30;

  const valorReais = { type: 'number', description: 'Valor em reais (ex.: 85.5 para R$ 85,50)' };
  const dataISO = { type: 'string', description: 'Data YYYY-MM-DD. Default: hoje.' };
  const mesISO = { type: 'string', description: 'YYYY-MM. Default: mês atual.' };

  // ===== Helpers =====

  function _valorPositivo(valor) {
    return toCentavos(valor) > 0 ? null : { erro: 'Informe um valor em reais maior que zero.' };
  }

  function _transacaoResumo(t) {
    return {
      id: t.id, data: t.data, tipo: t.tipo, valor: brl(t.valorCentavos),
      descricao: t.descricao, categoria: nomeCategoria(t.categoriaId) || null,
      conta: nomeConta(t.contaId) || null, contaDestino: nomeConta(t.contaDestinoId) || null,
      cartao: nomeCartao(t.cartaoId) || null, parcelas: t.parcelas || null,
      pagamentoDeFatura: !!t.pagamentoFatura
    };
  }

  function _cartaoResumo(c) {
    return {
      id: c.id, nome: c.nome, limite: brl(c.limiteCentavos),
      disponivel: brl(CartaoService.getLimiteDisponivel(c.id)),
      diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento,
      contaPagamento: nomeConta(c.contaPagamentoId) || null
    };
  }

  function _faturaResumo(f) {
    return {
      competencia: f.competencia, fechamento: f.dataFechamento, vencimento: f.dataVencimento,
      total: brl(f.totalCentavos), paga: f.paga,
      itens: f.itens.map(i => ({
        descricao: i.descricao, categoria: nomeCategoria(i.categoriaId) || null,
        parcela: i.parcelaTotal > 1 ? `${i.parcelaNum}/${i.parcelaTotal}` : null,
        valor: brl(i.valorParcelaCentavos)
      }))
    };
  }

  function _recorrenciaResumo(r) {
    return {
      id: r.id, descricao: r.descricao, tipo: r.tipo, valor: brl(r.valorCentavos),
      frequencia: r.frequencia, diaDoMes: r.diaDoMes, mesDoAno: r.mesDoAno,
      categoria: nomeCategoria(r.categoriaId) || null, conta: nomeConta(r.contaId) || null,
      cartao: nomeCartao(r.cartaoId) || null, ativa: r.ativa, assinatura: r.ehAssinatura,
      dataInicio: r.dataInicio, dataFim: r.dataFim,
      proxima: r.ativa ? FinanceService.proximaData(r, Utils.today()) : null
    };
  }

  function _metaResumo(m) {
    return {
      id: m.contaId, nome: m.nome, objetivo: brl(m.objetivoCentavos), guardado: brl(m.saldoAtualCentavos),
      falta: brl(m.faltaCentavos), prazo: m.dataObjetivo || null, mesesRestantes: m.mesesRestantes,
      aporteMensalNecessario: m.aporteMensalNecessarioCentavos === null ? null : brl(m.aporteMensalNecessarioCentavos),
      ultimoAporte: m.ultimoAporte, concluida: m.concluida
    };
  }

  /** Competência default para pagar: a última fechada (anterior à que acumula hoje). */
  function _competenciaFechada(cartao) {
    const atual = CartaoService.competenciaDaCompra(cartao, Utils.today());
    return FinanceService.addMonths(atual, -1);
  }

  /** Campos de recorrência em pt-BR do modelo → DTO do service (ou { erro }). */
  function _dtoRecorrencia(i, tipoAtual) {
    const dto = {};
    if (i.tipo !== undefined) dto.tipo = i.tipo;
    if (i.valorReais !== undefined) dto.valorCentavos = toCentavos(i.valorReais);
    ['descricao', 'frequencia', 'diaDoMes', 'mesDoAno', 'dataInicio', 'dataFim', 'ehAssinatura']
      .forEach(k => { if (i[k] !== undefined) dto[k] = i[k]; });
    if (i.categoria !== undefined) {
      const r = resolveCategoria(i.categoria, (i.tipo || tipoAtual) === 'entrada' ? 'receita' : 'despesa');
      if (r.erro) return r; dto.categoriaId = r.cat.id;
    }
    if (i.cartao) { const r = resolveCartao(i.cartao); if (r.erro) return r; dto.cartaoId = r.cartao.id; }
    if (i.conta) { const r = resolveConta(i.conta); if (r.erro) return r; dto.contaId = r.conta.id; dto.cartaoId = ''; }
    return { dto };
  }

  // ===== Leitura =====

  const LEITURA = {

    finance_overview: {
      write: false,
      schema: {
        name: 'finance_overview',
        description: 'Visão financeira do mês: resumo, saldo atual, saldo projetado, régua 50/30/20, alertas e orçamentos por categoria.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const mes = FinanceService.currentMonthPrefix();
        const resumo = FinanceService.getResumoMes(mes);
        const r = FinanceService.get503020(mes);
        const grupo = g => ({ gasto: brl(g.gastoCentavos), pct: Math.round(g.pct), alvoPct: g.alvoPct });
        return {
          mes,
          resumoMes: { entradas: brl(resumo.entradas), saidas: brl(resumo.saidas), saldo: brl(resumo.saldoMes) },
          saldoAtual: brl(FinanceService.getSaldo()),
          saldoProjetadoFimMes: brl(FinanceService.getSaldoProjetadoFimMes()),
          regra503020: {
            renda: brl(r.rendaCentavos), necessidades: grupo(r.necessidades), desejos: grupo(r.desejos),
            poupanca: { valor: brl(r.poupanca.valorCentavos), pct: Math.round(r.poupanca.pct), alvoPct: r.poupanca.alvoPct }
          },
          alertas: FinanceService.getAlertas().map(a => ({ titulo: a.titulo, descricao: a.descricao })),
          orcamentos: FinanceService.getOrcamentoMes(mes).map(o => ({
            categoria: nomeCategoria(o.categoriaId), limite: brl(o.limiteCentavos), gasto: brl(o.gastoCentavos),
            restante: brl(o.restanteCentavos), percentual: o.percentual, estado: o.estado, rollover: brl(o.carryoverCentavos)
          }))
        };
      }
    },

    get_finance_setup: {
      write: false,
      schema: {
        name: 'get_finance_setup',
        description: 'Contas (com saldo), categorias de despesa/receita e cartões (limite disponível, fechamento, vencimento). Use para escolher pelos nomes reais.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const cat = c => ({ id: c.id, nome: c.nome, grupo503020: c.grupo503020 || null });
        return {
          hoje: Utils.today(),
          contas: FinanceService.listContas().map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: brl(FinanceService.getSaldo(c.id)) })),
          categoriasDespesa: FinanceService.listCategorias('despesa').map(cat),
          categoriasReceita: FinanceService.listCategorias('receita').map(cat),
          cartoes: CartaoService.listCartoes().map(_cartaoResumo)
        };
      }
    },

    list_transactions: {
      write: false,
      schema: {
        name: 'list_transactions',
        description: `Lista lançamentos (mais recentes primeiro, até ${LISTA_MAX}). Filtros opcionais: mes, categoria, conta, cartao, busca.`,
        input_schema: {
          type: 'object',
          properties: {
            mes: mesISO,
            categoria: { type: 'string', description: 'Id ou nome da categoria' },
            conta: { type: 'string', description: 'Id ou nome da conta' },
            cartao: { type: 'string', description: 'Id ou nome do cartão' },
            busca: { type: 'string', description: 'Texto na descrição' }
          }
        }
      },
      run({ mes, categoria, conta, cartao, busca }) {
        const cat = categoria ? match(FinanceService.listCategorias(), categoria) : null;
        const ct = conta ? match(FinanceService.listContas({ incluirArquivadas: true }), conta) : null;
        const cc = cartao ? resolveCartao(cartao) : {};
        if (cc.erro) return cc;
        const ts = FinanceService.listTransactions({
          mes: mes || FinanceService.currentMonthPrefix(),
          categoriaId: cat ? cat.id : undefined, contaId: ct ? ct.id : undefined
        }).filter(t => !cc.cartao || t.cartaoId === cc.cartao.id)
          .filter(t => !busca || Utils.normalizeText(t.descricao).includes(Utils.normalizeText(busca)));
        return { total: ts.length, transacoes: ts.slice(0, LISTA_MAX).map(_transacaoResumo) };
      }
    },

    get_card_invoice: {
      write: false,
      schema: {
        name: 'get_card_invoice',
        description: 'Fatura de um cartão (itens, total, vencimento, se está paga), limite disponível e parcelas futuras. Default: a fatura que está acumulando agora.',
        input_schema: {
          type: 'object',
          properties: {
            cartao: { type: 'string', description: 'Id ou nome do cartão' },
            competencia: { type: 'string', description: 'YYYY-MM da fatura' }
          },
          required: ['cartao']
        }
      },
      run({ cartao, competencia }) {
        const r = resolveCartao(cartao); if (r.erro) return r;
        const c = r.cartao;
        const fatura = competencia ? CartaoService.getFatura(c.id, competencia) : CartaoService.getFaturaAtual(c.id);
        const parcelas = CartaoService.getParcelasComprometidas(c.id);
        return {
          cartao: _cartaoResumo(c),
          ultimaFechada: _competenciaFechada(c),
          fatura: _faturaResumo(fatura),
          parcelasFuturas: { total: brl(parcelas.totalCentavos), compras: parcelas.numCompras }
        };
      }
    },

    list_recurrences: {
      write: false,
      schema: {
        name: 'list_recurrences',
        description: 'Lista despesas/receitas fixas e assinaturas (recorrências), com a próxima data e o custo fixo mensal.',
        input_schema: {
          type: 'object',
          properties: { incluirInativas: { type: 'boolean' } }
        }
      },
      run({ incluirInativas }) {
        const fixo = FinanceService.getCustoFixo();
        return {
          custoFixoMensal: { saidas: brl(fixo.fixoMensalSaidaCentavos), entradas: brl(fixo.fixoMensalEntradaCentavos) },
          recorrencias: FinanceService.listRecorrencias(incluirInativas ? {} : { ativa: true }).map(_recorrenciaResumo)
        };
      }
    },

    list_goals: {
      write: false,
      schema: {
        name: 'list_goals',
        description: 'Lista as metas de economia (contas do tipo meta) com objetivo, quanto já foi guardado, quanto falta e o aporte mensal necessário. Aporte = add_transfer para a meta.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        return { metas: FinanceService.listMetas().map(c => _metaResumo(FinanceService.getMetaResumo(c.id))) };
      }
    },

    finance_reports: {
      write: false,
      schema: {
        name: 'finance_reports',
        description: 'Relatórios de um mês: gastos por categoria, comparação com o mês anterior, maiores gastos, taxa de poupança e evolução dos últimos 6 meses.',
        input_schema: { type: 'object', properties: { mes: mesISO } }
      },
      run({ mes }) {
        const m = mes || FinanceService.currentMonthPrefix();
        const comp = FinanceService.getComparativoMes(m);
        const pct = v => (v === null ? null : Math.round(v));
        return {
          mes: m,
          gastosPorCategoria: FinanceService.getGastosPorCategoria(m).map(g => ({ categoria: g.nome, total: brl(g.totalCentavos), pct: pct(g.percentual) })),
          vsMesAnterior: {
            total: brl(comp.totalSaidasCentavos), anterior: brl(comp.totalSaidasAnteriorCentavos), variacaoPct: pct(comp.variacaoPct),
            porCategoria: comp.porCategoria.map(c => ({ categoria: c.nome, atual: brl(c.atualCentavos), anterior: brl(c.anteriorCentavos), variacaoPct: pct(c.variacaoPct) }))
          },
          maioresGastos: FinanceService.getMaioresGastos(m).map(g => ({ descricao: g.descricao, categoria: g.categoriaNome, valor: brl(g.valorCentavos), data: g.data })),
          taxaPoupancaPct: Math.round(FinanceService.getTaxaPoupanca(m) * 100),
          evolucao: FinanceService.getEvolucaoMensal().map(e => ({ mes: e.mes, entradas: brl(e.entradasCentavos), saidas: brl(e.saidasCentavos), saldo: brl(e.saldoMesCentavos) }))
        };
      }
    },

    get_cash_projection: {
      write: false,
      schema: {
        name: 'get_cash_projection',
        description: 'Projeção do saldo em caixa (contas, sem metas) dia a dia: saldo final, menor saldo e próximos eventos (recorrências e faturas). Default: até o fim do mês.',
        input_schema: {
          type: 'object',
          properties: { ate: { type: 'string', description: 'Data final YYYY-MM-DD' } }
        }
      },
      run({ ate }) {
        const p = FinanceService.getProjecaoSaldo(ate ? { ate } : {});
        return {
          saldoHoje: brl(p.saldoInicialCentavos), saldoFinal: brl(p.saldoFinalCentavos),
          menorSaldo: { data: p.menorSaldo.data, valor: brl(p.menorSaldo.valorCentavos) },
          ficaNegativo: p.ficaNegativo,
          eventos: p.eventos.slice(0, PROJECAO_EVENTOS_MAX).map(e => ({ data: e.data, descricao: e.descricao || null, valor: brl(e.valorCentavos) }))
        };
      }
    },

    simulate_spend: {
      write: false,
      schema: {
        name: 'simulate_spend',
        description: 'Simula se o André pode fazer uma compra (sem salvar nada). Diz se pode gastar, se aperta o orçamento ou se deixa o saldo negativo.',
        input_schema: {
          type: 'object',
          properties: {
            valorReais: { type: 'number', description: 'Valor da compra em reais' },
            categoria: { type: 'string', description: 'Nome ou id da categoria de despesa (opcional)' },
            cartao: { type: 'string', description: 'Nome ou id do cartão (opcional). Se ausente, simula no caixa/conta.' },
            parcelas: { type: 'number', description: 'Nº de parcelas no cartão (default 1)' }
          },
          required: ['valorReais']
        }
      },
      run({ valorReais, categoria, cartao, parcelas }) {
        const invalido = _valorPositivo(valorReais); if (invalido) return invalido;
        let categoriaId = '', cartaoId = '', contaId = '';
        if (categoria) { const r = resolveCategoria(categoria, 'despesa'); if (r.erro) return r; categoriaId = r.cat.id; }
        if (cartao) { const r = resolveCartao(cartao); if (r.erro) return r; cartaoId = r.cartao.id; }
        else { const r = resolveConta(null); contaId = r.conta ? r.conta.id : ''; }
        const sim = FinanceService.simularGasto({
          valorCentavos: toCentavos(valorReais), categoriaId, contaId, cartaoId,
          parcelas: Math.max(1, parseInt(parcelas, 10) || 1)
        });
        return {
          valor: brl(toCentavos(valorReais)), veredito: sim.veredito.mensagem, nivel: sim.veredito.nivel,
          saldoFimMesAntes: brl(sim.projecao.saldoFimMesAntesCentavos),
          saldoFimMesDepois: brl(sim.projecao.saldoFimMesDepoisCentavos),
          ficaNegativo: sim.projecao.ficaNegativoDepois,
          orcamento: sim.orcamento && sim.orcamento.temOrcamento ? {
            categoria: sim.orcamento.categoriaNome, percentualDepois: sim.orcamento.percentualDepois,
            restanteDepois: brl(sim.orcamento.restanteDepoisCentavos)
          } : null
        };
      }
    }
  };

  // ===== Lançamentos =====

  const LANCAMENTOS = {

    add_transaction: {
      write: true,
      schema: {
        name: 'add_transaction',
        description: 'Lança uma entrada (receita) ou saída (despesa) numa conta. Compra no cartão de crédito vai em add_card_purchase; entre contas, add_transfer.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['entrada', 'saida'] },
            valorReais,
            descricao: { type: 'string' },
            categoria: { type: 'string', description: 'Nome ou id da categoria (de receita se entrada, de despesa se saída)' },
            conta: { type: 'string', description: 'Nome ou id da conta. Default: primeira conta.' },
            data: dataISO
          },
          required: ['tipo', 'valorReais', 'descricao']
        }
      },
      run({ tipo, valorReais, descricao, categoria, conta, data }) {
        if (tipo !== 'entrada' && tipo !== 'saida') return { erro: 'tipo deve ser "entrada" ou "saida".' };
        const invalido = _valorPositivo(valorReais); if (invalido) return invalido;
        let categoriaId = '';
        if (categoria) {
          const r = resolveCategoria(categoria, tipo === 'entrada' ? 'receita' : 'despesa');
          if (r.erro) return r; categoriaId = r.cat.id;
        }
        const rc = resolveConta(conta); if (rc.erro) return rc;
        const t = FinanceService.addTransaction({
          tipo, valorCentavos: toCentavos(valorReais), descricao, categoriaId, contaId: rc.conta.id, data: data || Utils.today()
        });
        return { ok: true, lancamento: _transacaoResumo(t) };
      }
    },

    add_card_purchase: {
      write: true,
      schema: {
        name: 'add_card_purchase',
        description: 'Lança uma compra no cartão de crédito (à vista ou parcelada). valorReais é o valor TOTAL; o app divide nas faturas.',
        input_schema: {
          type: 'object',
          properties: {
            cartao: { type: 'string', description: 'Nome ou id do cartão' },
            valorReais,
            parcelas: { type: 'number', description: 'Nº de parcelas (default 1)' },
            descricao: { type: 'string' },
            categoria: { type: 'string', description: 'Nome ou id da categoria de despesa' },
            data: dataISO
          },
          required: ['cartao', 'valorReais', 'descricao']
        }
      },
      run({ cartao, valorReais, parcelas, descricao, categoria, data }) {
        const invalido = _valorPositivo(valorReais); if (invalido) return invalido;
        const rc = resolveCartao(cartao); if (rc.erro) return rc;
        let categoriaId = '';
        if (categoria) { const r = resolveCategoria(categoria, 'despesa'); if (r.erro) return r; categoriaId = r.cat.id; }
        const t = CartaoService.addCompraCartao({
          cartaoId: rc.cartao.id, descricao, categoriaId, valorTotalCentavos: toCentavos(valorReais),
          parcelas: Math.max(1, parseInt(parcelas, 10) || 1), dataCompra: data || Utils.today()
        });
        return { ok: true, lancamento: _transacaoResumo(t), fatura: CartaoService.competenciaDaCompra(rc.cartao, t.data) };
      }
    },

    add_transfer: {
      write: true,
      schema: {
        name: 'add_transfer',
        description: 'Transfere dinheiro entre duas contas (inclusive aporte ou resgate de uma meta). Não conta como receita nem despesa.',
        input_schema: {
          type: 'object',
          properties: {
            origem: { type: 'string', description: 'Conta de origem (nome ou id)' },
            destino: { type: 'string', description: 'Conta de destino (nome ou id)' },
            valorReais,
            descricao: { type: 'string' },
            data: dataISO
          },
          required: ['origem', 'destino', 'valorReais']
        }
      },
      run({ origem: de, destino: para, valorReais, descricao, data }) {
        if (!de || !para) return { erro: 'Informe a conta de origem e a de destino.' };
        const invalido = _valorPositivo(valorReais); if (invalido) return invalido;
        const origem = resolveConta(de, { incluirMetas: true }); if (origem.erro) return origem;
        const destino = resolveConta(para, { incluirMetas: true }); if (destino.erro) return destino;
        if (origem.conta.id === destino.conta.id) return { erro: 'Origem e destino precisam ser contas diferentes.' };
        const t = FinanceService.addTransaction({
          tipo: 'transferencia', valorCentavos: toCentavos(valorReais), descricao: descricao || 'Transferência',
          contaId: origem.conta.id, contaDestinoId: destino.conta.id, data: data || Utils.today()
        });
        return { ok: true, lancamento: _transacaoResumo(t) };
      }
    },

    update_transaction: {
      write: true,
      schema: {
        name: 'update_transaction',
        description: 'Edita um lançamento. Em patch use: valorReais, descricao, tipo (entrada|saida), categoria, conta, data.',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' }, patch: { type: 'object' } },
          required: ['id', 'patch']
        }
      },
      run({ id, patch }) {
        const orig = FinanceService.getTransacaoById(id);
        if (!orig) return { erro: 'Lançamento não encontrado.' };
        const p = patch || {};
        const desconhecido = Object.keys(p).find(k => !['valorReais', 'descricao', 'tipo', 'categoria', 'conta', 'data'].includes(k));
        if (desconhecido) return { erro: `Campo "${desconhecido}" não existe. Use: valorReais, descricao, tipo, categoria, conta, data.` };
        if (p.tipo !== undefined && !['entrada', 'saida'].includes(p.tipo)) return { erro: 'tipo deve ser "entrada" ou "saida".' };
        if (p.valorReais !== undefined) { const inv = _valorPositivo(p.valorReais); if (inv) return inv; }
        const out = {};
        if (p.valorReais !== undefined) out.valorCentavos = toCentavos(p.valorReais);
        ['descricao', 'tipo', 'data'].forEach(k => { if (p[k] !== undefined) out[k] = p[k]; });
        if (p.categoria !== undefined) {
          const r = resolveCategoria(p.categoria, (p.tipo || orig.tipo) === 'entrada' ? 'receita' : 'despesa');
          if (r.erro) return r; out.categoriaId = r.cat.id;
        }
        if (p.conta !== undefined) { const r = resolveConta(p.conta); if (r.erro) return r; out.contaId = r.conta.id; }
        return { ok: true, lancamento: _transacaoResumo(FinanceService.updateTransaction(id, out)) };
      }
    },

    delete_transaction: {
      write: true,
      schema: {
        name: 'delete_transaction',
        description: 'Exclui um lançamento pelo id (use list_transactions para achar). Se for pagamento de fatura, desfaz o pagamento (a fatura volta a ficar em aberto).',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      },
      run({ id }) {
        const t = FinanceService.getTransacaoById(id);
        if (!t) return { erro: 'Lançamento não encontrado.' };
        const fp = t.pagamentoFatura && (AppState.getDB().faturaPagamentos || []).find(p => p.transacaoId === id);
        if (fp) CartaoService.desfazerPagamento(fp.cartaoId, fp.competencia);
        else FinanceService.deleteTransaction(id);
        return { ok: true, excluido: _transacaoResumo(t), pagamentoDesfeito: !!fp };
      }
    },

    pay_card_invoice: {
      write: true,
      schema: {
        name: 'pay_card_invoice',
        description: 'Registra o pagamento de uma fatura (sai da conta, não conta no orçamento). Default: a última fatura fechada, valor total, conta de pagamento do cartão.',
        input_schema: {
          type: 'object',
          properties: {
            cartao: { type: 'string', description: 'Nome ou id do cartão' },
            competencia: { type: 'string', description: 'YYYY-MM da fatura' },
            valorReais: { type: 'number', description: 'Default: total da fatura' },
            conta: { type: 'string', description: 'Conta que paga' },
            data: dataISO
          },
          required: ['cartao']
        }
      },
      run({ cartao, competencia, valorReais, conta, data }) {
        const rc = resolveCartao(cartao); if (rc.erro) return rc;
        const comp = competencia || _competenciaFechada(rc.cartao);
        const fatura = CartaoService.getFatura(rc.cartao.id, comp);
        if (fatura.paga) return { erro: `A fatura ${comp} do ${rc.cartao.nome} já está paga.` };
        const valorCentavos = valorReais !== undefined ? toCentavos(valorReais) : fatura.totalCentavos;
        if (valorCentavos <= 0) return { erro: `A fatura ${comp} está zerada; informe valorReais se quiser registrar mesmo assim.` };
        const ct = resolveConta(conta || rc.cartao.contaPagamentoId); if (ct.erro) return ct;
        CartaoService.pagarFatura({ cartaoId: rc.cartao.id, competencia: comp, contaId: ct.conta.id, valorCentavos, data: data || Utils.today() });
        return { ok: true, cartao: rc.cartao.nome, competencia: comp, valor: brl(valorCentavos), conta: ct.conta.nome };
      }
    },

    undo_invoice_payment: {
      write: true,
      schema: {
        name: 'undo_invoice_payment',
        description: 'Desfaz o pagamento de uma fatura (remove o lançamento de pagamento; a fatura volta a ficar em aberto).',
        input_schema: {
          type: 'object',
          properties: { cartao: { type: 'string' }, competencia: { type: 'string', description: 'YYYY-MM' } },
          required: ['cartao', 'competencia']
        }
      },
      run({ cartao, competencia }) {
        const rc = resolveCartao(cartao); if (rc.erro) return rc;
        const ok = CartaoService.desfazerPagamento(rc.cartao.id, competencia);
        return ok ? { ok: true, cartao: rc.cartao.nome, competencia } : { erro: `A fatura ${competencia} não tem pagamento registrado.` };
      }
    }
  };

  // ===== Cadastros =====

  const CADASTROS = {

    manage_account: {
      write: true,
      schema: {
        name: 'manage_account',
        description: 'Cria, edita ou arquiva uma conta. tipo "meta" = meta de economia (com objetivo e prazo).',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'arquivar'] },
            conta: { type: 'string', description: 'Id ou nome (editar/arquivar)' },
            nome: { type: 'string' },
            tipo: { type: 'string', enum: TIPOS_CONTA },
            saldoInicialReais: { type: 'number' },
            objetivoReais: { type: 'number', description: 'Só para meta' },
            dataObjetivo: { type: 'string', description: 'Prazo da meta YYYY-MM-DD' },
            icone: { type: 'string' }
          },
          required: ['acao']
        }
      },
      run(i) {
        if (i.tipo !== undefined && !TIPOS_CONTA.includes(i.tipo)) return { erro: `tipo deve ser: ${TIPOS_CONTA.join(', ')}.` };
        const campos = {};
        if (i.nome !== undefined) campos.nome = i.nome;
        if (i.tipo !== undefined) campos.tipo = i.tipo;
        if (i.icone !== undefined) campos.icone = i.icone;
        if (i.saldoInicialReais !== undefined) campos.saldoInicialCentavos = toCentavos(i.saldoInicialReais);
        if (i.objetivoReais !== undefined) campos.valorObjetivoCentavos = toCentavos(i.objetivoReais);
        if (i.dataObjetivo !== undefined) campos.dataObjetivo = i.dataObjetivo;
        if (i.acao === 'criar') {
          if (!i.nome) return { erro: 'Informe o nome da conta.' };
          const c = FinanceService.addConta(campos);
          return { ok: true, id: c.id, nome: c.nome, tipo: c.tipo };
        }
        const r = match(FinanceService.listContas(), i.conta);
        if (!r) return { erro: `Conta "${i.conta}" não encontrada.` };
        if (i.acao === 'arquivar') { FinanceService.arquivarConta(r.id); return { ok: true, arquivada: r.nome }; }
        const c = FinanceService.updateConta(r.id, campos);
        return { ok: true, id: c.id, nome: c.nome, tipo: c.tipo, saldo: brl(FinanceService.getSaldo(c.id)) };
      }
    },

    manage_category: {
      write: true,
      schema: {
        name: 'manage_category',
        description: 'Cria, edita ou arquiva uma categoria. O tipo (despesa/receita) não muda depois de criada. grupo503020 vale só para despesa.',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'arquivar'] },
            categoria: { type: 'string', description: 'Id ou nome (editar/arquivar)' },
            nome: { type: 'string' },
            tipo: { type: 'string', enum: ['despesa', 'receita'] },
            grupo503020: { type: 'string', enum: ['necessidade', 'desejo'] },
            icone: { type: 'string' }
          },
          required: ['acao']
        }
      },
      run({ acao, categoria, nome, tipo, grupo503020, icone }) {
        if (acao === 'criar') {
          if (!nome) return { erro: 'Informe o nome da categoria.' };
          const c = FinanceService.addCategoria({ nome, tipo: tipo === 'receita' ? 'receita' : 'despesa', icone: icone || '📦', grupo503020 });
          return { ok: true, id: c.id, nome: c.nome, tipo: c.tipo };
        }
        const cat = match(FinanceService.listCategorias(tipo), categoria);
        if (!cat) return { erro: `Categoria "${categoria}" não encontrada.` };
        if (acao === 'arquivar') { FinanceService.arquivarCategoria(cat.id); return { ok: true, arquivada: cat.nome }; }
        const campos = {};
        if (nome !== undefined) campos.nome = nome;
        if (icone !== undefined) campos.icone = icone;
        if (grupo503020 !== undefined) campos.grupo503020 = grupo503020;
        const c = FinanceService.updateCategoria(cat.id, campos);
        return { ok: true, id: c.id, nome: c.nome, grupo503020: c.grupo503020 || null };
      }
    },

    manage_card: {
      write: true,
      schema: {
        name: 'manage_card',
        description: 'Cria, edita ou arquiva um cartão de crédito.',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'arquivar'] },
            cartao: { type: 'string', description: 'Id ou nome (editar/arquivar)' },
            nome: { type: 'string' },
            limiteReais: { type: 'number' },
            diaFechamento: { type: 'number', description: '1–31' },
            diaVencimento: { type: 'number', description: '1–31' },
            contaPagamento: { type: 'string', description: 'Conta que paga a fatura (nome ou id)' }
          },
          required: ['acao']
        }
      },
      run(i) {
        const campos = {};
        if (i.nome !== undefined) campos.nome = i.nome;
        if (i.limiteReais !== undefined) campos.limiteCentavos = toCentavos(i.limiteReais);
        if (i.diaFechamento !== undefined) campos.diaFechamento = i.diaFechamento;
        if (i.diaVencimento !== undefined) campos.diaVencimento = i.diaVencimento;
        if (i.contaPagamento) { const r = resolveConta(i.contaPagamento); if (r.erro) return r; campos.contaPagamentoId = r.conta.id; }
        if (i.acao === 'criar') {
          if (!i.nome || !i.diaFechamento || !i.diaVencimento) return { erro: 'Para criar, informe nome, diaFechamento e diaVencimento.' };
          return { ok: true, cartao: _cartaoResumo(CartaoService.addCartao(campos)) };
        }
        const r = resolveCartao(i.cartao); if (r.erro) return r;
        if (i.acao === 'arquivar') { CartaoService.arquivarCartao(r.cartao.id); return { ok: true, arquivado: r.cartao.nome }; }
        return { ok: true, cartao: _cartaoResumo(CartaoService.updateCartao(r.cartao.id, campos)) };
      }
    },

    set_budget: {
      write: true,
      schema: {
        name: 'set_budget',
        description: 'Define (ou remove, com remover=true) o orçamento mensal de uma categoria de despesa. rollover = sobra/estouro passa para o mês seguinte.',
        input_schema: {
          type: 'object',
          properties: {
            categoria: { type: 'string', description: 'Nome ou id da categoria de despesa' },
            limiteReais: { type: 'number' },
            rollover: { type: 'boolean' },
            remover: { type: 'boolean' }
          },
          required: ['categoria']
        }
      },
      run({ categoria, limiteReais, rollover, remover }) {
        const r = resolveCategoria(categoria, 'despesa'); if (r.erro) return r;
        if (remover) { FinanceService.removeOrcamento(r.cat.id); return { ok: true, removido: r.cat.nome }; }
        const atual = FinanceService.getOrcamentoByCategoria(r.cat.id);
        if (limiteReais === undefined && !atual) return { erro: 'Informe limiteReais.' };
        const o = FinanceService.setOrcamento({
          categoriaId: r.cat.id,
          limiteCentavos: limiteReais !== undefined ? toCentavos(limiteReais) : atual.limiteCentavos,
          rollover: rollover !== undefined ? rollover : !!(atual && atual.rollover)
        });
        return { ok: true, categoria: r.cat.nome, limite: brl(o.limiteCentavos), rollover: o.rollover };
      }
    },

    manage_recurrence: {
      write: true,
      schema: {
        name: 'manage_recurrence',
        description: 'Gerencia despesas/receitas fixas e assinaturas. Use conta OU cartao (assinatura no cartão entra na fatura). Ao criar/reativar, lança as ocorrências que já venceram, como o app faz.',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'pausar', 'reativar', 'remover', 'confirmar_assinatura'] },
            id: { type: 'string', description: 'Id da recorrência (exceto criar; veja list_recurrences)' },
            tipo: { type: 'string', enum: ['entrada', 'saida'] },
            valorReais,
            descricao: { type: 'string' },
            categoria: { type: 'string' },
            conta: { type: 'string' },
            cartao: { type: 'string' },
            frequencia: { type: 'string', enum: ['mensal', 'anual'] },
            diaDoMes: { type: 'number', description: '1–31' },
            mesDoAno: { type: 'number', description: '1–12 (anual)' },
            dataInicio: dataISO,
            dataFim: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
            ehAssinatura: { type: 'boolean' }
          },
          required: ['acao']
        }
      },
      run(i) {
        if (i.acao === 'criar') {
          if (!i.descricao || i.valorReais === undefined) return { erro: 'Para criar, informe descricao e valorReais.' };
          const inv = _valorPositivo(i.valorReais); if (inv) return inv;
          const r = _dtoRecorrencia(i, i.tipo || 'saida'); if (r.erro) return r;
          if (!r.dto.contaId && !r.dto.cartaoId) { const c = resolveConta(null); if (c.erro) return c; r.dto.contaId = c.conta.id; }
          const rec = FinanceService.addRecorrencia(r.dto);
          FinanceService.processarRecorrencias();
          return { ok: true, recorrencia: _recorrenciaResumo(rec) };
        }
        const rec = FinanceService.getRecorrenciaById(i.id);
        if (!rec) return { erro: 'Recorrência não encontrada (use list_recurrences para o id).' };
        if (i.acao === 'remover') { FinanceService.removeRecorrencia(rec.id); return { ok: true, removida: rec.descricao }; }
        if (i.acao === 'confirmar_assinatura') { FinanceService.confirmarAssinatura(rec.id); return { ok: true, confirmada: rec.descricao }; }
        if (i.acao === 'pausar' || i.acao === 'reativar') {
          if (rec.ativa !== (i.acao === 'reativar')) FinanceService.toggleAtiva(rec.id);
          FinanceService.processarRecorrencias();
          return { ok: true, recorrencia: _recorrenciaResumo(rec) };
        }
        const r = _dtoRecorrencia(i, rec.tipo); if (r.erro) return r;
        FinanceService.updateRecorrencia(rec.id, r.dto);
        FinanceService.processarRecorrencias();
        return { ok: true, recorrencia: _recorrenciaResumo(rec) };
      }
    }
  };

  AiTools.register({ ...LEITURA, ...LANCAMENTOS, ...CADASTROS });
})();
