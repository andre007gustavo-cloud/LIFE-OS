/**
 * ===================== FINANCE MODAL =====================
 * Modal completo de lançamento (saída / entrada / transferência), usado pelo
 * "+ Mais opções" do FinanceQuickAdd e ao tocar num lançamento para editar.
 * Componente de UI: lê o FinanceService, nunca o Storage direto.
 */

const FinanceModal = (() => {

  let _editId = null;

  // ===== Abrir =====

  function open() {
    _start({ tipo: 'saida', data: Utils.today() }, null, 'Novo lançamento');
  }

  function openPrefilled(fields) {
    _start(fields || {}, null, 'Novo lançamento');
  }

  function openEdit(id) {
    const t = FinanceService.getTransacaoById(id);
    if (!t) return;
    // Compras de cartão e pagamentos de fatura não são editáveis por este modal
    if (t.cartaoId && !t.pagamentoFatura) {
      if (window.FinanceCartaoModal) FinanceCartaoModal.openDetalhe(t.cartaoId);
      return;
    }
    if (t.pagamentoFatura) return;
    _start(t, id, 'Editar lançamento');
  }

  function _start(fields, editId, title) {
    _editId = editId;
    document.getElementById('fin-modal-title').textContent = title;
    document.getElementById('f-value').value = fields.valorCentavos ? centsToInput(fields.valorCentavos) : '';
    document.getElementById('f-desc').value = fields.descricao || '';
    document.getElementById('f-date').value = fields.data || Utils.today();
    // Suporte a cartão: se vier cartaoId, seleciona 'card:xxx' no select de conta
    const contaVal = fields.cartaoId ? 'card:' + fields.cartaoId : (fields.contaId || '');
    _fillContas(contaVal, fields.contaDestinoId);
    if (fields.parcelas && fields.parcelas > 1) {
      const pfEl = document.getElementById('f-parcelas');
      if (pfEl) pfEl.value = fields.parcelas;
    }
    _resetRepeat();
    setType(fields.tipo || 'saida', fields.categoriaId);
    _showSugerido(!!fields.categoriaSugerida);
    Modal.open('fin-modal');
  }

  /** Mostra/esconde a marcação discreta "sugerido" ao lado da label de categoria. */
  function _showSugerido(on) {
    const el = document.getElementById('f-cat-sugerido');
    if (el) el.style.display = on ? '' : 'none';
  }

  /** Ao trocar a categoria manualmente, a marcação "sugerido" deixa de valer. */
  function onCatChange() {
    _showSugerido(false);
  }

  /** "Repetir" só faz sentido ao criar um lançamento novo (não em edição). */
  function _resetRepeat() {
    document.getElementById('f-repeat').checked = false;
    document.getElementById('f-repeat-assinatura').checked = false;
    document.getElementById('f-repeat-freq').value = 'mensal';
    document.getElementById('f-repeat-opts').style.display = 'none';
  }

  function toggleRepeat() {
    const on = document.getElementById('f-repeat').checked;
    document.getElementById('f-repeat-opts').style.display = on ? '' : 'none';
  }

  /** Centavos → "85,50" para o input de texto */
  function centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  // ===== Tipo + campos dependentes =====

  function setType(tipo, selectedCat) {
    _showSugerido(false); // trocar o tipo invalida a sugestão anterior
    AppState.ui.finType = tipo;
    [['saida', 'saida'], ['entrada', 'entrada'], ['transferencia', 'transf']].forEach(([t, sufixo]) => {
      const el = document.getElementById('fin-type-' + sufixo);
      if (el) el.classList.toggle('active', t === tipo);
    });
    const isTransf = tipo === 'transferencia';
    document.getElementById('f-cat-group').style.display = isTransf ? 'none' : '';
    document.getElementById('f-conta-dest-group').style.display = isTransf ? '' : 'none';
    document.getElementById('f-conta-label').textContent = isTransf ? 'Conta de origem' : 'Conta ou cartão';
    // Repetir: indisponível em transferência, em edição e em compra de cartão
    _updateParcelas();
    document.getElementById('f-repeat-group').style.display = (isTransf || _editId || _isCardSelected()) ? 'none' : '';
    if (!isTransf) _fillCats(tipo, selectedCat);
  }

  function _isCardSelected() {
    const el = document.getElementById('f-conta');
    return el && (el.value || '').startsWith('card:');
  }

  function onContaChange() {
    _updateParcelas();
    const isCard = _isCardSelected();
    // Oculta "Repetir" se for cartão
    const isTransf = AppState.ui.finType === 'transferencia';
    document.getElementById('f-repeat-group').style.display = (isTransf || _editId || isCard) ? 'none' : '';
  }

  function _updateParcelas() {
    const el = document.getElementById('f-parcelas-group');
    if (!el) return;
    const isCard = _isCardSelected();
    const isSaida = AppState.ui.finType === 'saida';
    el.style.display = (isCard && isSaida) ? '' : 'none';
    if (!isCard) {
      const pfEl = document.getElementById('f-parcelas');
      if (pfEl) pfEl.value = '1';
    }
  }

  function _fillCats(tipo, selectedId) {
    const sel = document.getElementById('f-cat');
    const tipoCat = tipo === 'entrada' ? 'receita' : 'despesa';
    sel.innerHTML = FinanceService.listCategorias(tipoCat)
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    if (selectedId) sel.value = selectedId;
  }

  function _fillContas(contaVal, destinoId) {
    const contaOpts = FinanceService.listContas()
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    const cartaoOpts = (window.CartaoService ? CartaoService.listCartoes() : [])
      .map(c => `<option value="card:${c.id}">💳 ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    const contaEl = document.getElementById('f-conta');
    const destEl  = document.getElementById('f-conta-dest');
    contaEl.innerHTML = contaOpts +
      (cartaoOpts ? `<optgroup label="Cartões de crédito">${cartaoOpts}</optgroup>` : '');
    destEl.innerHTML = contaOpts; // transferência só para contas
    if (contaVal) contaEl.value = contaVal;
    if (destinoId) destEl.value = destinoId;
    _updateParcelas();
  }

  // ===== Salvar =====

  function save() {
    const tipo = AppState.ui.finType;
    const valorCentavos = Utils.brlToCentavos(document.getElementById('f-value').value);
    const contaVal = document.getElementById('f-conta').value;
    const isCard = contaVal.startsWith('card:');

    if (!valorCentavos || valorCentavos <= 0) return alert('Informe um valor válido maior que zero');
    if (!contaVal) return alert('Selecione uma conta ou cartão');

    // Compra no cartão (só saída)
    if (isCard && tipo === 'saida' && !_editId) {
      const cartaoId = contaVal.slice(5);
      const parcelas = Math.max(1, parseInt(document.getElementById('f-parcelas')?.value || '1', 10));
      CartaoService.addCompraCartao({
        cartaoId,
        descricao: document.getElementById('f-desc').value.trim(),
        categoriaId: document.getElementById('f-cat').value,
        valorTotalCentavos: valorCentavos,
        parcelas,
        dataCompra: document.getElementById('f-date').value || Utils.today()
      });
      Modal.close('fin-modal');
      if (window.FinanceView) FinanceView.render();
      if (window.DashboardView) DashboardView.render();
      return;
    }

    const fields = {
      tipo, valorCentavos,
      descricao: document.getElementById('f-desc').value.trim(),
      data: document.getElementById('f-date').value || Utils.today(),
      contaId: contaVal
    };
    if (tipo === 'transferencia') {
      fields.contaDestinoId = document.getElementById('f-conta-dest').value;
      if (!fields.contaDestinoId || fields.contaDestinoId === contaVal) {
        return alert('Escolha uma conta de destino diferente da origem');
      }
    } else {
      fields.categoriaId = document.getElementById('f-cat').value;
    }

    if (_editId) {
      FinanceService.updateTransaction(_editId, fields);
    } else {
      fields.fonte = 'manual';
      FinanceService.addTransaction(fields);
      _maybeCreateRecorrencia(fields);
    }

    Modal.close('fin-modal');
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  /**
   * Cria a recorrência junto ao lançamento, se "repetir" estiver marcado. A 1ª
   * ocorrência é o próprio lançamento manual (ultimaGeracao = data), pra não
   * gerar uma transação duplicada nessa mesma data.
   */
  function _maybeCreateRecorrencia(fields) {
    if (fields.tipo === 'transferencia') return;
    if (!document.getElementById('f-repeat').checked) return;
    const d = Utils.parseISO(fields.data);
    FinanceService.addRecorrencia({
      tipo: fields.tipo, valorCentavos: fields.valorCentavos, descricao: fields.descricao,
      categoriaId: fields.categoriaId, contaId: fields.contaId,
      frequencia: document.getElementById('f-repeat-freq').value,
      diaDoMes: d.getDate(), mesDoAno: d.getMonth() + 1,
      dataInicio: fields.data, ultimaGeracao: fields.data,
      ehAssinatura: document.getElementById('f-repeat-assinatura').checked
    });
  }

  return { open, openPrefilled, openEdit, setType, save, toggleRepeat, onContaChange, onCatChange };
})();
