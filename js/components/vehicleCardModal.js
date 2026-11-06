/**
 * ===================== VEHICLE CARD MODAL =====================
 * Cria, edita e exclui um card aberto do quadro do veículo (Ideias, A fazer,
 * Fazendo): título, tipo, coluna, zonas, categoria, estimativa e observações.
 * No modo sintoma (descrição, zonas obrigatórias e observações) também pede
 * o diagnóstico ao Jarvis, vira serviço ou fecha ligado à manutenção que o
 * resolveu. Concluir um card é com o VehicleMaintenanceModal.openComplete.
 * Markup estático em #veh-card-modal (index.html).
 */

const VehicleCardModal = (() => {

  const MODAL_ID = 'veh-card-modal';
  const { CARD_STATUS, CARD_STATUSES, CARD_TYPE, CARD_TYPES, CATEGORIES, ZONES, DIAGNOSIS_TEMPLATE } = Constants.VEHICLE;
  const el = id => document.getElementById(id);
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const SYMPTOM_ONLY = ['veh-c-diagnose'];
  const NOT_SYMPTOM = ['veh-c-row-kind', 'veh-c-row-meta'];

  let vehicleId = null;
  let editId = null;
  let symptomMode = false;
  const selectedZones = new Set();

  const centavosToInput = centavos => (centavos ? Utils.centavosToReais(centavos).toFixed(2).replace('.', ',') : '');

  // ===== Pedido de diagnóstico =====

  /** Texto puro (vai para a área de transferência, nunca para innerHTML). */
  function buildDiagnosisRequest({ nickname, vehicleId: vId, cardId, zoneLabel, description }) {
    const values = { nickname, vehicleId: vId, cardId, zone: zoneLabel, description };
    return DIAGNOSIS_TEMPLATE.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
  }

  function diagnosisFor(card) {
    const vehicle = VehicleService.getById(vehicleId);
    const zoneLabels = card.zones.map(z => (ZONES.find(x => x.id === z) || {}).label || z).join(', ');
    return buildDiagnosisRequest({
      nickname: vehicle.nickname || vehicle.model, vehicleId, cardId: card.id, zoneLabel: zoneLabels, description: card.title
    });
  }

  /** Copia e abre o Jarvis no mesmo toque (sem await antes: o iOS bloqueia a abertura depois). */
  function copyAndOpenJarvis(text) {
    let copying;
    try {
      copying = navigator.clipboard.writeText(text);
    } catch (error) {
      copying = Promise.reject(error);
    }
    AiChatView.openJarvis();
    copying
      .then(() => Feedback.toast('Pedido copiado: cole no Jarvis', 'success'))
      .catch(() => Feedback.toast(`Não consegui copiar. Copie à mão e cole no Jarvis: ${text}`, 'error'));
  }

  // ===== Campos =====

  function optionsHtml(items) {
    return items.map(item => `<option value="${attr(item.id)}">${esc(item.label)}</option>`).join('');
  }

  /** Sintoma só aparece quando o card já é um (o modo sintoma esconde este campo). */
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

  // ===== Resolvido por… =====

  /** Manutenções concluídas, as da mesma zona do sintoma primeiro (cada grupo do mais novo ao mais antigo). */
  function resolverCandidates(card) {
    const all = VehicleService.listMaintenances(vehicleId);
    const sameZone = m => m.zones.some(z => card.zones.includes(z));
    return [...all.filter(sameZone), ...all.filter(m => !sameZone(m))];
  }

  function fillResolverOptions(card) {
    const candidates = resolverCandidates(card);
    const placeholder = candidates.length ? 'Resolvido por…' : 'Nenhuma manutenção concluída ainda';
    el('veh-c-resolver').innerHTML = `<option value="">${placeholder}</option>` + candidates
      .map(m => `<option value="${attr(m.id)}">${esc(Utils.fmtDate(m.date))} · ${esc(m.title)}</option>`).join('');
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

  function applyMode(isEdit, card) {
    const noun = symptomMode ? 'sintoma' : 'card';
    el('veh-c-heading').textContent = `${isEdit ? 'Editar' : 'Novo'} ${noun}`;
    el('veh-c-title-label').textContent = symptomMode ? 'Descrição do sintoma' : 'Título';
    el('veh-c-remove').style.display = isEdit ? '' : 'none';
    SYMPTOM_ONLY.forEach(id => { el(id).hidden = !symptomMode; });
    NOT_SYMPTOM.forEach(id => { el(id).hidden = symptomMode; });
    el('veh-c-symptom-edit').hidden = !(symptomMode && isEdit);
    if (symptomMode && isEdit) fillResolverOptions(card);
  }

  function show(vehicle, card, isEdit) {
    vehicleId = vehicle;
    editId = isEdit ? card.id : null;
    symptomMode = (card.type || CARD_TYPE.SERVICE) === CARD_TYPE.SYMPTOM;
    fillStaticOptions();
    fillForm(card);
    applyMode(isEdit, card);
    Modal.open(MODAL_ID);
    el('veh-c-title').focus();
  }

  function openNew(id, { status = CARD_STATUS.TODO, type = CARD_TYPE.SERVICE } = {}) {
    if (VehicleService.getById(id)) show(id, { status, type }, false);
  }

  const openNewSymptom = id => openNew(id, { type: CARD_TYPE.SYMPTOM });

  function open(id, cardId) {
    const card = VehicleService.getMaintenance(id, cardId);
    if (card.erro) return Feedback.toast(card.erro, 'error');
    if (VehicleService.isDone(card)) return VehicleMaintenanceModal.open(id, cardId);
    show(id, card, true);
  }

  // ===== Salvar e excluir =====

  function readCardForm() {
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

  /** Sintoma não tem coluna, categoria nem estimativa: abre sempre em A fazer. */
  const readSymptomForm = () => ({
    title: el('veh-c-title').value,
    type: CARD_TYPE.SYMPTOM,
    status: CARD_STATUS.TODO,
    zones: [...selectedZones],
    notes: el('veh-c-notes').value
  });

  function refresh() {
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function validate(dto) {
    if (Number.isNaN(dto.estimateCentavos)) return 'Estimativa inválida: use um valor como 800,00';
    if (symptomMode && !dto.zones.length) return 'Escolha ao menos uma zona do carro para o sintoma';
    return '';
  }

  /** Grava o formulário. Devolve o card salvo, ou null depois de mostrar o motivo. */
  function persist() {
    const dto = symptomMode ? readSymptomForm() : readCardForm();
    const invalid = validate(dto);
    if (invalid) return Feedback.toast(invalid, 'error') || null;
    const result = editId
      ? VehicleService.updateMaintenance(vehicleId, editId, dto)
      : VehicleService.addMaintenance(vehicleId, dto);
    if (result.erro) return Feedback.toast(result.erro, 'error') || null;
    Modal.close(MODAL_ID);
    refresh();
    return result;
  }

  function save() {
    if (persist()) Feedback.toast(symptomMode ? 'Sintoma salvo' : 'Card salvo', 'success');
  }

  function saveAndDiagnose() {
    const card = persist();
    if (card) copyAndOpenJarvis(diagnosisFor(card));
  }

  function remove() {
    if (!editId || !confirm(symptomMode ? 'Excluir este sintoma?' : 'Excluir este card?')) return;
    const result = VehicleService.removeMaintenance(vehicleId, editId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast(symptomMode ? 'Sintoma excluído' : 'Card excluído', 'success');
    refresh();
  }

  // ===== Ações do sintoma =====

  function finishSymptomAction(result, message) {
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast(message, 'success');
    refresh();
  }

  function convertToService() {
    finishSymptomAction(VehicleBoardService.convertSymptom(vehicleId, editId), 'Sintoma virou serviço em A fazer');
  }

  function resolve() {
    const maintenanceId = el('veh-c-resolver').value;
    if (!maintenanceId) return Feedback.toast('Escolha a manutenção que resolveu o sintoma', 'error');
    finishSymptomAction(VehicleBoardService.resolveSymptom(vehicleId, editId, maintenanceId), 'Sintoma resolvido');
  }

  return {
    openNew, openNewSymptom, open, save, saveAndDiagnose, remove, toggleZone,
    convertToService, resolve, buildDiagnosisRequest
  };
})();
