/**
 * ===================== FINANCE CATEGORIAS =====================
 * Seção "Categorias" na view de Finanças: lista categorias de despesa e receita
 * com um modal para criar/editar/arquivar. O tipo (despesa/receita) é definido
 * na criação e não muda depois (trocá-lo deixaria lançamentos inconsistentes).
 * Componente de UI: lê/escreve via FinanceService, zero DOM no service.
 */

const FinanceCategorias = (() => {

  let _editId = null;

  // ===== Seção da view =====

  function sectionHtml() {
    return `<div class="card fin-cartoes-section">
      <div class="card-title fin-cartoes-title">
        <span><i class="ti ti-tag"></i> Categorias</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceCategorias.openNew()">
          <i class="ti ti-plus"></i> Adicionar
        </button>
      </div>
      ${grupoHtml('Despesas', 'despesa')}
      ${grupoHtml('Receitas', 'receita')}
    </div>`;
  }

  function grupoHtml(titulo, tipo) {
    const cats = FinanceService.listCategorias(tipo);
    if (!cats.length) return '';
    return `<div class="fin-cat-grupo">
      <div class="fin-cat-grupo-title">${titulo}</div>
      <div class="fin-cat-chips">
        ${cats.map(chipHtml).join('')}
      </div>
    </div>`;
  }

  function chipHtml(c) {
    const cor = c.cor || 'var(--accent)';
    return `<button type="button" class="fin-cat-chip" style="border-color:${cor}55"
            onclick="FinanceCategorias.openEdit('${c.id}')">
      <span>${Utils.escapeHtml(c.icone || '📦')}</span>
      <span>${Utils.escapeHtml(c.nome)}</span>
    </button>`;
  }

  // ===== Modal =====

  function openNew() {
    _editId = null;
    document.getElementById('categoria-modal-title').textContent = 'Nova categoria';
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-icone').value = '📦';
    document.getElementById('cat-tipo').value = 'despesa';
    document.getElementById('cat-tipo').disabled = false;
    document.getElementById('cat-grupo').value = 'desejo';
    _setColor(null);
    onTipoChange();
    document.getElementById('cat-archive-btn').style.display = 'none';
    Modal.open('categoria-modal');
    document.getElementById('cat-nome').focus();
  }

  function openEdit(id) {
    const c = FinanceService.getCategoriaById(id);
    if (!c) return;
    _editId = id;
    document.getElementById('categoria-modal-title').textContent = 'Editar categoria';
    document.getElementById('cat-nome').value = c.nome;
    document.getElementById('cat-icone').value = c.icone || '📦';
    document.getElementById('cat-tipo').value = c.tipo;
    document.getElementById('cat-tipo').disabled = true; // tipo não é editável
    document.getElementById('cat-grupo').value = c.grupo503020 || 'desejo';
    _setColor(c.cor);
    onTipoChange();
    document.getElementById('cat-archive-btn').style.display = '';
    Modal.open('categoria-modal');
  }

  /** O grupo 50/30/20 só existe para despesa. */
  function onTipoChange() {
    const tipo = document.getElementById('cat-tipo').value;
    document.getElementById('cat-grupo-group').style.display = tipo === 'despesa' ? '' : 'none';
  }

  function save() {
    const nome = document.getElementById('cat-nome').value.trim();
    if (!nome) return alert('Informe o nome da categoria');
    const dto = {
      nome,
      icone: document.getElementById('cat-icone').value.trim() || '📦',
      cor: _selectedColor(),
      grupo503020: document.getElementById('cat-grupo').value
    };
    if (_editId) {
      FinanceService.updateCategoria(_editId, dto);
    } else {
      dto.tipo = document.getElementById('cat-tipo').value;
      FinanceService.addCategoria(dto);
    }
    Modal.close('categoria-modal');
    _rerender();
  }

  function archiveCurrent() {
    if (!_editId) return;
    if (!confirm('Arquivar categoria? Os lançamentos antigos são preservados.')) return;
    FinanceService.arquivarCategoria(_editId);
    Modal.close('categoria-modal');
    _rerender();
  }

  // ===== Helpers =====

  function _setColor(selected) {
    const picker = document.getElementById('cat-color-picker');
    picker.innerHTML = Constants.COLORS.map(cor => `
      <button type="button" class="color-dot ${cor === (selected || Constants.COLORS[0]) ? 'selected' : ''}"
              style="background:${cor}" data-color="${cor}"
              onclick="FinanceCategorias.pickColor('${cor}')"></button>`).join('');
  }

  function pickColor(cor) {
    document.querySelectorAll('#cat-color-picker .color-dot').forEach(b => {
      b.classList.toggle('selected', b.dataset.color === cor);
    });
  }

  function _selectedColor() {
    const sel = document.querySelector('#cat-color-picker .color-dot.selected');
    return sel ? sel.dataset.color : Constants.COLORS[0];
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return { sectionHtml, openNew, openEdit, save, archiveCurrent, pickColor, onTipoChange };
})();
