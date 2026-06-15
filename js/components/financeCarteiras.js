/**
 * ===================== FINANCE CARTEIRAS =====================
 * Seção "Carteiras" na view de Finanças: lista as contas (não-meta) com saldo
 * atual e um modal para criar/editar/arquivar. Aporte/objetivo de metas ficam
 * no FinanceMetas; cartões de crédito no FinanceCartoes.
 * Componente de UI: lê/escreve via FinanceService, zero DOM no service.
 */

const FinanceCarteiras = (() => {

  let _editId = null;

  const TIPO_LABELS = { corrente: 'Conta corrente', poupanca: 'Poupança', dinheiro: 'Dinheiro' };

  // ===== Seção da view =====

  function sectionHtml() {
    const contas = FinanceService.listContas().filter(c => c.tipo !== 'meta');
    return `<div class="card fin-cartoes-section">
      <div class="card-title fin-cartoes-title">
        <span><i class="ti ti-wallet"></i> Carteiras</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceCarteiras.openNew()">
          <i class="ti ti-plus"></i> Adicionar
        </button>
      </div>
      ${contas.length
        ? contas.map(contaHtml).join('')
        : `<div class="text-muted" style="margin:4px 0 8px">Nenhuma carteira cadastrada</div>`}
    </div>`;
  }

  function contaHtml(c) {
    const saldo = FinanceService.getSaldo(c.id);
    const cor = c.cor || 'var(--accent)';
    return `<div class="fin-manage-item" onclick="FinanceCarteiras.openEdit('${c.id}')">
      <div class="fin-dot" style="background:${cor}22">${Utils.escapeHtml(c.icone || '💵')}</div>
      <div class="fin-info">
        <div class="fin-title">${Utils.escapeHtml(c.nome)}</div>
        <div class="fin-sub">${Utils.escapeHtml(TIPO_LABELS[c.tipo] || c.tipo)}</div>
      </div>
      <div class="fin-amount" style="color:${saldo >= 0 ? 'var(--green)' : 'var(--red)'}">
        ${Utils.formatBRL(saldo)}
      </div>
    </div>`;
  }

  // ===== Modal =====

  function openNew() {
    _editId = null;
    document.getElementById('carteira-modal-title').textContent = 'Nova carteira';
    document.getElementById('cart-nome').value = '';
    document.getElementById('cart-icone').value = '💵';
    document.getElementById('cart-tipo').value = 'dinheiro';
    document.getElementById('cart-saldo').value = '';
    document.getElementById('cart-saldo-group').style.display = '';
    _setColor(null);
    document.getElementById('cart-archive-btn').style.display = 'none';
    Modal.open('carteira-modal');
    document.getElementById('cart-nome').focus();
  }

  function openEdit(id) {
    const c = FinanceService.getContaById(id);
    if (!c) return;
    _editId = id;
    document.getElementById('carteira-modal-title').textContent = 'Editar carteira';
    document.getElementById('cart-nome').value = c.nome;
    document.getElementById('cart-icone').value = c.icone || '💵';
    document.getElementById('cart-tipo').value = c.tipo || 'dinheiro';
    document.getElementById('cart-saldo').value = _centsToInput(c.saldoInicialCentavos);
    // Saldo inicial só é editável na criação: alterá-lo depois reescreveria o
    // histórico de saldo de forma confusa.
    document.getElementById('cart-saldo-group').style.display = 'none';
    _setColor(c.cor);
    document.getElementById('cart-archive-btn').style.display = '';
    Modal.open('carteira-modal');
  }

  function save() {
    const nome = document.getElementById('cart-nome').value.trim();
    if (!nome) return alert('Informe o nome da carteira');
    const dto = {
      nome,
      icone: document.getElementById('cart-icone').value.trim() || '💵',
      tipo: document.getElementById('cart-tipo').value,
      cor: _selectedColor()
    };
    if (_editId) {
      FinanceService.updateConta(_editId, dto);
    } else {
      dto.saldoInicialCentavos = Utils.brlToCentavos(document.getElementById('cart-saldo').value);
      FinanceService.addConta(dto);
    }
    Modal.close('carteira-modal');
    _rerender();
  }

  function archiveCurrent() {
    if (!_editId) return;
    if (FinanceService.listContas().filter(c => c.tipo !== 'meta').length <= 1) {
      return alert('Mantenha ao menos uma carteira ativa.');
    }
    if (!confirm('Arquivar carteira? Os lançamentos antigos são preservados.')) return;
    FinanceService.arquivarConta(_editId);
    Modal.close('carteira-modal');
    _rerender();
  }

  // ===== Helpers (mesmo padrão do FinanceCartaoModal) =====

  function _setColor(selected) {
    const picker = document.getElementById('cart-color-picker');
    picker.innerHTML = Constants.COLORS.map(cor => `
      <button type="button" class="color-dot ${cor === (selected || Constants.COLORS[0]) ? 'selected' : ''}"
              style="background:${cor}" data-color="${cor}"
              onclick="FinanceCarteiras.pickColor('${cor}')"></button>`).join('');
  }

  function pickColor(cor) {
    document.querySelectorAll('#cart-color-picker .color-dot').forEach(b => {
      b.classList.toggle('selected', b.dataset.color === cor);
    });
  }

  function _selectedColor() {
    const sel = document.querySelector('#cart-color-picker .color-dot.selected');
    return sel ? sel.dataset.color : Constants.COLORS[0];
  }

  function _centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return { sectionHtml, openNew, openEdit, save, archiveCurrent, pickColor };
})();
