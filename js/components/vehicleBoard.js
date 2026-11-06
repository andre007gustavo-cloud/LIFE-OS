/**
 * ===================== VEHICLE BOARD =====================
 * Aba Quadro do veículo: colunas Ideias, A fazer, Fazendo e Feito (a coluna
 * Sintomas entra antes de Ideias, com board.symptoms). Cada card abre o
 * VehicleCardModal; o select "Mover para…" troca de coluna ou abre o
 * VehicleMaintenanceModal.openComplete (Feito). Só lê dos services; qualquer
 * gravação vem de uma ação do usuário.
 */

const VehicleBoard = (() => {

  const { CARD_STATUS, CARD_STATUSES, CARD_TYPES, ZONES } = Constants.VEHICLE;
  const MOVE_DONE_LABEL = 'Feito (concluir)';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const labelOf = (list, id) => (list.find(x => x.id === id) || {}).label || id;

  // ===== Card =====

  function zoneBadgesHtml(card) {
    return card.zones.map(z => `<span class="badge area">${esc(labelOf(ZONES, z))}</span>`).join('');
  }

  function cardMainHtml(vehicleId, card) {
    const estimate = card.estimateCentavos
      ? `<span class="veh-card-estimate">Estimado ${Utils.formatBRL(card.estimateCentavos)}</span>` : '';
    return `<button type="button" class="veh-card-main"
      onclick="VehicleCardModal.open('${attr(vehicleId)}','${attr(card.id)}')">
      <span class="veh-card-title">${esc(card.title)}</span>
      <span class="veh-card-badges"><span class="badge time">${esc(labelOf(CARD_TYPES, VehicleService.typeOf(card)))}</span>${zoneBadgesHtml(card)}</span>
      ${estimate}
    </button>`;
  }

  function moveSelectHtml(vehicleId, card) {
    const current = VehicleService.statusOf(card);
    const targets = CARD_STATUSES.filter(s => s.id !== current && s.id !== CARD_STATUS.DONE)
      .map(s => `<option value="${attr(s.id)}">${esc(s.label)}</option>`).join('');
    return `<select class="form-select veh-card-move" aria-label="Mover ${attr(card.title)}"
      onchange="VehicleBoard.move('${attr(vehicleId)}','${attr(card.id)}',this)">
      <option value="">Mover para…</option>${targets}
      <option value="${CARD_STATUS.DONE}">${MOVE_DONE_LABEL}</option></select>`;
  }

  const cardHtml = (vehicleId, card) =>
    `<div class="veh-card">${cardMainHtml(vehicleId, card)}${moveSelectHtml(vehicleId, card)}</div>`;

  // ===== Colunas =====

  function columnHtml(label, count, subtotal, bodyHtml, extraHtml = '') {
    const sub = subtotal == null ? '' : `<div class="veh-col-sub">${Utils.formatBRL(subtotal)} estimado</div>`;
    return `<section class="veh-col" aria-label="${attr(label)}">
      <header class="veh-col-head"><span>${esc(label)}</span><span class="veh-col-count">${count}</span></header>
      ${sub}${bodyHtml || '<div class="veh-col-empty">Nenhum card</div>'}${extraHtml}
    </section>`;
  }

  function openColumnHtml(vehicleId, column) {
    const body = column.cards.map(card => cardHtml(vehicleId, card)).join('');
    return columnHtml(labelOf(CARD_STATUSES, column.status), column.cards.length, column.estimateCentavos, body);
  }

  function doneItemHtml(vehicleId, m) {
    return `<button type="button" class="veh-recent-item" onclick="VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(m.id)}')">
      <span class="veh-recent-date">${Utils.fmtDate(m.date)}</span>
      <span class="veh-recent-title">${esc(m.title)}</span>
    </button>`;
  }

  function doneColumnHtml(vehicleId, board) {
    const total = VehicleService.listMaintenances(vehicleId).length;
    const body = board.recentDone.map(m => doneItemHtml(vehicleId, m)).join('');
    const seeAll = total ? `<button type="button" class="btn btn-ghost btn-sm veh-col-all"
      onclick="setProjTab('maintenances')">Ver todas</button>` : '';
    return columnHtml(labelOf(CARD_STATUSES, CARD_STATUS.DONE), total, null, body, seeAll);
  }

  // ===== Tela =====

  function headHtml(vehicleId, board) {
    return `<div class="veh-hist-head">
      <div><div class="card-title">Quadro</div>
        <div class="veh-planned">Planejado (A fazer + Fazendo): <strong>${Utils.formatBRL(board.plannedCentavos)}</strong></div></div>
      <button class="btn btn-primary btn-sm" onclick="VehicleCardModal.openNew('${attr(vehicleId)}')">
        <i class="ti ti-plus"></i> Novo card</button>
    </div>`;
  }

  function render(vehicle) {
    const board = VehicleBoardService.getBoard(vehicle.id);
    document.getElementById('proj-tab-content').innerHTML = `${headHtml(vehicle.id, board)}
      <div class="veh-board">${board.columns.map(c => openColumnHtml(vehicle.id, c)).join('')}${doneColumnHtml(vehicle.id, board)}</div>`;
  }

  // ===== Ações =====

  function refresh() {
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  /** "Feito (concluir)" abre o modal e o select volta a "Mover para…" (se o André cancelar, nada mudou). */
  function move(vehicleId, cardId, select) {
    const target = select.value;
    select.value = '';
    if (target === CARD_STATUS.DONE) return VehicleMaintenanceModal.openComplete(vehicleId, cardId);
    if (!target) return;
    const result = VehicleService.updateMaintenance(vehicleId, cardId, { status: target });
    if (result.erro) return Feedback.toast(result.erro, 'error');
    refresh();
  }

  return { render, move };
})();
