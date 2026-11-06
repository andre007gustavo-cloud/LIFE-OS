/**
 * ===================== VEHICLE MAINTENANCE MODAL =====================
 * Cria, edita e exclui uma manutenção do veículo (dados, zonas e peças em
 * linhas). O pagamento ligado às Finanças vem em outro componente.
 * Markup estático em #veh-maint-modal (index.html).
 */

const VehicleMaintenanceModal = (() => {

  const MODAL_ID = 'veh-maint-modal';
  const el = id => document.getElementById(id);
  const attr = Utils.escapeAttr;

  let vehicleId = null;
  let editId = null;
  let notebook = [];
  let partSeq = 0;
  const selectedZones = new Set();

  // ===== Conversões de campo =====

  const centavosToInput = centavos => (centavos ? (centavos / 100).toFixed(2).replace('.', ',') : '');
  const numberOrUndefined = text => (text.trim() === '' ? undefined : Number(text));

  /** Vazio vira undefined; texto que não é dinheiro vira NaN (o service recusa com mensagem). */
  function parseMoney(text) {
    if (text.trim() === '') return undefined;
    return Utils.brlToCentavos(text) ?? NaN;
  }

  // ===== Campos auxiliares =====

  function optionsHtml(values) {
    return values.map(v => `<option value="${attr(v)}"></option>`).join('');
  }

  function fillDatalists() {
    const shops = VehicleService.getShops(vehicleId).map(s => s.name);
    const stores = notebook.flatMap(i => i.priceHistory.map(h => h.store)).filter(Boolean);
    el('veh-dl-shops').innerHTML = optionsHtml(shops);
    el('veh-dl-stores').innerHTML = optionsHtml([...new Set(stores)]);
    el('veh-dl-parts').innerHTML = optionsHtml(notebook.map(i => i.name));
  }

  function fillCategoryOptions() {
    el('veh-m-category').innerHTML = Constants.VEHICLE.CATEGORIES
      .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  }

  function renderZoneToggles() {
    el('veh-m-zones').innerHTML = Constants.VEHICLE.ZONES.map(z => {
      const on = selectedZones.has(z.id);
      return `<button type="button" class="filter-chip${on ? ' active' : ''}" aria-pressed="${on}"
        onclick="VehicleMaintenanceModal.toggleZone('${z.id}')">${z.label}</button>`;
    }).join('');
  }

  function toggleZone(zoneId) {
    if (selectedZones.has(zoneId)) selectedZones.delete(zoneId);
    else selectedZones.add(zoneId);
    renderZoneToggles();
  }

  // ===== Linhas de peça =====

  function partInputHtml(cls, label, value, extra = '') {
    return `<input class="form-input ${cls}" aria-label="${label}" placeholder="${label}" value="${attr(value ?? '')}" ${extra}>`;
  }

  function partRowHtml(part = {}) {
    partSeq += 1;
    return `<div class="veh-part-row" data-part-id="${attr(part.id || '')}" id="veh-part-${partSeq}">
      ${partInputHtml('veh-part-name veh-p-name', 'Nome da peça', part.name,
        'list="veh-dl-parts" onchange="VehicleMaintenanceModal.fillPartFromNotebook(this)"')}
      ${partInputHtml('veh-p-brand', 'Marca', part.brand)}
      ${partInputHtml('veh-p-code', 'Código', part.code)}
      ${partInputHtml('veh-p-store', 'Loja', part.store, 'list="veh-dl-stores"')}
      ${partInputHtml('veh-p-qty', 'Quantidade', part.qty ?? 1, 'type="number" min="1" step="1"')}
      ${partInputHtml('veh-p-price', 'Preço da linha (R$)', centavosToInput(part.priceCentavos),
        'inputmode="decimal" oninput="VehicleMaintenanceModal.updateTotal()"')}
      ${partInputHtml('veh-p-warranty', 'Garantia até', part.warrantyUntil, 'type="date" title="Garantia até"')}
      <button type="button" class="btn btn-ghost btn-sm veh-part-remove" onclick="VehicleMaintenanceModal.removePartRow(this)">
        <i class="ti ti-trash"></i> Remover peça
      </button>
    </div>`;
  }

  function addPartRow(part) {
    el('veh-m-parts').insertAdjacentHTML('beforeend', partRowHtml(part));
    updateTotal();
  }

  function removePartRow(button) {
    button.closest('.veh-part-row').remove();
    updateTotal();
  }

  const partRows = () => [...el('veh-m-parts').querySelectorAll('.veh-part-row')];
  const rowValue = (row, cls) => row.querySelector(cls).value;

  function readPart(row) {
    return {
      id: row.dataset.partId || undefined,
      name: rowValue(row, '.veh-p-name'),
      brand: rowValue(row, '.veh-p-brand'),
      code: rowValue(row, '.veh-p-code'),
      store: rowValue(row, '.veh-p-store'),
      qty: numberOrUndefined(rowValue(row, '.veh-p-qty')),
      priceCentavos: parseMoney(rowValue(row, '.veh-p-price')),
      warrantyUntil: rowValue(row, '.veh-p-warranty')
    };
  }

  const isBlankPart = part => !part.name.trim() && !part.brand.trim() && !part.code.trim()
    && !part.store.trim() && !part.priceCentavos && !part.warrantyUntil;

  /** Completa marca, código e loja vazios com o que o caderno sabe da peça. */
  function fillPartFromNotebook(nameInput) {
    const wanted = Utils.normalizeText(nameInput.value);
    const known = notebook.find(i => Utils.normalizeText(i.name) === wanted);
    if (!known) return;
    const row = nameInput.closest('.veh-part-row');
    const fill = (cls, value) => {
      const input = row.querySelector(cls);
      if (value && !input.value.trim()) input.value = value;
    };
    fill('.veh-p-brand', known.lastUse.brand);
    fill('.veh-p-code', known.code);
    fill('.veh-p-store', known.lastUse.store);
  }

  // ===== Total ao vivo =====

  const moneyOrZero = value => (Number.isFinite(value) ? value : 0);

  function updateTotal() {
    const parts = partRows().map(readPart).reduce((sum, p) => sum + moneyOrZero(p.priceCentavos), 0);
    const labor = moneyOrZero(parseMoney(el('veh-m-labor').value));
    el('veh-m-total').textContent = Utils.formatBRL(parts + labor);
  }

  // ===== Abrir =====

  function fillForm(maintenance) {
    const m = maintenance || {};
    el('veh-m-date').value = m.date || Utils.today();
    el('veh-m-km').value = m.km ?? '';
    el('veh-m-title').value = m.title || '';
    el('veh-m-category').value = m.category || 'other';
    el('veh-m-shop').value = m.shop || '';
    el('veh-m-labor').value = centavosToInput(m.laborCentavos);
    el('veh-m-notes').value = m.notes || '';
    selectedZones.clear();
    (m.zones || []).forEach(z => selectedZones.add(z));
    renderZoneToggles();
    el('veh-m-parts').innerHTML = '';
    (m.parts || []).forEach(addPartRow);
    updateTotal();
  }

  function show(vehicle, maintenance) {
    vehicleId = vehicle;
    editId = maintenance ? maintenance.id : null;
    notebook = VehicleService.getPartsNotebook(vehicle);
    fillCategoryOptions();
    fillDatalists();
    fillForm(maintenance);
    el('veh-m-heading').textContent = maintenance ? 'Editar manutenção' : 'Nova manutenção';
    el('veh-m-remove').style.display = maintenance ? '' : 'none';
    Modal.open(MODAL_ID);
    el('veh-m-title').focus();
  }

  function openNew(id) {
    if (VehicleService.getById(id)) show(id, null);
  }

  function open(id, maintenanceId) {
    const maintenance = VehicleService.getById(id)?.maintenances.find(m => m.id === maintenanceId);
    if (!maintenance) return Feedback.toast('Manutenção não encontrada', 'error');
    show(id, maintenance);
  }

  // ===== Salvar e excluir =====

  function readForm() {
    return {
      date: el('veh-m-date').value,
      km: numberOrUndefined(el('veh-m-km').value),
      title: el('veh-m-title').value,
      category: el('veh-m-category').value,
      zones: [...selectedZones],
      shop: el('veh-m-shop').value,
      parts: partRows().map(readPart).filter(p => !isBlankPart(p)),
      laborCentavos: parseMoney(el('veh-m-labor').value),
      notes: el('veh-m-notes').value
    };
  }

  function refresh() {
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function save() {
    const dto = readForm();
    const result = editId
      ? VehicleService.updateMaintenance(vehicleId, editId, dto)
      : VehicleService.addMaintenance(vehicleId, dto);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Manutenção salva', 'success');
    refresh();
  }

  function remove() {
    if (!editId) return;
    const message = 'Excluir esta manutenção? Os lançamentos vinculados continuam nas Finanças.';
    if (!confirm(message)) return;
    const result = VehicleService.removeMaintenance(vehicleId, editId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Manutenção excluída', 'success');
    refresh();
  }

  return {
    openNew, open, save, remove,
    addPartRow, removePartRow, updateTotal, toggleZone, fillPartFromNotebook,
    partRowHtml
  };
})();
