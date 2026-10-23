/**
 * ===================== AUTO LANCAMENTO SERVICE =====================
 * Compras do Apple Pay (Atalho do iPhone → endpoint) viram lançamentos em
 * Finanças, com categoria sugerida e marcadas `aConferir` até a conferência.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Persiste via AppState.persist().
 */

const AutoLancamentoService = (() => {

  const FONTE = 'carteira';
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const TIPOS = { CREDITO: 'credito', DEBITO: 'debito' };

  const _limites = () => Constants.FINANCE.AUTO_LANCAMENTO;
  const _transacoes = () => AppState.getDB().transacoes;

  function _textoLimpo(valor) {
    return String(valor == null ? '' : valor).trim().slice(0, _limites().TEXTO_MAX).trim();
  }

  function _dataValida(data) {
    return ISO_DATE.test(data) && Utils.toISO(Utils.parseISO(data)) === data;
  }

  /** Valida e normaliza a entrada externa. Retorna os campos limpos ou { erro }. */
  function _validar({ valorCentavos, estabelecimento, nomeCartao, data, tipo }) {
    if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
      return { erro: 'Valor inválido: informe centavos inteiros maiores que zero' };
    }
    if (valorCentavos > _limites().VALOR_MAX_CENTAVOS) {
      return { erro: 'Valor acima do limite permitido para lançamento automático' };
    }
    const descricao = _textoLimpo(estabelecimento);
    if (!descricao) return { erro: 'Estabelecimento não informado' };
    const cartao = _textoLimpo(nomeCartao);
    if (!cartao) return { erro: 'Cartão não informado' };
    const dataCompra = data == null || data === '' ? Utils.today() : data;
    if (!_dataValida(dataCompra)) return { erro: 'Data inválida: use o formato AAAA-MM-DD' };
    const tipoCompra = Utils.normalizeText(_textoLimpo(tipo));
    if (tipoCompra && !Object.values(TIPOS).includes(tipoCompra)) {
      return { erro: `Tipo inválido: use "${TIPOS.CREDITO}" ou "${TIPOS.DEBITO}" (ou deixe em branco)` };
    }
    return { valorCentavos, descricao, nomeCartao: cartao, data: dataCompra, tipo: tipoCompra };
  }

  /** O lado contido no outro precisa ter tamanho mínimo, para "Nu" não casar com tudo. */
  function _casaParcial(nomeA, nomeB) {
    const min = _limites().NOME_MIN;
    return (nomeA.length >= min && nomeB.includes(nomeA)) || (nomeB.length >= min && nomeA.includes(nomeB));
  }

  /**
   * Nome exato (normalizado) vence; senão aceita casamento parcial só se for
   * único. Retorna { item } | { erro } (ambíguo) | null (nenhum).
   */
  function _acharPorNome(itens, nomeOriginal, rotulo) {
    const nome = Utils.normalizeText(nomeOriginal);
    const comNome = itens.map(i => ({ item: i, nome: Utils.normalizeText(i.nome) })).filter(x => x.nome);
    const exato = comNome.find(x => x.nome === nome);
    if (exato) return { item: exato.item };
    const parciais = comNome.filter(x => _casaParcial(x.nome, nome));
    if (parciais.length > 1) {
      const nomes = parciais.map(x => x.item.nome).join(', ');
      return { erro: `${rotulo} "${nomeOriginal}" ambíguo: combina com ${nomes}` };
    }
    return parciais.length ? { item: parciais[0].item } : null;
  }

  const _contasDebito = () => FinanceService.listContas().filter(c => c.tipo !== 'meta');

  const ROTULOS_POR_TIPO = {
    [TIPOS.CREDITO]: { meio: 'Cartão', nenhum: 'Nenhum cartão de crédito', operacao: 'crédito' },
    [TIPOS.DEBITO]: { meio: 'Conta', nenhum: 'Nenhuma conta', operacao: 'débito' }
  };

  /** Com tipo informado, busca só na lista dele (nunca cai na outra). Retorna { cartaoId } | { contaId } | { erro }. */
  function _resolverPorTipo(nome, tipo) {
    const credito = tipo === TIPOS.CREDITO;
    const rotulos = ROTULOS_POR_TIPO[tipo];
    const achado = _acharPorNome(credito ? CartaoService.listCartoes() : _contasDebito(), nome, rotulos.meio);
    if (!achado) {
      return { erro: `${rotulos.nenhum} com o nome "${nome}" para compra no ${rotulos.operacao}` };
    }
    if (achado.erro) return achado;
    return credito ? { cartaoId: achado.item.id } : { contaId: achado.item.id };
  }

  /**
   * Sem tipo: cartão primeiro, depois conta. `colisao` avisa que o nome do
   * cartão também casa com uma conta (a compra foi para o cartão por regra).
   * Retorna { cartaoId, colisao? } | { contaId } | { erro } | null.
   */
  function _resolverMeio(nome, tipo) {
    if (tipo) return _resolverPorTipo(nome, tipo);
    const cartao = _acharPorNome(CartaoService.listCartoes(), nome, ROTULOS_POR_TIPO[TIPOS.CREDITO].meio);
    const conta = _acharPorNome(_contasDebito(), nome, ROTULOS_POR_TIPO[TIPOS.DEBITO].meio);
    if (cartao) {
      if (cartao.erro) return cartao;
      return { cartaoId: cartao.item.id, colisao: !!conta };
    }
    if (conta) return conta.erro ? conta : { contaId: conta.item.id };
    return null;
  }

  /** Categoria do mesmo estabelecimento já conferido; senão histórico por tokens; senão ''. */
  function _categoriaSugerida(descricao) {
    const norm = Utils.normalizeText(descricao);
    const conferida = _transacoes()
      .filter(t => t.tipo === 'saida' && t.categoriaId && !t.aConferir
        && Utils.normalizeText(t.descricao) === norm)
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
    if (conferida) return conferida.categoriaId;
    const sugestao = FinanceService.sugerirCategoria(descricao, 'saida');
    return sugestao ? sugestao.categoriaId : '';
  }

  function _acharDuplicada({ valorCentavos, descricao, data }, meio) {
    const norm = Utils.normalizeText(descricao);
    const limite = Date.now() - _limites().DEDUP_MINUTOS * 60 * 1000;
    return _transacoes().find(t =>
      t.fonte === FONTE
      && t.data === data
      && t.valorCentavos === valorCentavos
      && Utils.normalizeText(t.descricao) === norm
      && (t.cartaoId || '') === (meio.cartaoId || '')
      && (t.contaId || '') === (meio.contaId || '')
      && Date.parse(t.criadoEm) > limite) || null;
  }

  function _criarLancamento(compra, meio, categoriaId) {
    if (meio.cartaoId) {
      return CartaoService.addCompraCartao({
        cartaoId: meio.cartaoId, descricao: compra.descricao, categoriaId,
        valorTotalCentavos: compra.valorCentavos, dataCompra: compra.data, fonte: FONTE
      });
    }
    return FinanceService.addTransaction({
      tipo: 'saida', valorCentavos: compra.valorCentavos, descricao: compra.descricao,
      categoriaId, contaId: meio.contaId, data: compra.data, fonte: FONTE
    });
  }

  /**
   * Registra uma compra vinda da Carteira.
   * Retorna { transacao, duplicada, colisao } ou { erro } (entrada inválida / cartão desconhecido).
   */
  function registrarCompraCarteira(entrada) {
    const compra = _validar(entrada);
    if (compra.erro) return compra;
    const meio = _resolverMeio(compra.nomeCartao, compra.tipo);
    if (!meio) return { erro: `Cartão "${compra.nomeCartao}" não cadastrado no LifeOS` };
    if (meio.erro) return meio;

    const existente = _acharDuplicada(compra, meio);
    if (existente) return { transacao: existente, duplicada: true, colisao: !!meio.colisao };

    const transacao = _criarLancamento(compra, meio, _categoriaSugerida(compra.descricao));
    transacao.aConferir = true;
    AppState.persist();
    return { transacao, duplicada: false, colisao: !!meio.colisao };
  }

  function listAConferir() {
    return _transacoes().filter(t => t.aConferir);
  }

  /** Tira a marca "a conferir" dos ids informados; retorna quantos foram confirmados. */
  function confirmar(ids) {
    const alvo = new Set(ids || []);
    const pendentes = listAConferir().filter(t => alvo.has(t.id));
    // updateTransaction não remove campos, por isso a marca sai direto do objeto
    pendentes.forEach(t => { delete t.aConferir; });
    if (pendentes.length) AppState.persist();
    return pendentes.length;
  }

  return { registrarCompraCarteira, listAConferir, confirmar };
})();
