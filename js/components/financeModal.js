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
    _start(t, id, 'Editar lançamento');
  }

  function _start(fields, editId, title) {
    _editId = editId;
    document.getElementById('fin-modal-title').textContent = title;
    document.getElementById('f-value').value = fields.valorCentavos ? centsToInput(fields.valorCentavos) : '';
    document.getElementById('f-desc').value = fields.descricao || '';
    document.getElementById('f-date').value = fields.data || Utils.today();
    _fillContas(fields.contaId, fields.contaDestinoId);
    setType(fields.tipo || 'saida', fields.categoriaId);
    Modal.open('fin-modal');
  }

  /** Centavos → "85,50" para o input de texto */
  function centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  // ===== Tipo + campos dependentes =====

  function setType(tipo, selectedCat) {
    AppState.ui.finType = tipo;
    [['saida', 'saida'], ['entrada', 'entrada'], ['transferencia', 'transf']].forEach(([t, sufixo]) => {
      const el = document.getElementById('fin-type-' + sufixo);
      if (el) el.classList.toggle('active', t === tipo);
    });
    const isTransf = tipo === 'transferencia';
    document.getElementById('f-cat-group').style.display = isTransf ? 'none' : '';
    document.getElementById('f-conta-dest-group').style.display = isTransf ? '' : 'none';
    document.getElementById('f-conta-label').textContent = isTransf ? 'Conta de origem' : 'Conta';
    if (!isTransf) _fillCats(tipo, selectedCat);
  }

  function _fillCats(tipo, selectedId) {
    const sel = document.getElementById('f-cat');
    const tipoCat = tipo === 'entrada' ? 'receita' : 'despesa';
    sel.innerHTML = FinanceService.listCategorias(tipoCat)
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    if (selectedId) sel.value = selectedId;
  }

  function _fillContas(contaId, destinoId) {
    const opts = FinanceService.listContas()
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    const conta = document.getElementById('f-conta');
    const dest = document.getElementById('f-conta-dest');
    conta.innerHTML = opts;
    dest.innerHTML = opts;
    if (contaId) conta.value = contaId;
    if (destinoId) dest.value = destinoId;
  }

  // ===== Salvar =====

  function save() {
    const tipo = AppState.ui.finType;
    const valorCentavos = Utils.brlToCentavos(document.getElementById('f-value').value);
    const contaId = document.getElementById('f-conta').value;

    if (!valorCentavos || valorCentavos <= 0) return alert('Informe um valor válido maior que zero');
    if (!contaId) return alert('Selecione uma conta');

    const fields = {
      tipo, valorCentavos,
      descricao: document.getElementById('f-desc').value.trim(),
      data: document.getElementById('f-date').value || Utils.today(),
      contaId
    };
    if (tipo === 'transferencia') {
      fields.contaDestinoId = document.getElementById('f-conta-dest').value;
      if (!fields.contaDestinoId || fields.contaDestinoId === contaId) {
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
    }

    Modal.close('fin-modal');
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return { open, openPrefilled, openEdit, setType, save };
})();
