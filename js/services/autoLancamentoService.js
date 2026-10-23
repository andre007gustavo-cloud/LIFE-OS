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

  const _limites = () => Constants.FINANCE.AUTO_LANCAMENTO;
  const _transacoes = () => AppState.getDB().transacoes;

  function _textoLimpo(valor) {
    return String(valor == null ? '' : valor).trim().slice(0, _limites().TEXTO_MAX).trim();
  }

  function _dataValida(data) {
    return ISO_DATE.test(data) && Utils.toISO(Utils.parseISO(data)) === data;
  }

  /** Valida e normaliza a entrada externa. Retorna os campos limpos ou { erro }. */
  function _validar({ valorCentavos, estabelecimento, nomeCartao, data }) {
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
    return { valorCentavos, descricao, nomeCartao: cartao, data: dataCompra };
  }

  /** Nome da Carteira contém o do app ou o inverso; match exato vence o parcial. */
  function _acharPorNome(itens, nomeNormalizado) {
    const comNome = itens.map(i => ({ item: i, nome: Utils.normalizeText(i.nome) })).filter(x => x.nome);
    const exato = comNome.find(x => x.nome === nomeNormalizado);
    const parcial = comNome.find(x =>
      nomeNormalizado.includes(x.nome) || x.nome.includes(nomeNormalizado));
    return (exato || parcial || {}).item || null;
  }

  /** Cartão primeiro, depois conta (débito). Retorna { cartaoId } | { contaId } | null. */
  function _resolverMeio(nomeCartao) {
    const nome = Utils.normalizeText(nomeCartao);
    const cartao = _acharPorNome(CartaoService.listCartoes(), nome);
    if (cartao) return { cartaoId: cartao.id };
    const contas = FinanceService.listContas().filter(c => c.tipo !== 'meta');
    const conta = _acharPorNome(contas, nome);
    return conta ? { contaId: conta.id } : null;
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

  function _acharDuplicada({ valorCentavos, descricao }, meio) {
    const norm = Utils.normalizeText(descricao);
    const limite = Date.now() - _limites().DEDUP_MINUTOS * 60 * 1000;
    return _transacoes().find(t =>
      t.fonte === FONTE
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
   * Retorna { transacao, duplicada } ou { erro } (entrada inválida / cartão desconhecido).
   */
  function registrarCompraCarteira(entrada) {
    const compra = _validar(entrada);
    if (compra.erro) return compra;
    const meio = _resolverMeio(compra.nomeCartao);
    if (!meio) return { erro: `Cartão "${compra.nomeCartao}" não cadastrado no LifeOS` };

    const existente = _acharDuplicada(compra, meio);
    if (existente) return { transacao: existente, duplicada: true };

    const transacao = _criarLancamento(compra, meio, _categoriaSugerida(compra.descricao));
    transacao.aConferir = true;
    AppState.persist();
    return { transacao, duplicada: false };
  }

  function listAConferir() {
    return _transacoes().filter(t => t.aConferir);
  }

  /** Tira a marca "a conferir" dos ids informados; retorna quantos foram confirmados. */
  function confirmar(ids) {
    const alvo = new Set(ids || []);
    const pendentes = listAConferir().filter(t => alvo.has(t.id));
    pendentes.forEach(t => {
      delete t.aConferir;
      FinanceService.updateTransaction(t.id, {});
    });
    return pendentes.length;
  }

  return { registrarCompraCarteira, listAConferir, confirmar };
})();
