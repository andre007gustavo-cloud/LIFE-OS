/**
 * ===================== FINANCE METAS =====================
 * Seção "Metas" na view de Finanças: cada meta é uma conta tipo 'meta' com
 * objetivo/prazo opcionais; o saldo vem dos aportes (transferências) recebidos.
 * Três responsabilidades: listar com progresso, modal de criar/editar/arquivar,
 * e modal de aporte/resgate (transferência entre carteira e meta).
 * Componente de UI: lê/escreve via FinanceService, zero DOM no service.
 */

const FinanceMetas = (() => {

  let _editId = null;
  let _aporteMetaId = null;
  let _aporteModo = 'aporte';

  // ===== Seção da view =====

  function sectionHtml() {
    const metas = FinanceService.listMetas();
    return `<div class="card fin-cartoes-section">
      <div class="card-title fin-cartoes-title">
        <span><i class="ti ti-target"></i> Metas</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceMetas.openNew()">
          <i class="ti ti-plus"></i> Adicionar
        </button>
      </div>
      ${metas.length
        ? metas.map(c => metaHtml(FinanceService.getMetaResumo(c.id), c)).join('')
        : `<div class="text-muted" style="margin:4px 0 8px">Nenhuma meta cadastrada</div>`}
    </div>`;
  }

  function metaHtml(m, c) {
    const cor = c.cor || 'var(--accent)';
    const objetivo = m.objetivoCentavos;
    const pct = objetivo > 0 ? Math.min(100, Math.round(m.saldoAtualCentavos / objetivo * 100)) : 0;
    const barClass = m.concluida ? 'orc-ok' : (pct >= 80 ? 'orc-ok' : 'orc-alerta');
    return `<div class="fin-meta-item">
      <div class="fin-meta-head" onclick="FinanceMetas.openEdit('${c.id}')">
        <div class="fin-dot" style="background:${cor}22">${Utils.escapeHtml(c.icone || '🎯')}</div>
        <div class="fin-info">
          <div class="fin-title">${Utils.escapeHtml(c.nome)} ${m.concluida ? '<span class="fin-meta-done">✓ concluída</span>' : ''}</div>
          <div class="fin-sub">${_subLabel(m)}</div>
        </div>
        <div class="fin-meta-pct">${objetivo > 0 ? pct + '%' : ''}</div>
      </div>
      <div class="orc-bar"><div class="orc-bar-fill ${barClass}" style="width:${pct}%"></div></div>
      <div class="fin-meta-footer">
        <span>${Utils.formatBRL(m.saldoAtualCentavos)}${objetivo > 0 ? ' de ' + Utils.formatBRL(objetivo) : ''}</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceMetas.openAporte('${c.id}')">
          <i class="ti ti-pig-money"></i> Aportar
        </button>
      </div>
    </div>`;
  }

  /** Linha-resumo: o que falta + prazo / aporte mensal sugerido. */
  function _subLabel(m) {
    if (m.concluida) return 'Objetivo alcançado';
    const partes = [];
    if (m.objetivoCentavos > 0) partes.push('Faltam ' + Utils.formatBRL(m.faltaCentavos));
    if (m.dataObjetivo) {
      partes.push('até ' + Utils.fmtDate(m.dataObjetivo));
      if (m.aporteMensalNecessarioCentavos) {
        partes.push(Utils.formatBRL(m.aporteMensalNecessarioCentavos) + '/mês');
      }
    }
    return Utils.escapeHtml(partes.join(' · ') || 'Sem objetivo definido');
  }

  // ===== Modal: criar / editar =====

  function openNew() {
    _editId = null;
    document.getElementById('meta-modal-title').textContent = 'Nova meta';
    document.getElementById('meta-nome').value = '';
    document.getElementById('meta-icone').value = '🎯';
    document.getElementById('meta-objetivo').value = '';
    document.getElementById('meta-prazo').value = '';
    _setColor(null);
    document.getElementById('meta-archive-btn').style.display = 'none';
    Modal.open('meta-modal');
    document.getElementById('meta-nome').focus();
  }

  function openEdit(id) {
    const c = FinanceService.getContaById(id);
    if (!c || c.tipo !== 'meta') return;
    _editId = id;
    document.getElementById('meta-modal-title').textContent = 'Editar meta';
    document.getElementById('meta-nome').value = c.nome;
    document.getElementById('meta-icone').value = c.icone || '🎯';
    document.getElementById('meta-objetivo').value = _centsToInput(c.valorObjetivoCentavos);
    document.getElementById('meta-prazo').value = c.dataObjetivo || '';
    _setColor(c.cor);
    document.getElementById('meta-archive-btn').style.display = '';
    Modal.open('meta-modal');
  }

  function save() {
    const nome = document.getElementById('meta-nome').value.trim();
    if (!nome) return alert('Informe o nome da meta');
    const dto = {
      nome,
      icone: document.getElementById('meta-icone').value.trim() || '🎯',
      cor: _selectedColor(),
      valorObjetivoCentavos: Utils.brlToCentavos(document.getElementById('meta-objetivo').value),
      dataObjetivo: document.getElementById('meta-prazo').value || ''
    };
    if (_editId) {
      FinanceService.updateConta(_editId, dto);
    } else {
      dto.tipo = 'meta';
      FinanceService.addConta(dto);
    }
    Modal.close('meta-modal');
    _rerender();
  }

  function archiveCurrent() {
    if (!_editId) return;
    if (!confirm('Arquivar meta? Os aportes feitos permanecem no histórico.')) return;
    FinanceService.arquivarConta(_editId);
    Modal.close('meta-modal');
    _rerender();
  }

  // ===== Modal: aportar / resgatar =====

  function openAporte(metaId) {
    _aporteMetaId = metaId;
    const meta = FinanceService.getContaById(metaId);
    if (!meta) return;
    setModo('aporte');
    document.getElementById('meta-aporte-nome').textContent = meta.nome;
    document.getElementById('ma-valor').value = '';
    document.getElementById('ma-data').value = Utils.today();
    _fillContas('ma-conta');
    Modal.open('meta-aporte-modal');
  }

  function setModo(modo) {
    _aporteModo = modo === 'resgate' ? 'resgate' : 'aporte';
    document.getElementById('ma-modo-aporte').classList.toggle('active', _aporteModo === 'aporte');
    document.getElementById('ma-modo-resgate').classList.toggle('active', _aporteModo === 'resgate');
    document.getElementById('ma-conta-label').textContent =
      _aporteModo === 'aporte' ? 'De qual carteira sai?' : 'Para qual carteira vai?';
  }

  function saveAporte() {
    const valorCentavos = Utils.brlToCentavos(document.getElementById('ma-valor').value);
    const contaId = document.getElementById('ma-conta').value;
    const data = document.getElementById('ma-data').value || Utils.today();
    if (!valorCentavos || valorCentavos <= 0) return alert('Informe um valor válido');
    if (!contaId) return alert('Selecione uma carteira');

    // Aporte: carteira → meta. Resgate: meta → carteira. Ambos são transferência.
    const ehAporte = _aporteModo === 'aporte';
    FinanceService.addTransaction({
      tipo: 'transferencia',
      valorCentavos,
      descricao: ehAporte ? 'Aporte para meta' : 'Resgate de meta',
      contaId: ehAporte ? contaId : _aporteMetaId,
      contaDestinoId: ehAporte ? _aporteMetaId : contaId,
      data, fonte: 'manual'
    });
    Modal.close('meta-aporte-modal');
    _rerender();
  }

  // ===== Helpers =====

  function _fillContas(selectId) {
    const sel = document.getElementById(selectId);
    const contas = FinanceService.listContas().filter(c => c.tipo !== 'meta');
    sel.innerHTML = contas
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone || '💵')} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
  }

  function _setColor(selected) {
    const picker = document.getElementById('meta-color-picker');
    picker.innerHTML = Constants.COLORS.map(cor => `
      <button type="button" class="color-dot ${cor === (selected || Constants.COLORS[0]) ? 'selected' : ''}"
              style="background:${cor}" data-color="${cor}"
              onclick="FinanceMetas.pickColor('${cor}')"></button>`).join('');
  }

  function pickColor(cor) {
    document.querySelectorAll('#meta-color-picker .color-dot').forEach(b => {
      b.classList.toggle('selected', b.dataset.color === cor);
    });
  }

  function _selectedColor() {
    const sel = document.querySelector('#meta-color-picker .color-dot.selected');
    return sel ? sel.dataset.color : Constants.COLORS[0];
  }

  function _centsToInput(c) {
    return c ? ((Number(c) || 0) / 100).toFixed(2).replace('.', ',') : '';
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return {
    sectionHtml, openNew, openEdit, save, archiveCurrent, pickColor,
    openAporte, setModo, saveAporte
  };
})();
