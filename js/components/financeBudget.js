/**
 * ===================== FINANCE BUDGET (Fase 2) =====================
 * UI do orçamento por categoria: a seção dentro de Finanças, as barras
 * compartilhadas com o card do Dashboard e o modal de definir/editar.
 * Componente de UI: lê o FinanceService, nunca o Storage direto.
 */

const FinanceBudget = (() => {

  let _catId = null; // categoria em edição no modal

  const CHIP = { ok: 'Tranquilo', alerta: 'Atenção', estourado: 'Estourou' };

  // ===== Barra compartilhada (Finanças + Dashboard) =====

  /** Barra de progresso colorida por estado; largura limitada a 100%. */
  function barHtml(o) {
    const w = Math.min(100, Math.max(0, o.percentual));
    return `<div class="orc-bar"><div class="orc-bar-fill orc-${o.estado}" style="width:${w}%"></div></div>`;
  }

  // ===== Seção da view de Finanças =====

  function sectionHtml(mes) {
    const orcs = FinanceService.getOrcamentoMes(mes);
    const resumo = FinanceService.getResumoOrcamento(mes);
    const dias = FinanceService.diasRestantesMes(mes);
    const lista = orcs.length
      ? orcs.map(o => rowHtml(o, dias)).join('')
      : `<div class="text-muted" style="margin:4px 0 8px">Nenhum orçamento definido ainda</div>`;
    return `<div class="card orc-section">
      <div class="card-title"><i class="ti ti-target-arrow"></i> Orçamento</div>
      ${resumoHtml(resumo)}
      ${lista}
      ${semOrcamentoHtml(resumo.categoriasSemOrcamento)}
    </div>`;
  }

  function resumoHtml(r) {
    const sobra = r.totalRestanteCentavos;
    return `<div class="orc-resumo">
      <div class="stat"><div class="stat-val">${Utils.formatBRL(r.totalOrcadoCentavos)}</div><div class="stat-label">Orçado</div></div>
      <div class="stat"><div class="stat-val">${Utils.formatBRL(r.totalGastoCentavos)}</div><div class="stat-label">Gasto</div></div>
      <div class="stat ${sobra >= 0 ? 'green' : 'red'}"><div class="stat-val">${Utils.formatBRL(sobra)}</div><div class="stat-label">Sobra</div></div>
    </div>`;
  }

  /** Uma categoria COM orçamento: gasto/limite, barra, chip e dicas do mês. */
  function rowHtml(o, dias) {
    const cat = FinanceService.getCategoriaById(o.categoriaId);
    const nome = `${cat?.icone || '📦'} ${cat?.nome || 'Categoria'}`;
    const carry = carryHtml(o.carryoverCentavos);
    const foot = o.estado === 'estourado'
      ? `<span class="orc-over">estourou ${Utils.formatBRL(-o.restanteCentavos)}</span>`
      : `<span class="orc-left">${Utils.formatBRL(o.restanteCentavos)} restante</span>`;
    const perDia = o.porDiaCentavos != null
      ? `<span class="orc-perdia">≈ ${Utils.formatBRL(o.porDiaCentavos)}/dia · ${dias} ${dias === 1 ? 'dia' : 'dias'}</span>`
      : '';
    return `<div class="orc-row" onclick="FinanceBudget.openEdit('${o.categoriaId}')">
      <div class="orc-row-head">
        <span class="orc-cat">${Utils.escapeHtml(nome)}</span>
        <span class="orc-chip orc-${o.estado}">${CHIP[o.estado]}</span>
      </div>
      <div class="orc-row-sub">
        <span class="orc-spent">${Utils.formatBRL(o.gastoCentavos)} / ${Utils.formatBRL(o.limiteCentavos)}</span>
        ${carry}
      </div>
      ${barHtml(o)}
      <div class="orc-row-foot">${foot}${perDia}</div>
    </div>`;
  }

  /** Rótulo do acumulado (rollover); vazio quando não há carryover. */
  function carryHtml(carryover) {
    if (!carryover) return '';
    const sinal = carryover > 0 ? '+' : '−';
    return `<span class="orc-carry">${sinal}${Utils.formatBRL(Math.abs(carryover))} acum.</span>`;
  }

  /** Categorias de despesa sem orçamento, cada uma com CTA. */
  function semOrcamentoHtml(ids) {
    if (!ids.length) return '';
    const rows = ids.map(id => {
      const cat = FinanceService.getCategoriaById(id);
      if (!cat) return '';
      return `<div class="orc-sem-row">
        <span class="orc-cat">${Utils.escapeHtml(`${cat.icone} ${cat.nome}`)}</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceBudget.openDefine('${id}')">definir orçamento</button>
      </div>`;
    }).join('');
    return `<div class="orc-sem-head">Sem orçamento</div>${rows}`;
  }

  // ===== Card do Dashboard =====

  /** Linhas compactas (nome, gasto/limite, barra) para o card do Dashboard. */
  function dashRowsHtml(mes) {
    const orcs = FinanceService.getOrcamentoMes(mes);
    if (!orcs.length) return '';
    return orcs.map(o => {
      const cat = FinanceService.getCategoriaById(o.categoriaId);
      const nome = `${cat?.icone || '📦'} ${cat?.nome || 'Categoria'}`;
      return `<div class="orc-dash-row">
        <div class="orc-dash-head">
          <span class="orc-dash-cat">${Utils.escapeHtml(nome)}</span>
          <span class="orc-dash-val orc-${o.estado}">${Utils.formatBRL(o.gastoCentavos)} / ${Utils.formatBRL(o.limiteCentavos)}</span>
        </div>
        ${barHtml(o)}
      </div>`;
    }).join('');
  }

  // ===== Modal definir/editar =====

  function openDefine(catId) {
    _start(catId, 'Definir orçamento', { limiteCentavos: 0, rollover: false }, false);
  }

  function openEdit(catId) {
    const o = FinanceService.getOrcamentoByCategoria(catId);
    if (!o) return openDefine(catId);
    _start(catId, 'Editar orçamento', o, true);
  }

  function _start(catId, title, o, isEdit) {
    _catId = catId;
    const cat = FinanceService.getCategoriaById(catId);
    document.getElementById('orc-modal-title').textContent = title;
    document.getElementById('orc-modal-cat').textContent = cat ? `${cat.icone} ${cat.nome}` : '';
    document.getElementById('orc-value').value = o.limiteCentavos ? centsToInput(o.limiteCentavos) : '';
    document.getElementById('orc-rollover').checked = !!o.rollover;
    document.getElementById('orc-remove-btn').style.display = isEdit ? '' : 'none';
    Modal.open('orc-modal');
    document.getElementById('orc-value').focus();
  }

  function centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  function save() {
    const limiteCentavos = Utils.brlToCentavos(document.getElementById('orc-value').value);
    if (!limiteCentavos || limiteCentavos <= 0) return alert('Informe um limite válido maior que zero');
    FinanceService.setOrcamento({
      categoriaId: _catId, limiteCentavos,
      rollover: document.getElementById('orc-rollover').checked
    });
    Modal.close('orc-modal');
    _rerender();
  }

  function removeCurrent() {
    if (!confirm('Remover orçamento desta categoria?')) return;
    FinanceService.removeOrcamento(_catId);
    Modal.close('orc-modal');
    _rerender();
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return { barHtml, sectionHtml, dashRowsHtml, openDefine, openEdit, save, removeCurrent };
})();
