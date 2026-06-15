/**
 * ===================== FINANCE CARTAO MODAL (Fase 4) =====================
 * Três responsabilidades:
 *   1. Modal de criação/edição de cartão (#cartao-modal)
 *   2. Overlay de detalhe/fatura com navegação entre competências
 *   3. Modal de pagamento de fatura (#pagar-fatura-modal)
 * Componente de UI: lê CartaoService / FinanceService, zero DOM direto.
 */

const FinanceCartaoModal = (() => {

  // ===== 1. Modal: adicionar / editar cartão =====

  let _editCartaoId = null;

  function openNew() {
    _editCartaoId = null;
    document.getElementById('cartao-modal-title').textContent = 'Novo cartão';
    document.getElementById('cc-nome').value = '';
    document.getElementById('cc-limite').value = '';
    document.getElementById('cc-fechamento').value = '28';
    document.getElementById('cc-vencimento').value = '5';
    _fillContasSelect('cc-conta-pag', '');
    _setColor(null);
    document.getElementById('cc-remove-btn').style.display = 'none';
    Modal.open('cartao-modal');
    document.getElementById('cc-nome').focus();
  }

  function openEdit(id) {
    const c = CartaoService.getCartaoById(id);
    if (!c) return;
    _editCartaoId = id;
    document.getElementById('cartao-modal-title').textContent = 'Editar cartão';
    document.getElementById('cc-nome').value = c.nome;
    document.getElementById('cc-limite').value = _centsToInput(c.limiteCentavos);
    document.getElementById('cc-fechamento').value = c.diaFechamento;
    document.getElementById('cc-vencimento').value = c.diaVencimento;
    _fillContasSelect('cc-conta-pag', c.contaPagamentoId);
    _setColor(c.cor);
    document.getElementById('cc-remove-btn').style.display = '';
    Modal.open('cartao-modal');
  }

  function _setColor(selected) {
    const picker = document.getElementById('cc-color-picker');
    picker.innerHTML = Constants.COLORS.map(cor => `
      <button type="button" class="color-dot ${cor === (selected || Constants.COLORS[0]) ? 'selected' : ''}"
              style="background:${cor}" data-color="${cor}"
              onclick="FinanceCartaoModal.pickColor('${cor}')"></button>`).join('');
  }

  function pickColor(cor) {
    document.querySelectorAll('#cc-color-picker .color-dot').forEach(b => {
      b.classList.toggle('selected', b.dataset.color === cor);
    });
  }

  function _selectedColor() {
    const sel = document.querySelector('#cc-color-picker .color-dot.selected');
    return sel ? sel.dataset.color : Constants.COLORS[0];
  }

  function saveCartao() {
    const nome = document.getElementById('cc-nome').value.trim();
    const limiteCentavos = Utils.brlToCentavos(document.getElementById('cc-limite').value);
    const diaFechamento = parseInt(document.getElementById('cc-fechamento').value, 10);
    const diaVencimento = parseInt(document.getElementById('cc-vencimento').value, 10);
    if (!nome) return alert('Informe o nome do cartão');
    if (!limiteCentavos || limiteCentavos <= 0) return alert('Informe um limite válido');
    if (!diaFechamento || diaFechamento < 1 || diaFechamento > 31) return alert('Dia de fechamento inválido (1–31)');
    if (!diaVencimento || diaVencimento < 1 || diaVencimento > 31) return alert('Dia de vencimento inválido (1–31)');

    const dto = {
      nome, limiteCentavos, diaFechamento, diaVencimento,
      cor: _selectedColor(),
      contaPagamentoId: document.getElementById('cc-conta-pag').value || ''
    };
    if (_editCartaoId) CartaoService.updateCartao(_editCartaoId, dto);
    else CartaoService.addCartao(dto);

    Modal.close('cartao-modal');
    _rerender();
  }

  function archiveCurrent() {
    if (!_editCartaoId) return;
    if (!confirm('Arquivar cartão?')) return;
    CartaoService.arquivarCartao(_editCartaoId);
    Modal.close('cartao-modal');
    _rerender();
  }

  // ===== 2. Overlay: detalhe do cartão / navegação de faturas =====

  let _detailEl = null;
  let _detailCartaoId = null;
  let _detailCompetencia = null;

  function ensureDetalheEl() {
    if (_detailEl) return _detailEl;
    _detailEl = document.createElement('div');
    _detailEl.className = 'fatura-overlay';
    _detailEl.innerHTML = `
      <div class="fatura-sheet">
        <div class="fatura-nav">
          <button class="fatura-nav-close" onclick="FinanceCartaoModal.closeDetalhe()">&times;</button>
          <div class="fatura-nav-title" id="fatura-card-title"></div>
          <button class="btn btn-ghost btn-sm" onclick="FinanceCartaoModal.openEditCartao()"><i class="ti ti-settings"></i></button>
        </div>
        <div id="fatura-content"></div>
      </div>`;
    _detailEl.addEventListener('mousedown', e => { if (e.target === _detailEl) closeDetalhe(); });
    document.body.appendChild(_detailEl);
    return _detailEl;
  }

  function openDetalhe(cartaoId) {
    _detailCartaoId = cartaoId;
    const cartao = CartaoService.getCartaoById(cartaoId);
    if (!cartao) return;
    _detailCompetencia = CartaoService.competenciaDaCompra(cartao, Utils.today());
    _renderDetalhe();
    ensureDetalheEl().classList.add('open');
  }

  function closeDetalhe() {
    if (_detailEl) _detailEl.classList.remove('open');
  }

  function openEditCartao() {
    closeDetalhe();
    if (_detailCartaoId) openEdit(_detailCartaoId);
  }

  function navFatura(delta) {
    let [y, m] = _detailCompetencia.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    _detailCompetencia = `${y}-${String(m).padStart(2, '0')}`;
    _renderDetalhe();
  }

  function _renderDetalhe() {
    const cartao = CartaoService.getCartaoById(_detailCartaoId);
    const fatura = CartaoService.getFatura(_detailCartaoId, _detailCompetencia);
    const disponivel = CartaoService.getLimiteDisponivel(_detailCartaoId);
    const comprometidas = CartaoService.getParcelasComprometidas(_detailCartaoId);
    const el = ensureDetalheEl();
    el.querySelector('#fatura-card-title').textContent = cartao ? cartao.nome : '';
    el.querySelector('#fatura-content').innerHTML = _faturaHtml(cartao, fatura, disponivel, comprometidas);
  }

  function _mesLabel(competencia) {
    if (!competencia) return '';
    const [y, m] = competencia.split('-').map(Number);
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${nomes[m - 1]} ${y}`;
  }

  function _faturaHtml(cartao, fatura, disponivel, comprometidas) {
    if (!cartao || !fatura) return '<div class="text-muted">Cartão não encontrado</div>';

    const mesAtual = FinanceService.currentMonthPrefix();
    const isAtual = _detailCompetencia === CartaoService.competenciaDaCompra(cartao, Utils.today());
    const mesLabel = _mesLabel(_detailCompetencia) + (isAtual ? ' (atual)' : '');

    // Barra de limite
    const usado = cartao.limiteCentavos - disponivel;
    const pct = cartao.limiteCentavos > 0 ? Math.min(100, Math.max(0, Math.round(usado / cartao.limiteCentavos * 100))) : 0;
    const barClass = pct > 90 ? 'orc-estourado' : pct > 70 ? 'orc-alerta' : 'orc-ok';

    const itensHtml = fatura.itens.length
      ? fatura.itens.map(item => {
          const cat = FinanceService.getCategoriaById(item.categoriaId);
          const parcBadge = item.parcelaTotal > 1
            ? `<span class="fatura-item-parcela">${item.parcelaNum}/${item.parcelaTotal}</span>`
            : '';
          const prevTag = item.previsto ? ` <span class="fatura-item-prev">previsto</span>` : '';
          return `<div class="fatura-item${item.previsto ? ' fatura-item-previsto' : ''}">
            <div class="fatura-item-info">
              <div class="fatura-item-desc">${Utils.escapeHtml(item.descricao || 'Compra')}${prevTag}</div>
              <div class="fatura-item-sub">${Utils.escapeHtml(cat ? `${cat.icone} ${cat.nome}` : '')}</div>
            </div>
            ${parcBadge}
            <div class="fatura-item-val">R$ ${Utils.formatBRL(item.valorParcelaCentavos).replace('R$','').trim()}</div>
          </div>`;
        }).join('')
      : `<div class="text-muted" style="padding:12px 0">Nenhum lançamento nesta fatura</div>`;

    // Status e ações
    let statusHtml = '';
    let acoesHtml = '';
    if (fatura.paga && fatura.pagamento) {
      statusHtml = `<div class="fatura-status paga">✓ Paga em ${Utils.escapeHtml(fatura.pagamento.pagoEm || '')}</div>`;
      acoesHtml = `<button class="btn btn-ghost" onclick="FinanceCartaoModal.desfazerPagamento()">
        <i class="ti ti-arrow-back-up"></i> Desfazer pagamento</button>`;
    } else if (fatura.totalCentavos > 0) {
      acoesHtml = `<button class="btn btn-primary" onclick="FinanceCartaoModal.openPagar()">
        <i class="ti ti-credit-card"></i> Pagar fatura</button>`;
    }

    return `
      <div class="fatura-card-bar">
        <div class="fatura-card-color" style="background:${cartao.cor}"></div>
        <div class="fatura-card-bar-info">
          <div class="fatura-card-bar-name">${Utils.escapeHtml(cartao.nome)}</div>
          <div class="fatura-card-bar-dates">
            Fecha ${Utils.escapeHtml(fatura.dataFechamento)} · Vence ${Utils.escapeHtml(fatura.dataVencimento)}
          </div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--text3)">
          <div>${Utils.formatBRL(disponivel)} disp.</div>
          ${comprometidas.totalCentavos > 0 ? `<div>+${Utils.formatBRL(comprometidas.totalCentavos)} fut.</div>` : ''}
        </div>
      </div>
      <div class="orc-bar" style="margin-bottom:14px">
        <div class="orc-bar-fill ${barClass}" style="width:${pct}%"></div>
      </div>

      <div class="fatura-import-row">
        <button class="btn btn-ghost btn-sm" onclick="FinanceImport.openForCartao('${cartao.id}')">
          <i class="ti ti-file-import"></i> Importar fatura (.ofx)
        </button>
      </div>

      <div class="fatura-month-nav">
        <button class="fatura-month-btn" onclick="FinanceCartaoModal.navFatura(-1)">← Anterior</button>
        <span class="fatura-month-label">${Utils.escapeHtml(mesLabel)}</span>
        <button class="fatura-month-btn" onclick="FinanceCartaoModal.navFatura(1)">Próximo →</button>
      </div>

      ${itensHtml}

      <div class="fatura-total">
        <span class="fatura-total-label">Total da fatura</span>
        <span class="fatura-total-val">${Utils.formatBRL(fatura.totalCentavos)}</span>
      </div>
      ${statusHtml}
      <div class="fatura-actions">${acoesHtml}</div>`;
  }

  // ===== 3. Modal: pagar fatura =====

  let _payCartaoId = null;
  let _payCompetencia = null;

  function openPagar() {
    _payCartaoId = _detailCartaoId;
    _payCompetencia = _detailCompetencia;
    const fatura = CartaoService.getFatura(_payCartaoId, _payCompetencia);
    if (!fatura) return;
    const cartao = CartaoService.getCartaoById(_payCartaoId);

    document.getElementById('pf-mes').textContent =
      `${cartao ? cartao.nome : 'Cartão'} — ${_mesLabel(_payCompetencia)}`;
    document.getElementById('pf-valor').value = _centsToInput(fatura.totalCentavos);
    document.getElementById('pf-data').value = Utils.today();
    _fillContasSelect('pf-conta', cartao ? cartao.contaPagamentoId : '');
    Modal.open('pagar-fatura-modal');
  }

  function salvarPagamento() {
    const valorCentavos = Utils.brlToCentavos(document.getElementById('pf-valor').value);
    const contaId = document.getElementById('pf-conta').value;
    const data = document.getElementById('pf-data').value || Utils.today();
    if (!valorCentavos || valorCentavos <= 0) return alert('Informe um valor válido');
    if (!contaId) return alert('Selecione a conta de pagamento');

    CartaoService.pagarFatura({ cartaoId: _payCartaoId, competencia: _payCompetencia, contaId, valorCentavos, data });
    Modal.close('pagar-fatura-modal');
    _renderDetalhe();
    _rerender();
  }

  function desfazerPagamento() {
    if (!confirm('Desfazer pagamento desta fatura?')) return;
    CartaoService.desfazerPagamento(_detailCartaoId, _detailCompetencia);
    _renderDetalhe();
    _rerender();
  }

  // ===== Helpers =====

  function _fillContasSelect(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const contas = FinanceService.listContas();
    sel.innerHTML = '<option value="">— nenhuma —</option>' +
      contas.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`).join('');
    if (selectedId) sel.value = selectedId;
  }

  function _centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return {
    openNew, openEdit, saveCartao, archiveCurrent, pickColor,
    openDetalhe, closeDetalhe, openEditCartao, navFatura,
    openPagar, salvarPagamento, desfazerPagamento
  };
})();
