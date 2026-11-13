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

  const { CATEGORIES, ZONES, RECENT_MAINTENANCES, CARD_PREFIX, CARD_STATUSES, CARD_STATUS, CARD_TYPES, CARD_TYPE, VISUAL } = Constants.VEHICLE;
  const AVISO_SEM_LANCAMENTO = 'Nenhum lançamento foi criado nas Finanças. Pergunte ao André se alguma sugestão de vínculo é o pagamento, ou se quer lançar agora (link_maintenance_payment).';

  const veiculoParam = { type: 'string', description: 'Id do veículo, id ou nome do projeto. Opcional se houver só um veículo.' };
  const dataISO = { type: 'string', description: 'Data YYYY-MM-DD' };
  const listaCategorias = CATEGORIES.map(c => c.label).join(', ');
  const listaZonas = ZONES.map(z => z.label).join(', ');
  const COLUNAS_ABERTAS = CARD_STATUSES.filter(c => c.id !== CARD_STATUS.DONE);
  const listaColunas = COLUNAS_ABERTAS.map(c => c.label).join(', ');
  const listaTipos = CARD_TYPES.map(t => t.label).join(', ');
  const VER_QUADRO = 'list_vehicle_board';
  const USE_ADD_CARD = 'Para sintoma use add_vehicle_card.';

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

  const listaPeliculas = VISUAL.FILMS.map(f => f.label).join(', ');
  const efeitoVisualSchema = {
    type: ['object', 'null'],
    description: 'Como a modificação muda o carro 3D (só em Modificação). Informe só o que muda: na edição os campos omitidos continuam como estão. null no campo remove só aquele campo; null em efeitoVisual limpa o efeito inteiro.',
    properties: {
      cor: { type: ['string', 'null'], description: 'Cor da pintura, #rrggbb' },
      rodas: { type: ['string', 'null'], description: 'Cor das rodas, #rrggbb' },
      pelicula: { type: ['string', 'null'], description: `Película dos vidros: ${listaPeliculas}` },
      alturaCm: { type: ['integer', 'null'], description: `Altura de rodagem em relação à original, em cm (${VISUAL.RIDE_MIN_CM} a ${VISUAL.RIDE_MAX_CM}; negativo = rebaixado)` }
    }
  };
  const CAMPOS_EFEITO = Object.keys(efeitoVisualSchema.properties);

  const manutencaoProps = {
    data: dataISO,
    km: { type: 'integer', description: 'Km do odômetro no serviço' },
    titulo: { type: 'string', description: 'Ex.: "Troca de pastilhas de freio"' },
    categoria: { type: 'string', description: `Categoria (id ou nome): ${listaCategorias}` },
    zonas: { type: 'array', items: { type: 'string' }, description: `Zonas do carro (id ou nome): ${listaZonas}` },
    oficina: { type: 'string' },
    pecas: { type: 'array', items: pecaSchema, description: 'Peças usadas' },
    maoDeObraReais: { type: 'number', description: 'Mão de obra em reais' },
    obs: { type: 'string' },
    tipo: { type: 'string', description: 'Serviço (padrão) ou Modificação. Para sintoma use add_vehicle_card.' },
    estimativaReais: { type: 'number', description: 'Quanto se esperava gastar, em reais (não entra nos totais)' },
    efeitoVisual: efeitoVisualSchema,
    desfeitaEm: { type: ['string', 'null'], description: 'Só em Modificação concluída: data YYYY-MM-DD em que ela saiu do carro (a máquina do tempo deixa de mostrá-la a partir desse dia). null limpa.' }
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
    if (!manutencaoId) return { erro: `Informe o id do registro (veja search_maintenance ou ${VER_QUADRO}).` };
    const candidatos = veiculoParamValor ? [_resolveVeiculo(veiculoParamValor)] : VehicleService.list().map(veiculo => ({ veiculo }));
    const erro = candidatos.find(c => c.erro);
    if (erro) return erro;
    for (const { veiculo } of candidatos) {
      const manutencao = veiculo.maintenances.find(m => m.id === manutencaoId);
      if (manutencao) return { veiculo, manutencao };
    }
    return { erro: `Manutenção "${manutencaoId}" não encontrada (veja search_maintenance ou ${VER_QUADRO}).` };
  }

  /** Categoria/zona por id ou rótulo, sem acento nem caixa. */
  function _resolveOpcao(valor, lista, rotulo) {
    const alvo = norm(valor);
    const achada = lista.find(x => x.id === valor || norm(x.id) === alvo || norm(x.label) === alvo
      || (x.aliases || []).some(a => norm(a) === alvo));
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

  /** Película pelo rótulo da mais próxima (G35, G50...). */
  function _peliculaSaida(tint) {
    const films = [...VISUAL.FILMS].sort((a, b) => Math.abs(a.tint - tint) - Math.abs(b.tint - tint));
    return films[0].label;
  }

  function _efeitoSaida(efeito) {
    return {
      cor: efeito.paint ?? null, rodas: efeito.wheels ?? null,
      pelicula: efeito.tint == null ? null : _peliculaSaida(efeito.tint), alturaCm: efeito.rideHeight ?? null
    };
  }

  const _comEfeito = m => (m.visualEffect ? { efeitoVisual: _efeitoSaida(m.visualEffect) } : {});

  function _manutencaoSaida(m, kmAtual) {
    return {
      id: m.id, data: m.date, haDias: _haDias(m.date), km: m.km ?? null, haKm: _haKm(m.km, kmAtual),
      titulo: m.title, categoria: _label(CATEGORIES, m.category), zonas: m.zones.map(z => _label(ZONES, z)),
      oficina: m.shop || null, pecas: m.parts.map(_pecaSaida),
      maoDeObraReais: toReais(m.laborCentavos), totalReais: toReais(VehicleService.maintenanceTotal(m)),
      obs: m.notes || null, lancamentosVinculados: m.transactionIds.length, ..._comEfeito(m),
      ...(m.removedOn && { desfeitaEm: m.removedOn })
    };
  }

  /** Card do quadro (aberto, ou sintoma concluído): sem haDias/haKm, que só fazem sentido no histórico. */
  function _cardSaida(m) {
    return {
      id: m.id, titulo: m.title, tipo: _label(CARD_TYPES, VehicleService.typeOf(m)), coluna: _label(CARD_STATUSES, VehicleService.statusOf(m)),
      zonas: m.zones.map(z => _label(ZONES, z)), categoria: _label(CATEGORIES, m.category),
      estimativaReais: m.estimateCentavos == null ? null : toReais(m.estimateCentavos),
      pecas: m.parts.map(_pecaSaida), maoDeObraReais: toReais(m.laborCentavos),
      data: m.date || null, km: m.km ?? null, oficina: m.shop || null, obs: m.notes || null,
      ...(m.resolvedById && { resolvidoPorId: m.resolvedById }), ..._comEfeito(m)
    };
  }

  const _registroSaida = (m, kmAtual) => (VehicleService.isHistory(m) ? _manutencaoSaida(m, kmAtual) : _cardSaida(m));

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

  /** Tipo por id ou rótulo; sintoma só nasce em add_vehicle_card. */
  function _dtoTipo(input) {
    if (!_definido(input.tipo)) return {};
    const r = _resolveOpcao(input.tipo, CARD_TYPES, 'Tipo');
    if (r.erro) return r;
    return r.id === CARD_TYPE.SYMPTOM ? { erro: USE_ADD_CARD } : { type: r.id };
  }

  /** Efeito do service a partir do efeito atual e dos campos informados: omitido mantém, null no campo remove. */
  function _mesclarEfeito(atual, campos) {
    const merged = { ...atual };
    Object.entries(campos).forEach(([key, value]) => {
      if (value === null) delete merged[key];
      else if (value !== undefined) merged[key] = value;
    });
    return Object.keys(merged).length ? merged : null;
  }

  /** efeitoVisual (pt-BR) → visualEffect do service; null limpa tudo, ausente não mexe, campos informados se somam ao efeito atual. A validação de valores é do service. */
  function _dtoEfeito(input, atual) {
    const efeito = input.efeitoVisual;
    if (!_definido(efeito)) return {};
    if (efeito === null) return { visualEffect: null };
    if (typeof efeito !== 'object' || Array.isArray(efeito)) return { erro: 'efeitoVisual deve ser um objeto com cor, rodas, pelicula e alturaCm.' };
    const desconhecido = Object.keys(efeito).find(k => !CAMPOS_EFEITO.includes(k));
    if (desconhecido) return { erro: `efeitoVisual: campo "${desconhecido}" não existe. Use: ${CAMPOS_EFEITO.join(', ')}.` };
    const pelicula = efeito.pelicula != null ? _resolveOpcao(efeito.pelicula, VISUAL.FILMS, 'Película') : null;
    if (pelicula?.erro) return pelicula;
    const tint = pelicula ? VISUAL.FILMS.find(f => f.id === pelicula.id).tint : (efeito.pelicula === null ? null : undefined);
    return { visualEffect: _mesclarEfeito(atual, { paint: efeito.cor, wheels: efeito.rodas, tint, rideHeight: efeito.alturaCm }) };
  }

  /** Traduz os campos em pt-BR para o modelo do service; só o que foi informado. */
  function _dtoManutencao(input, efeitoAtual) {
    const extras = _dtoCategoriaEZonas(input);
    if (extras.erro) return extras;
    const tipo = _dtoTipo(input);
    if (tipo.erro) return tipo;
    const efeito = _dtoEfeito(input, efeitoAtual);
    if (efeito.erro) return efeito;
    const dto = {
      date: input.data, km: input.km, title: input.titulo, shop: input.oficina, notes: input.obs,
      removedOn: input.desfeitaEm,
      ...extras, ...tipo, ...efeito,
      estimateCentavos: _definido(input.estimativaReais) ? toCentavos(input.estimativaReais) : undefined,
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

  function _quadroResumo(veiculoId) {
    const quadro = VehicleBoardService.getBoard(veiculoId);
    return {
      sintomasAbertos: quadro.symptoms.length,
      cardsAbertos: quadro.columns.reduce((total, c) => total + c.cards.length, 0),
      planejadoReais: toReais(quadro.plannedCentavos)
    };
  }

  const LEITURA = {

    get_vehicle: {
      write: false,
      schema: {
        name: 'get_vehicle',
        description: 'Ficha do veículo (apelido, marca, modelo, anos, placa), km atual, resumo de gastos em reais (total, no ano, custo por km e por 1.000 km), oficinas e as últimas manutenções. "quadro" resume os sintomas abertos e os cards (ideias, a fazer, fazendo) com o planejado em reais. "fotos" é só a quantidade de fotos da galeria: você não acessa as imagens.',
        input_schema: { type: 'object', properties: { veiculo: veiculoParam } }
      },
      run({ veiculo }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const v = r.veiculo;
        const resumo = VehicleService.getSummary(v.id);
        return {
          ficha: _fichaSaida(v), kmAtual: resumo.currentKm, resumo: _resumoSaida(resumo), quadro: _quadroResumo(v.id), fotos: VehicleService.listPhotos(v.id).length,
          oficinas: VehicleService.getShops(v.id).map(o => ({ nome: o.name, visitas: o.visits, ultimaVisita: o.lastVisit, totalReais: toReais(o.totalCentavos) })),
          ultimasManutencoes: VehicleService.listMaintenances(v.id).slice(0, RECENT_MAINTENANCES).map(m => _manutencaoSaida(m, resumo.currentKm))
        };
      }
    },

    search_maintenance: {
      write: false,
      schema: {
        name: 'search_maintenance',
        description: 'Busca no histórico de manutenções CONCLUÍDAS (mais recentes primeiro); cards abertos e sintomas não aparecem aqui, use list_vehicle_board. Cada resultado traz há quantos dias e km foi feito, total em reais, peças e a situação da garantia de cada peça. Use para "quando troquei X?", "o que já fiz na dianteira?" e diagnósticos.',
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
      ultimaTroca: { manutencaoId: u.maintenanceId, data: u.date, haDias: u.daysAgo, km: u.km, haKm: u.kmAgo, marca: u.brand || null, loja: u.store || null, qtd: u.qty, precoUnitarioReais: toReais(u.unitPriceCentavos) },
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

  /** Manutenção concluída + sugestões de vínculo (nunca lança nada). */
  function _concluidaSaida(veiculo, m) {
    const sugestoes = VehicleFinanceService.suggestLinks({
      date: m.date, amountsCentavos: VehicleFinanceService.defaultMaintenanceAmounts(m), excludeMaintenanceId: m.id
    });
    return {
      ok: true, manutencao: _manutencaoSaida(m, VehicleService.getCurrentKm(veiculo)),
      sugestoesDeVinculo: sugestoes.map(_sugestaoSaida), aviso: AVISO_SEM_LANCAMENTO
    };
  }

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
        return _concluidaSaida(r.veiculo, m);
      }
    },

    update_maintenance: {
      write: true,
      schema: {
        name: 'update_maintenance',
        description: 'Edita uma manutenção ou card do quadro (para mudar de coluna use move_vehicle_card). Envie em patch só o que muda; "pecas" SUBSTITUI a lista inteira (reenvie as que continuam). Em "pecas" e "zonas": omitido ou null = não mexer; lista vazia [] = limpar a lista. Não mexe nos lançamentos vinculados.',
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
        const dto = _dtoManutencao(patch || {}, r.manutencao.visualEffect); if (dto.erro) return dto;
        const m = VehicleService.updateMaintenance(r.veiculo.id, manutencaoId, dto);
        return m.erro ? m : { ok: true, manutencao: _registroSaida(m, VehicleService.getCurrentKm(r.veiculo)) };
      }
    },

    delete_maintenance: {
      write: true,
      schema: {
        name: 'delete_maintenance',
        description: 'Exclui uma manutenção ou card. Apagar uma manutenção reabre (volta para A fazer) os sintomas que ela resolvia. Os lançamentos vinculados continuam nas Finanças (só o vínculo se perde). As fotos ligadas a ela continuam na galeria, sem vínculo. Confirme com o André antes.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, manutencaoId: { type: 'string' } },
          required: ['manutencaoId']
        }
      },
      run({ veiculo, manutencaoId }) {
        const r = _resolveManutencao(veiculo, manutencaoId); if (r.erro) return r;
        const vinculados = r.manutencao.transactionIds.length;
        const fotosDesvinculadas = VehicleService.listPhotos(r.veiculo.id, { maintenanceId: manutencaoId }).length;
        const feito = VehicleService.removeMaintenance(r.veiculo.id, manutencaoId);
        if (feito.erro) return feito;
        const aviso = vinculados ? `${vinculados} lançamento(s) vinculado(s) continuam nas Finanças; apague-os por lá se for o caso.` : null;
        return { ok: true, excluida: r.manutencao.title, lancamentosVinculados: vinculados, fotosDesvinculadas, aviso };
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

  // ===== Quadro e diagnóstico =====

  const _colunaSaida = c => ({
    coluna: _label(CARD_STATUSES, c.status), total: c.cards.length,
    subtotalReais: toReais(c.estimateCentavos), cards: c.cards.map(_cardSaida)
  });

  function _zonaContextoSaida(contexto, kmAtual) {
    return {
      zona: contexto.zone.label, kmAtual,
      historico: contexto.history.map(m => _manutencaoSaida(m, kmAtual)),
      pecas: contexto.parts.map(_cadernoItemSaida),
      cardsAbertos: contexto.openCards.map(_cardSaida),
      sintomasResolvidos: contexto.resolvedSymptoms.map(s => ({
        ..._cardSaida(s), resolvidoPor: s.resolvedBy && { id: s.resolvedBy.id, titulo: s.resolvedBy.title, data: s.resolvedBy.date, km: s.resolvedBy.km }
      }))
    };
  }

  const QUADRO = {

    get_zone_context: {
      write: false,
      schema: {
        name: 'get_zone_context',
        description: 'Contexto de uma zona do carro para diagnóstico: histórico de manutenções da zona, peças (com garantia e idade em dias e km), cards abertos e sintomas já resolvidos. Use ANTES de opinar sobre um sintoma: cruze o sintoma com as peças da zona, a idade em km e dias e a garantia.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, zona: { type: 'string', description: `Id ou nome: ${listaZonas}` } },
          required: ['zona']
        }
      },
      run({ veiculo, zona }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const z = _resolveOpcao(zona, ZONES, 'Zona'); if (z.erro) return z;
        const contexto = VehicleBoardService.getZoneContext(r.veiculo.id, z.id);
        return contexto.erro ? contexto : _zonaContextoSaida(contexto, contexto.currentKm);
      }
    },

    list_vehicle_board: {
      write: false,
      schema: {
        name: 'list_vehicle_board',
        description: 'Quadro do veículo: sintomas abertos, colunas Ideias / A fazer / Fazendo com os cards e o subtotal estimado de cada uma, o total planejado (A fazer + Fazendo) e os últimos serviços concluídos.',
        input_schema: { type: 'object', properties: { veiculo: veiculoParam } }
      },
      run({ veiculo }) {
        const r = _resolveVeiculo(veiculo); if (r.erro) return r;
        const quadro = VehicleBoardService.getBoard(r.veiculo.id);
        const kmAtual = VehicleService.getCurrentKm(r.veiculo);
        return {
          sintomas: quadro.symptoms.map(_cardSaida), colunas: quadro.columns.map(_colunaSaida),
          planejadoReais: toReais(quadro.plannedCentavos),
          ultimosConcluidos: quadro.recentDone.map(m => _manutencaoSaida(m, kmAtual))
        };
      }
    }
  };

  /** Traduz a coluna (id ou rótulo) para o status de um card aberto; padrão "A fazer". */
  function _resolveColuna(coluna) {
    if (!_definido(coluna)) return { id: CARD_STATUS.TODO };
    const r = _resolveOpcao(coluna, COLUNAS_ABERTAS, 'Coluna');
    const concluir = norm(coluna) === norm(_label(CARD_STATUSES, CARD_STATUS.DONE));
    return concluir ? { erro: 'Para registrar algo já feito use register_maintenance (ou mova um card com move_vehicle_card).' } : r;
  }

  function _dtoCard(input) {
    const tipo = _resolveOpcao(input.tipo || CARD_TYPE.SERVICE, CARD_TYPES, 'Tipo'); if (tipo.erro) return tipo;
    const coluna = _resolveColuna(input.coluna); if (coluna.erro) return coluna;
    const extras = _dtoCategoriaEZonas(input); if (extras.erro) return extras;
    const efeito = _dtoEfeito(input); if (efeito.erro) return efeito;
    const dto = {
      title: input.titulo, type: tipo.id, status: coluna.id, notes: input.obs, ...extras, ...efeito,
      estimateCentavos: _definido(input.estimativaReais) ? toCentavos(input.estimativaReais) : undefined
    };
    return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
  }

  const MOVER = {
    para: { type: 'string', description: `Coluna destino: ${listaColunas} ou Feito` },
    data: { type: 'string', description: 'Feito: data em que foi feito YYYY-MM-DD (obrigatória)' },
    km: { type: 'integer', description: 'Feito: km do serviço' },
    oficina: { type: 'string' },
    pecas: { type: 'array', items: pecaSchema, description: 'Feito: peças usadas' },
    maoDeObraReais: { type: 'number' },
    obs: { type: 'string' }
  };

  function _moverParaFeito(r, input) {
    if (!input.data) return { erro: 'Para concluir informe a data em que foi feito (data, YYYY-MM-DD).' };
    const dto = _dtoManutencao(input, r.manutencao.visualEffect); if (dto.erro) return dto;
    const m = VehicleService.updateMaintenance(r.veiculo.id, r.manutencao.id, { ...dto, status: CARD_STATUS.DONE });
    return m.erro ? m : _concluidaSaida(r.veiculo, m);
  }

  function _moverCard(r, input) {
    const destino = _resolveOpcao(input.para, CARD_STATUSES, 'Coluna'); if (destino.erro) return destino;
    if (VehicleService.isDone(r.manutencao)) return { erro: 'Esse registro já está concluído; para ajustar use update_maintenance.' };
    if (destino.id === CARD_STATUS.DONE) return _moverParaFeito(r, input);
    const m = VehicleService.updateMaintenance(r.veiculo.id, r.manutencao.id, { status: destino.id });
    return m.erro ? m : { ok: true, card: _cardSaida(m) };
  }

  const ACOES_SINTOMA = ['resolver', 'virar_servico'];

  function _resolverSintoma(veiculo, input) {
    if (!input.manutencaoId) return { erro: 'Para resolver informe manutencaoId: a manutenção concluída que resolveu o sintoma (veja search_maintenance).' };
    const s = VehicleBoardService.resolveSymptom(veiculo.id, input.sintomaId, input.manutencaoId);
    return s.erro ? s : { ok: true, sintoma: _cardSaida(s) };
  }

  const ESCRITA_QUADRO = {

    add_vehicle_card: {
      write: true,
      schema: {
        name: 'add_vehicle_card',
        description: 'Cria um card no quadro do veículo (nada vira histórico nem custo até ser concluído). tipo: Serviço (padrão), Modificação ou Sintoma. Sintoma exige ao menos uma zona e fica na coluna Sintomas. coluna: Ideias, A fazer (padrão) ou Fazendo. Para sintoma, chame get_zone_context antes de opinar.',
        input_schema: {
          type: 'object',
          properties: {
            veiculo: veiculoParam,
            titulo: { type: 'string' },
            tipo: { type: 'string', description: `Id ou nome: ${listaTipos}` },
            coluna: { type: 'string', description: `Id ou nome: ${listaColunas} (padrão A fazer)` },
            zonas: manutencaoProps.zonas,
            categoria: manutencaoProps.categoria,
            estimativaReais: manutencaoProps.estimativaReais,
            efeitoVisual: efeitoVisualSchema,
            obs: { type: 'string' }
          },
          required: ['titulo']
        }
      },
      run(input) {
        const r = _resolveVeiculo(input.veiculo); if (r.erro) return r;
        const dto = _dtoCard(input); if (dto.erro) return dto;
        const m = VehicleService.addMaintenance(r.veiculo.id, dto);
        return m.erro ? m : { ok: true, card: _cardSaida(m) };
      }
    },

    move_vehicle_card: {
      write: true,
      schema: {
        name: 'move_vehicle_card',
        description: 'Move um card entre Ideias, A fazer e Fazendo, ou o conclui com para "Feito": aí exige data e aceita km, oficina, peças, mão de obra e obs, vira histórico (entra nos custos) e devolve sugestoesDeVinculo; nenhum lançamento é criado. Concluído não volta para o quadro. Sintoma não se move: use resolve_vehicle_symptom.',
        input_schema: {
          type: 'object',
          properties: { veiculo: veiculoParam, cardId: { type: 'string' }, ...MOVER },
          required: ['cardId', 'para']
        }
      },
      run(input) {
        const r = _resolveManutencao(input.veiculo, input.cardId); if (r.erro) return r;
        if (VehicleService.typeOf(r.manutencao) === CARD_TYPE.SYMPTOM) {
          return { erro: 'Sintoma não se move: use resolve_vehicle_symptom (resolver com a manutenção que o resolveu, ou virar_servico).' };
        }
        return _moverCard(r, input);
      }
    },

    resolve_vehicle_symptom: {
      write: true,
      schema: {
        name: 'resolve_vehicle_symptom',
        description: 'Fecha um sintoma aberto. acao "resolver": liga o sintoma à manutenção concluída que o resolveu (manutencaoId) e o tira do quadro. acao "virar_servico": o próprio card passa a ser um Serviço em A fazer.',
        input_schema: {
          type: 'object',
          properties: {
            veiculo: veiculoParam,
            sintomaId: { type: 'string' },
            acao: { type: 'string', enum: ACOES_SINTOMA },
            manutencaoId: { type: 'string', description: 'Obrigatório em resolver' }
          },
          required: ['sintomaId', 'acao']
        }
      },
      run(input) {
        if (!ACOES_SINTOMA.includes(input.acao)) return { erro: `acao deve ser: ${ACOES_SINTOMA.join(', ')}.` };
        const r = _resolveManutencao(input.veiculo, input.sintomaId); if (r.erro) return r;
        if (input.acao === 'resolver') return _resolverSintoma(r.veiculo, input);
        const card = VehicleBoardService.convertSymptom(r.veiculo.id, input.sintomaId);
        return card.erro ? card : { ok: true, card: _cardSaida(card) };
      }
    }
  };

  AiTools.register({ ...LEITURA, ...QUADRO, ...ESCRITA_FICHA, ...MANUTENCOES, ...ESCRITA_QUADRO, ...VINCULO });
})();
