/**
 * ===================== VEHICLE PLAN MODAL =====================
 * Cria, edita e exclui um item do plano preventivo do veículo: título,
 * intervalo (km e/ou meses), o que conta como feito (categoria e palavras),
 * zonas, se é crítico e a "última vez" informada à mão.
 * Markup estático em #veh-plan-modal (index.html).
 */

const VehiclePlanModal = (() => {

  const MODAL_ID = 'veh-plan-modal';
  const { CATEGORIES, ZONES } = Constants.VEHICLE;
  const el = id => document.getElementById(id);
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  let vehicleId = null;
  let editId = null;
  const selectedZones = new Set();

  const numberOrBlank = text => (text.trim() === '' ? '' : Number(text));

  // ===== Campos =====

  function fillCategoryOptions() {
    el('veh-p-category').innerHTML = '<option value="">Qualquer categoria</option>'
      + CATEGORIES.map(c => `<option value="${attr(c.id)}">${esc(c.label)}</option>`).join('');
  }

  function renderZoneToggles() {
    el('veh-p-zones').innerHTML = ZONES.map(z => {
      const on = selectedZones.has(z.id);
      return `<button type="button" class="filter-chip${on ? ' active' : ''}" aria-pressed="${on}"
        onclick="VehiclePlanModal.toggleZone('${attr(z.id)}')">${esc(z.label)}</button>`;
    }).join('');
  }

  function toggleZone(zoneId) {
    if (selectedZones.has(zoneId)) selectedZones.delete(zoneId);
    else selectedZones.add(zoneId);
    renderZoneToggles();
  }

  function fillForm(item) {
    el('veh-p-title').value = item.title || '';
    el('veh-p-interval-km').value = item.intervalKm ?? '';
    el('veh-p-interval-months').value = item.intervalMonths ?? '';
    el('veh-p-category').value = item.category || '';
    el('veh-p-keywords').value = (item.keywords || []).join(', ');
    el('veh-p-highlight').checked = Boolean(item.highlight);
    el('veh-p-base-date').value = item.baseDate || '';
    el('veh-p-base-date').max = Utils.today();
    el('veh-p-base-km').value = item.baseKm ?? '';
    el('veh-p-notes').value = item.notes || '';
    selectedZones.clear();
    (item.zones || []).forEach(z => selectedZones.add(z));
    renderZoneToggles();
  }

  function readForm() {
    return {
      title: el('veh-p-title').value,
      intervalKm: numberOrBlank(el('veh-p-interval-km').value),
      intervalMonths: numberOrBlank(el('veh-p-interval-months').value),
      category: el('veh-p-category').value,
      keywords: el('veh-p-keywords').value,
      highlight: el('veh-p-highlight').checked,
      baseDate: el('veh-p-base-date').value,
      baseKm: numberOrBlank(el('veh-p-base-km').value),
      notes: el('veh-p-notes').value,
      zones: [...selectedZones]
    };
  }

  // ===== Abrir =====

  function show(vehicle, item) {
    vehicleId = vehicle;
    editId = item ? item.id : null;
    fillCategoryOptions();
    fillForm(item || {});
    el('veh-p-heading').textContent = item ? 'Editar item do plano' : 'Novo item do plano';
    el('veh-p-remove').style.display = item ? '' : 'none';
    Modal.open(MODAL_ID);
    el('veh-p-title').focus();
  }

  function openNew(id) {
    if (VehicleService.getById(id)) show(id, null);
  }

  function open(id, itemId) {
    const health = VehicleHealthService.getHealth(id);
    const entry = health.erro ? null : health.items.find(e => e.item.id === itemId);
    if (!entry) return Feedback.toast('Item do plano não encontrado', 'error');
    show(id, entry.item);
  }

  // ===== Salvar e excluir =====

  function save() {
    const dto = readForm();
    const result = editId
      ? VehicleHealthService.updateItem(vehicleId, editId, dto)
      : VehicleHealthService.addItem(vehicleId, dto);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Item do plano salvo', 'success');
    VehicleView.refresh();
  }

  function remove() {
    if (!editId || !confirm('Excluir este item do plano? As manutenções já registradas continuam no histórico.')) return;
    const result = VehicleHealthService.removeItem(vehicleId, editId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Item do plano excluído', 'success');
    VehicleView.refresh();
  }

  return { openNew, open, save, remove, toggleZone };
})();
