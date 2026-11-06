/**
 * ===================== VEHICLE CARD MODAL =====================
 * Cria, edita e exclui um card aberto do quadro do veículo (Ideias, A fazer,
 * Fazendo): título, tipo, coluna, zonas, categoria, estimativa e observações.
 * Concluir um card é com o VehicleMaintenanceModal.openComplete.
 * Markup estático em #veh-card-modal (index.html).
 */

const VehicleCardModal = (() => {

  const MODAL_ID = 'veh-card-modal';
  const { CARD_STATUS, CARD_STATUSES, CARD_TYPE, CARD_TYPES, CATEGORIES, ZONES } = Constants.VEHICLE;
  const el = id => document.getElementById(id);
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  let vehicleId = null;
  let editId = null;
  const selectedZones = new Set();

  const centavosToInput = centavos => (centavos ? Utils.centavosToReais(centavos).toFixed(2).replace('.', ',') : '');

  // ===== Campos =====

  function optionsHtml(items) {
    return items.map(item => `<option value="${attr(item.id)}">${esc(item.label)}</option>`).join('');
  }

  /** Sintoma só aparece quando o card já é um (o modo sintoma completo vem em outra tela). */
  function fillTypeOptions(currentType) {
    const types = CARD_TYPES.filter(t => t.id !== CARD_TYPE.SYMPTOM || currentType === CARD_TYPE.SYMPTOM);
    el('veh-c-type').innerHTML = optionsHtml(types);
  }

  function fillStaticOptions() {
    el('veh-c-status').innerHTML = optionsHtml(CARD_STATUSES.filter(s => s.id !== CARD_STATUS.DONE));
    el('veh-c-category').innerHTML = optionsHtml(CATEGORIES);
  }

  function renderZoneToggles() {
    el('veh-c-zones').innerHTML = ZONES.map(z => {
      const on = selectedZones.has(z.id);
      return `<button type="button" class="filter-chip${on ? ' active' : ''}" aria-pressed="${on}"
        onclick="VehicleCardModal.toggleZone('${attr(z.id)}')">${esc(z.label)}</button>`;
    }).join('');
  }

  function toggleZone(zoneId) {
    if (selectedZones.has(zoneId)) selectedZones.delete(zoneId);
    else selectedZones.add(zoneId);
    renderZoneToggles();
  }

  // ===== Abrir =====

  function fillForm(card) {
    fillTypeOptions(card.type);
    el('veh-c-title').value = card.title || '';
    el('veh-c-type').value = card.type || CARD_TYPE.SERVICE;
    el('veh-c-status').value = card.status || CARD_STATUS.TODO;
    el('veh-c-category').value = card.category || 'other';
    el('veh-c-estimate').value = centavosToInput(card.estimateCentavos);
    el('veh-c-notes').value = card.notes || '';
    selectedZones.clear();
    (card.zones || []).forEach(z => selectedZones.add(z));
    renderZoneToggles();
  }

  function show(vehicle, card, isEdit) {
    vehicleId = vehicle;
    editId = isEdit ? card.id : null;
    fillStaticOptions();
    fillForm(card);
    el('veh-c-heading').textContent = isEdit ? 'Editar card' : 'Novo card';
    el('veh-c-remove').style.display = isEdit ? '' : 'none';
    Modal.open(MODAL_ID);
    el('veh-c-title').focus();
  }

  function openNew(id, { status = CARD_STATUS.TODO, type = CARD_TYPE.SERVICE } = {}) {
    if (VehicleService.getById(id)) show(id, { status, type }, false);
  }

  function open(id, cardId) {
    const card = VehicleService.getMaintenance(id, cardId);
    if (card.erro) return Feedback.toast(card.erro, 'error');
    if (VehicleService.isDone(card)) return VehicleMaintenanceModal.open(id, cardId);
    show(id, card, true);
  }

  // ===== Salvar e excluir =====

  function readForm() {
    const estimate = el('veh-c-estimate').value;
    return {
      title: el('veh-c-title').value,
      type: el('veh-c-type').value,
      status: el('veh-c-status').value,
      zones: [...selectedZones],
      category: el('veh-c-category').value,
      estimateCentavos: estimate.trim() === '' ? undefined : Utils.brlToCentavos(estimate) ?? NaN,
      notes: el('veh-c-notes').value
    };
  }

  function refresh() {
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function save() {
    const dto = readForm();
    if (Number.isNaN(dto.estimateCentavos)) return Feedback.toast('Estimativa inválida: use um valor como 800,00', 'error');
    const result = editId
      ? VehicleService.updateMaintenance(vehicleId, editId, dto)
      : VehicleService.addMaintenance(vehicleId, dto);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Card salvo', 'success');
    refresh();
  }

  function remove() {
    if (!editId || !confirm('Excluir este card?')) return;
    const result = VehicleService.removeMaintenance(vehicleId, editId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Card excluído', 'success');
    refresh();
  }

  return { openNew, open, save, remove, toggleZone };
})();
