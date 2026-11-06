/**
 * ===================== AI TOOLS — VEHICLE =====================
 * Ferramentas do assistente para o veículo: ficha, manutenções, peças,
 * odômetro e vínculo de pagamentos. Registra-se no catálogo do AiTools.
 * Dinheiro entra e sai em REAIS (números); por dentro são centavos inteiros.
 * Nenhuma ferramenta cria lançamento sozinha, exceto link_maintenance_payment
 * com acao "lancar" (pedida explicitamente). Knows nothing about the DOM.
 */

(() => {

  const {
    norm, toCentavos, toReais, resolveCategoria, resolveConta, resolveCartao, resolveProjeto, nomeProjeto
  } = AiTools.helpers;

  const { CATEGORIES, ZONES, RECENT_MAINTENANCES, CARD_PREFIX } = Constants.VEHICLE;
  const AVISO_SEM_LANCAMENTO = 'Nenhum lançamento foi criado nas Finanças. Pergunte ao André se alguma sugestão de vínculo é o pagamento, ou se quer lançar agora (link_maintenance_payment).';

  const veiculoParam = { type: 'string', description: 'Id do veículo, id ou nome do projeto. Opcional se houver só um veículo.' };
  const dataISO = { type: 'string', description: 'Data YYYY-MM-DD' };
  const listaCategorias = CATEGORIES.map(c => c.label).join(', ');
  const listaZonas = ZONES.map(z => z.label).join(', ');

  const pecaSchema = {
    type: 'object',
    properties: {
      nome: { type: 'string' },
      marca: { type: 'string' },
      codigo: { type: 'string', description: 'Código/referência da peça' },
      loja: { type: 'string', description: 'Onde comprou' },
      qtd: { type: 'integer', description: 'Quantidade (default 1)' },
      precoReais: { type: 'number', description: 'Preço TOTAL da linha (qtd × unitário), em reais' },
      garantiaAte: { type: 'string', description: 'Fim da garantia YYYY-MM-DD' }
    },
    required: ['nome']
  };

  const manutencaoProps = {
    data: dataISO,
    km: { type: 'integer', description: 'Km do odômetro no serviço' },
    titulo: { type: 'string', description: 'Ex.: "Troca de pastilhas de freio"' },
    categoria: { type: 'string', description: `Categoria (id ou nome): ${listaCategorias}` },
    zonas: { type: 'array', items: { type: 'string' }, description: `Zonas do carro (id ou nome): ${listaZonas}` },
    oficina: { type: 'string' },
    pecas: { type: 'array', items: pecaSchema, description: 'Peças usadas' },
    maoDeObraReais: { type: 'number', description: 'Mão de obra em reais' },
    obs: { type: 'string' }
  };

  // ===== Conversões =====

  const _label = (lista, id) => (lista.find(x => x.id === id) || {}).label || id;
  const _haDias = data => Math.max(0, Utils.diffDays(data, Utils.today()));
  const _haKm = (km, kmAtual) => (Number.isInteger(km) && kmAtual != null ? Math.max(0, kmAtual - km) : null);

  // ===== Resolução =====

  const _rotuloVeiculo = v => `${v.nickname || v.model} (projeto ${nomeProjeto(v.projectId)}, id ${v.id})`;

  function _acharVeiculo(valor) {
    const veiculos = VehicleService.list();
    const alvo = norm(valor);
    return veiculos.find(v => v.id === valor || v.projectId === valor)
      || veiculos.find(v => norm(nomeProjeto(v.projectId)) === alvo || norm(v.nickname) === alvo)
      || null;
  }

  /** Id do veículo, id/nome do projeto, ou o único veículo quando nada é informado. */
  function _resolveVeiculo(valor) {
    const veiculos = VehicleService.list();
    if (!valor && veiculos.length === 1) return { veiculo: veiculos[0] };
    const veiculo = valor ? _acharVeiculo(valor) : null;
    if (veiculo) return { veiculo };
    if (!veiculos.length) return { erro: 'Nenhum veículo cadastrado. Crie um projeto com template "vehicle" e use update_vehicle_sheet.' };
    const prefixo = valor ? `Veículo "${valor}" não encontrado` : 'Há mais de um veículo; informe qual';
    return { erro: `${prefixo}. Opções: ${veiculos.map(_rotuloVeiculo).join('; ')}` };
  }

  /** Acha a manutenção; sem veículo informado, procura em todos os veículos. */
  function _resolveManutencao(veiculoParamValor, manutencaoId) {
    if (!manutencaoId) return { erro: 'Informe manutencaoId (veja search_maintenance).' };
    const candidatos = veiculoParamValor ? [_resolveVeiculo(veiculoParamValor)] : VehicleService.list().map(veiculo => ({ veiculo }));
    const erro = candidatos.find(c => c.erro);
    if (erro) return erro;
    for (const { veiculo } of candidatos) {
      const manutencao = veiculo.maintenances.find(m => m.id === manutencaoId);
      if (manutencao) return { veiculo, manutencao };
    }
    return { erro: `Manutenção "${manutencaoId}" não encontrada (veja search_maintenance).` };
  }

  /** Categoria/zona por id ou rótulo, sem acento nem caixa. */
  function _resolveOpcao(valor, lista, rotulo) {
    const alvo = norm(valor);
    const achada = lista.find(x => x.id === valor || norm(x.id) === alvo || norm(x.label) === alvo);
    if (achada) return { id: achada.id };
    return { erro: `${rotulo} "${valor}" não existe. Opções: ${lista.map(x => x.label).join(', ')}` };
  }

  function _resolveZonas(zonas) {
    if (!Array.isArray(zonas)) return { erro: 'zonas deve ser uma lista' };
    const resolvidas = zonas.map(z => _resolveOpcao(z, ZONES, 'Zona'));
    return resolvidas.find(r => r.erro) || { ids: resolvidas.map(r => r.id) };
  }

  // ===== Saídas =====

  function _pecaSaida(peca) {
    const garantiaAte = peca.warrantyUntil || null;
    return {
      nome: peca.name, marca: peca.brand || null, codigo: peca.code || null, loja: peca.store || null,
      qtd: peca.qty, precoReais: toReais(peca.priceCentavos),
      garantiaAte, dentroDaGarantia: garantiaAte ? garantiaAte >= Utils.today() : null
    };
  }

  function _manutencaoSaida(m, kmAtual) {
    return {
      id: m.id, data: m.date, haDias: _haDias(m.date), km: m.km ?? null, haKm: _haKm(m.km, kmAtual),
      titulo: m.title, categoria: _label(CATEGORIES, m.category), zonas: m.zones.map(z => _label(ZONES, z)),
      oficina: m.shop || null, pecas: m.parts.map(_pecaSaida),
      maoDeObraReais: toReais(m.laborCentavos), totalReais: toReais(VehicleService.maintenanceTotal(m)),
      obs: m.notes || null, lancamentosVinculados: m.transactionIds.length
    };
  }

  function _fichaSaida(v) {
    return {
      id: v.id, projeto: { id: v.projectId, nome: nomeProjeto(v.projectId) },
      apelido: v.nickname || null, marca: v.make || null, modelo: v.model || null, versao: v.trim || null,
      cor: v.color || null, placa: v.plate || null, anoFabricacao: v.yearMade ?? null, anoModelo: v.yearModel ?? null,
      dataCompra: v.purchaseDate || null, kmCompra: v.purchaseKm ?? null
    };
  }

  function _resumoSaida(resumo) {
    const ultimo = resumo.lastService;
    return {
      totalReais: toReais(resumo.totalCentavos), noAnoReais: toReais(resumo.yearCentavos), quantidade: resumo.count,
      custoPorKmReais: toReais(resumo.costPerKmCentavos), custoPor1000KmReais: toReais(resumo.costPer1000KmCentavos),
      porCategoriaReais: Object.fromEntries(Object.entries(resumo.byCategory).map(([id, c]) => [_label(CATEGORIES, id), toReais(c)])),
      ultimoServico: ultimo && { titulo: ultimo.title, data: ultimo.date, haDias: ultimo.daysAgo, haKm: ultimo.kmAgo }
    };
  }

  function _sugestaoSaida(s) {
    return {
      transacaoId: s.transactionId, data: s.data, valorReais: toReais(s.valorCentavos),
      descricao: s.descricao, contaOuCartao: s.contaOuCartao, motivo: s.reason
    };
  }

  function _lancamentosVinculados(veiculoId, manutencaoId) {
    return VehicleFinanceService.getLinkedTransactions(veiculoId, manutencaoId).map(l => (l.missing
      ? { transacaoId: l.transactionId, apagado: true }
      : { transacaoId: l.transactionId, data: l.data, valorReais: toReais(l.valorCentavos), descricao: l.descricao, contaOuCartao: l.contaOuCartao }));
  }

  // ===== Entrada: manutenção =====

  const _definido = valor => valor !== undefined;

  function _pecaEntrada(p) {
    return {
      name: p.nome, brand: p.marca, code: p.codigo, store: p.loja, qty: p.qtd,
      priceCentavos: _definido(p.precoReais) ? toCentavos(p.precoReais) : undefined,
      warrantyUntil: p.garantiaAte
    };
  }

  function _dtoCategoriaEZonas(input) {
    const dto = {};
    if (_definido(input.categoria)) {
      const r = _resolveOpcao(input.categoria, CATEGORIES, 'Categoria');
      if (r.erro) return r;
      dto.category = r.id;
    }
    if (input.zonas != null) {
      const r = _resolveZonas(input.zonas);
      if (r.erro) return r;
      dto.zones = r.ids;
    }
    return dto;
  }

  /** Traduz os campos em pt-BR para o modelo do service; só o que foi informado. */
  function _dtoManutencao(input) {
    const extras = _dtoCategoriaEZonas(input);
    if (extras.erro) return extras;
    const dto = {
      date: input.data, km: input.km, title: input.titulo, shop: input.oficina, notes: input.obs,
      ...extras,
      parts: Array.isArray(input.pecas) ? input.pecas.map(_pecaEntrada) : input.pecas,
      laborCentavos: _definido(input.maoDeObraReais) ? toCentavos(input.maoDeObraReais) : undefined
    };
    return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
  }

  // ===== Leitura =====

  function _removerLeitura(veiculo, data) {
    const leitura = veiculo.odometer.find(l => l.date === data);
    if (!leitura) return { erro: `Não há leitura do odômetro em ${data}.` };
    const removida = VehicleService.removeOdometer(veiculo.id, leitura.id);
    return removida.erro ? removida : { ok: true, removida: { data: leitura.date, km: leitura.km }, kmAtual: VehicleService.getCurrentKm(veiculo) };
  }

  const LEITURA = {

    get_vehicle: {
      write: false,
      schema: {
        name: 'get_vehicle',
        description: 'Ficha do veículo (apelido, marca, modelo, anos, placa), km atual, resumo de gastos em reais (total, no ano, custo por km e por 1.000 km), oficinas e as últimas manutenções.',
        input_schema: { type: 'object', properties: { veiculo: veiculoParam } }
      },
      run({ veiculo }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const v = r.veiculo;
        const resumo = VehicleService.getSummary(v.id);
        return {
          ficha: _fichaSaida(v), kmAtual: resumo.currentKm, resumo: _resumoSaida(resumo),
          oficinas: VehicleService.getShops(v.id).map(o => ({ nome: o.name, visitas: o.visits, ultimaVisita: o.lastVisit, totalReais: toReais(o.totalCentavos) })),
          ultimasManutencoes: VehicleService.listMaintenances(v.id).slice(0, RECENT_MAINTENANCES).map(m => _manutencaoSaida(m, resumo.currentKm))
        };
      }
    },

    search_maintenance: {
      write: false,
      schema: {
        name: 'search_maintenance',
        description: 'Busca no histórico de manutenções (mais recentes primeiro). Cada resultado traz há quantos dias e km foi feito, total em reais, peças e a situação da garantia de cada peça. Use para "quando troquei X?", "o que já fiz na dianteira?" e diagnósticos.',
        input_schema: {
          type: 'object',
          properties: {
            veiculo: veiculoParam,
            texto: { type: 'string', description: 'Palavras buscadas no título, peças, marca, código, loja, oficina e obs (sem acento)' },
            categoria: { type: 'string', description: `Id ou nome: ${listaCategorias}` },
            zona: { type: 'string', description: `Id ou nome: ${listaZonas}` },
            de: dataISO,
            ate: dataISO
          }
        }
      },
      run({ veiculo, texto, categoria, zona, de, ate }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const filtros = { text: texto, from: de, to: ate };
        if (categoria) { const c = _resolveOpcao(categoria, CATEGORIES, 'Categoria'); if (c.erro) return c; filtros.category = c.id; }
        if (zona) { const z = _resolveOpcao(zona, ZONES, 'Zona'); if (z.erro) return z; filtros.zone = z.id; }
        const lista = VehicleService.listMaintenances(r.veiculo.id, filtros);
        if (lista.erro) return lista;
        const kmAtual = VehicleService.getCurrentKm(r.veiculo);
        return { kmAtual, total: lista.length, manutencoes: lista.map(m => _manutencaoSaida(m, kmAtual)) };
      }
    },

    get_parts_notebook: {
      write: false,
      schema: {
        name: 'get_parts_notebook',
        description: 'Caderno de peças do veículo: cada peça (agrupada por código ou nome) com marca, código, loja, última troca, quantas vezes foi trocada, histórico de preço unitário em reais e situação da garantia.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, texto: { type: 'string', description: 'Filtra por nome, marca, código ou loja' } }
        }
      },
      run({ veiculo, texto }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const itens = VehicleService.getPartsNotebook(r.veiculo.id, { text: texto });
        return { total: itens.length, pecas: itens.map(_cadernoItemSaida) };
      }
    }
  };

  function _cadernoItemSaida(item) {
    const { lastUse: u, warranty: g } = item;
    return {
      nome: item.name, codigo: item.code || null, vezesTrocada: item.timesReplaced,
      ultimaTroca: { manutencaoId: u.maintenanceId, data: u.date, km: u.km, marca: u.brand || null, loja: u.store || null, qtd: u.qty, precoUnitarioReais: toReais(u.unitPriceCentavos) },
      historicoDePreco: item.priceHistory.map(h => ({ data: h.date, precoUnitarioReais: toReais(h.unitPriceCentavos), loja: h.store || null })),
      garantia: g && { ate: g.until, dentroDaGarantia: g.active, haDias: g.daysAgo, haKm: g.kmAgo }
    };
  }

  // ===== Escrita: ficha, manutenção e odômetro =====

  const CAMPOS_FICHA = {
    apelido: 'nickname', marca: 'make', modelo: 'model', versao: 'trim', cor: 'color', placa: 'plate',
    anoFabricacao: 'yearMade', anoModelo: 'yearModel', dataCompra: 'purchaseDate', kmCompra: 'purchaseKm'
  };
  const CAMPOS_PATCH = Object.keys(manutencaoProps);

  function _patchFicha(input) {
    return Object.fromEntries(Object.entries(CAMPOS_FICHA).filter(([pt]) => _definido(input[pt])).map(([pt, en]) => [en, input[pt]]));
  }

  const ESCRITA_FICHA = {

    update_vehicle_sheet: {
      write: true,
      schema: {
        name: 'update_vehicle_sheet',
        description: 'Cria ou atualiza a ficha do veículo de um projeto do modelo "vehicle" (crie o projeto antes com create_project template=vehicle). Envie só o que muda; "" apaga um campo. Exige apelido ou modelo.',
        input_schema: {
          type: 'object',
          properties: {
            projeto: { type: 'string', description: 'Id ou nome do projeto (modelo vehicle)' },
            apelido: { type: 'string' }, marca: { type: 'string' }, modelo: { type: 'string' }, versao: { type: 'string' },
            cor: { type: 'string' }, placa: { type: 'string' },
            anoFabricacao: { type: 'integer' }, anoModelo: { type: 'integer' },
            dataCompra: dataISO, kmCompra: { type: 'integer' }
          },
          required: ['projeto']
        }
      },
      run(input) {
        const r = resolveProjeto(input.projeto); if (r.erro) return r;
        if (ProjectService.getTemplate(r.proj) !== 'vehicle') {
          return { erro: `O projeto "${r.proj.name}" não é do modelo Veículo. Crie um projeto com create_project template=vehicle (ou ajuste com update_project).` };
        }
        const v = VehicleService.saveSheet(r.proj.id, _patchFicha(input));
        return v.erro ? v : { ok: true, ficha: _fichaSaida(v) };
      }
    },

    update_odometer: {
      write: true,
      schema: {
        name: 'update_odometer',
        description: 'Registra a leitura do odômetro (km atual). Recusa km incoerente com leituras, manutenções e a compra; na mesma data, substitui a anterior. Com remover: true, apaga a leitura da data informada (use para corrigir uma leitura digitada errada que bloqueia outros registros); nesse caso o km é dispensável.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, km: { type: 'integer' }, data: { type: 'string', description: 'YYYY-MM-DD. Default: hoje.' }, remover: { type: 'boolean', description: 'true: remove a leitura dessa data em vez de registrar.' } }
        }
      },
      run({ veiculo, km, data, remover }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        if (remover === true) return _removerLeitura(r.veiculo, data || Utils.today());
        if (km === undefined) return { erro: 'Informe o km.' };
        const leitura = VehicleService.addOdometer(r.veiculo.id, { date: data || Utils.today(), km });
        if (leitura.erro) return leitura;
        return { ok: true, leitura: { data: leitura.date, km: leitura.km }, kmAtual: VehicleService.getCurrentKm(r.veiculo) };
      }
    }
  };

  const MANUTENCOES = {

    register_maintenance: {
      write: true,
      schema: {
        name: 'register_maintenance',
        description: 'Registra uma manutenção/serviço no histórico do veículo. NUNCA cria lançamento financeiro: devolve sugestoesDeVinculo (lançamentos existentes com valor parecido, p.ex. vindos da Carteira) para você perguntar ao André se algum é o pagamento; só então use link_maintenance_payment.',
        input_schema: { type: 'object', properties: { veiculo: veiculoParam, ...manutencaoProps }, required: ['data', 'titulo'] }
      },
      run(input) {
        const r = _resolveVeiculo(input.veiculo); if (r.erro) return r;
        const dto = _dtoManutencao(input); if (dto.erro) return dto;
        const m = VehicleService.addMaintenance(r.veiculo.id, dto);
        if (m.erro) return m;
        const sugestoes = VehicleFinanceService.suggestLinks({
          date: m.date, amountsCentavos: VehicleFinanceService.defaultMaintenanceAmounts(m), excludeMaintenanceId: m.id
        });
        return {
          ok: true, manutencao: _manutencaoSaida(m, VehicleService.getCurrentKm(r.veiculo)),
          sugestoesDeVinculo: sugestoes.map(_sugestaoSaida), aviso: AVISO_SEM_LANCAMENTO
        };
      }
    },

    update_maintenance: {
      write: true,
      schema: {
        name: 'update_maintenance',
        description: 'Edita uma manutenção. Envie em patch só o que muda; "pecas" SUBSTITUI a lista inteira (reenvie as que continuam). Em "pecas" e "zonas": omitido ou null = não mexer; lista vazia [] = limpar a lista. Não mexe nos lançamentos vinculados.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, manutencaoId: { type: 'string' }, patch: { type: 'object', properties: manutencaoProps } },
          required: ['manutencaoId', 'patch']
        }
      },
      run({ veiculo, manutencaoId, patch }) {
        const r = _resolveManutencao(veiculo, manutencaoId); if (r.erro) return r;
        const desconhecido = Object.keys(patch || {}).find(k => !CAMPOS_PATCH.includes(k));
        if (desconhecido) return { erro: `Campo "${desconhecido}" não existe. Use: ${CAMPOS_PATCH.join(', ')}.` };
        const dto = _dtoManutencao(patch || {}); if (dto.erro) return dto;
        const m = VehicleService.updateMaintenance(r.veiculo.id, manutencaoId, dto);
        return m.erro ? m : { ok: true, manutencao: _manutencaoSaida(m, VehicleService.getCurrentKm(r.veiculo)) };
      }
    },

    delete_maintenance: {
      write: true,
      schema: {
        name: 'delete_maintenance',
        description: 'Exclui uma manutenção do histórico. Os lançamentos vinculados continuam nas Finanças (só o vínculo se perde). Confirme com o André antes.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, manutencaoId: { type: 'string' } },
          required: ['manutencaoId']
        }
      },
      run({ veiculo, manutencaoId }) {
        const r = _resolveManutencao(veiculo, manutencaoId); if (r.erro) return r;
        const vinculados = r.manutencao.transactionIds.length;
        const feito = VehicleService.removeMaintenance(r.veiculo.id, manutencaoId);
        if (feito.erro) return feito;
        const aviso = vinculados ? `${vinculados} lançamento(s) vinculado(s) continuam nas Finanças; apague-os por lá se for o caso.` : null;
        return { ok: true, excluida: r.manutencao.title, lancamentosVinculados: vinculados, aviso };
      }
    }
  };

  // ===== Vínculo com Finanças =====

  const ACOES_VINCULO = ['vincular', 'lancar', 'desvincular'];

  /** `card:<id>` para cartão; id da conta caso contrário (convenção do VehicleFinanceService). */
  function _resolveMeio({ conta, cartao }) {
    if (cartao) { const r = resolveCartao(cartao); return r.erro ? r : { meio: CARD_PREFIX + r.cartao.id }; }
    if (conta) { const r = resolveConta(conta); return r.erro ? r : { meio: r.conta.id }; }
    return { erro: 'Informe a conta ou o cartão em que o pagamento foi feito.' };
  }

  const PAGAMENTO_DUPLICADO = 'Esta manutenção já tem pagamento vinculado. Para lançar outro pagamento, confirme com o André e chame de novo com adicional: true.';

  function _lancarPagamento(r, input) {
    if (r.manutencao.transactionIds.length && input.adicional !== true) return { erro: PAGAMENTO_DUPLICADO };
    const meio = _resolveMeio(input); if (meio.erro) return meio;
    const valorCentavos = _definido(input.valorReais) ? toCentavos(input.valorReais) : VehicleService.maintenanceTotal(r.manutencao);
    let categoriaId;
    if (input.categoria) { const c = resolveCategoria(input.categoria, 'despesa'); if (c.erro) return c; categoriaId = c.cat.id; }
    return VehicleFinanceService.launchPayment(r.veiculo.id, r.manutencao.id, {
      meio: meio.meio, valorCentavos, parcelas: input.parcelas, categoriaId, data: input.data,
      allowAdditional: input.adicional === true
    });
  }

  function _aplicarAcao(r, input) {
    const { acao, transacaoId } = input;
    if (acao === 'lancar') return _lancarPagamento(r, input);
    if (!transacaoId) return { erro: 'Informe transacaoId (veja as sugestões de vínculo ou list_transactions).' };
    const aplicar = acao === 'vincular' ? VehicleFinanceService.link : VehicleFinanceService.unlink;
    return aplicar(r.veiculo.id, r.manutencao.id, transacaoId);
  }

  const VINCULO = {

    link_maintenance_payment: {
      write: true,
      schema: {
        name: 'link_maintenance_payment',
        description: 'Liga uma manutenção ao pagamento nas Finanças. acao "vincular": usa um lançamento que já existe (transacaoId). acao "lancar": CRIA a despesa (conta ou cartão, valor padrão = total da manutenção) e vincula; só com o OK do André. acao "desvincular": desfaz o vínculo (o lançamento permanece).',
        input_schema: {
          type: 'object',
          properties: {
            veiculo: veiculoParam,
            manutencaoId: { type: 'string' },
            acao: { type: 'string', enum: ACOES_VINCULO },
            transacaoId: { type: 'string', description: 'Obrigatório em vincular e desvincular' },
            conta: { type: 'string', description: 'Nome ou id da conta (lancar)' },
            cartao: { type: 'string', description: 'Nome ou id do cartão (lancar); vale sobre conta' },
            parcelas: { type: 'integer', description: 'Parcelas no cartão (default 1)' },
            adicional: { type: 'boolean', description: 'lancar: true só quando o André confirmou que este é um pagamento ADICIONAL numa manutenção que já tem pagamento vinculado. Sem isso, o lançamento é recusado para não duplicar.' },
            valorReais: { type: 'number', description: 'lancar: default = total da manutenção' },
            categoria: { type: 'string', description: 'lancar: categoria de despesa. Default: a do veículo ou "Transporte".' },
            data: { type: 'string', description: 'lancar: data do pagamento YYYY-MM-DD. Default: hoje.' }
          },
          required: ['manutencaoId', 'acao']
        }
      },
      run(input) {
        if (!ACOES_VINCULO.includes(input.acao)) return { erro: `acao deve ser: ${ACOES_VINCULO.join(', ')}.` };
        const r = _resolveManutencao(input.veiculo, input.manutencaoId); if (r.erro) return r;
        const resultado = _aplicarAcao(r, input);
        if (resultado.erro) return resultado;
        return {
          ok: true, acao: input.acao, ...(input.acao === 'lancar' && { lancamentoCriado: resultado.id }),
          lancamentosVinculados: _lancamentosVinculados(r.veiculo.id, r.manutencao.id)
        };
      }
    }
  };

  AiTools.register({ ...LEITURA, ...ESCRITA_FICHA, ...MANUTENCOES, ...VINCULO });
})();
