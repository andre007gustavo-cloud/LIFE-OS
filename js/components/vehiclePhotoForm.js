/**
 * ===================== VEHICLE PHOTO FORM =====================
 * Formulário de edição de uma foto do veículo (legenda, data, km, zonas,
 * vínculo e papel), desenhado dentro do painel do VehiclePhotoViewer. Quem
 * abre diz o que fazer ao salvar ou cancelar; aqui só se lê o formulário e
 * chama VehicleService.updatePhoto.
 */

const VehiclePhotoForm = (() => {

  const { CAPTION_MAX, ROLES } = Constants.VEHICLE.PHOTO;
  const { ZONES, CARD_TYPE } = Constants.VEHICLE;
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const el = id => document.getElementById(id);
  const NO_LINK_LABEL = 'Sem vínculo';

  let vehicleId = null;
  let photoId = null;
  let callbacks = null;
  const selectedZones = new Set();

  // ===== Opções do vínculo =====

  function recordLabel(record) {
    if (VehicleService.typeOf(record) === CARD_TYPE.SYMPTOM) return `Sintoma · ${record.title}`;
    if (VehicleService.isDone(record)) return `${Utils.fmtDateFull(record.date)} · ${record.title}`;
    return `Quadro · ${record.title}`;
  }

  function linkOptionsHtml(selectedId) {
    const records = VehicleService.listCards(vehicleId);
    const options = records.map(r =>
      `<option value="${attr(r.id)}"${r.id === selectedId ? ' selected' : ''}>${esc(recordLabel(r))}</option>`);
    return `<option value="">${NO_LINK_LABEL}</option>${options.join('')}`;
  }

  function roleOptionsHtml(selectedRole) {
    const options = ROLES.map(r =>
      `<option value="${attr(r.id)}"${r.id === selectedRole ? ' selected' : ''}>${esc(r.label)}</option>`);
    return `<option value="">Nenhum</option>${options.join('')}`;
  }

  // ===== Zonas =====

  function renderZones() {
    el('veh-pf-zones').innerHTML = ZONES.map(zone => {
      const on = selectedZones.has(zone.id);
      return `<button type="button" class="filter-chip veh-pf-zone${on ? ' active' : ''}" aria-pressed="${on}" data-zone="${attr(zone.id)}"
        onclick="VehiclePhotoForm.toggleZone('${attr(zone.id)}')">${esc(zone.label)}</button>`;
    }).join('');
  }

  function toggleZone(zoneId) {
    if (selectedZones.has(zoneId)) selectedZones.delete(zoneId);
    else selectedZones.add(zoneId);
    renderZones();
    el('veh-pf-zones').querySelector(`[data-zone="${zoneId}"]`)?.focus();
  }

  // ===== Marcação =====

  function formHtml(photo) {
    return `<form class="veh-pf" onsubmit="event.preventDefault();VehiclePhotoForm.save()" novalidate>
      <div class="form-group"><label class="form-label" for="veh-pf-caption">Legenda</label>
        <input class="form-input" id="veh-pf-caption" maxlength="${CAPTION_MAX}" value="${attr(photo.caption || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label" for="veh-pf-date">Data</label>
          <input class="form-input" id="veh-pf-date" type="date" max="${attr(Utils.today())}" value="${attr(photo.date)}"
            oninput="VehiclePhotoForm.updateDateButton()"></div>
        <div class="form-group"><label class="form-label" for="veh-pf-km">Km</label>
          <input class="form-input" id="veh-pf-km" type="number" min="0" step="1" inputmode="numeric"
            value="${attr(Number.isInteger(photo.km) ? photo.km : '')}"></div>
      </div>
      <div class="form-group"><button type="button" class="btn btn-sm" id="veh-pf-use-date" hidden
        onclick="VehiclePhotoForm.useRecordDate()"></button></div>
      <div class="form-group"><span class="form-label" id="veh-pf-zones-label">Zonas do carro</span>
        <div class="veh-zone-toggles" id="veh-pf-zones" role="group" aria-labelledby="veh-pf-zones-label"></div></div>
      <div class="form-group"><label class="form-label" for="veh-pf-link">Vínculo</label>
        <select class="form-select" id="veh-pf-link" onchange="VehiclePhotoForm.onLinkChange()">${linkOptionsHtml(photo.maintenanceId)}</select></div>
      <div class="form-group"><label class="form-label" for="veh-pf-role">Papel</label>
        <select class="form-select" id="veh-pf-role"${photo.maintenanceId ? '' : ' disabled'}>${roleOptionsHtml(photo.role)}</select></div>
      <p class="veh-pf-error" id="veh-pf-error" role="alert"></p>
      <div class="veh-pf-actions">
        <button type="submit" class="btn btn-primary">Salvar</button>
        <button type="button" class="btn" onclick="VehiclePhotoForm.cancel()">Cancelar</button>
      </div>
    </form>`;
  }

  // ===== Vínculo =====

  const linkedSuggestion = () => {
    const id = el('veh-pf-link').value;
    return id ? VehiclePhotoService.suggestionFor(vehicleId, id) : null;
  };

  /** Oferece a data do registro quando ela difere da que está no campo. */
  function updateDateButton() {
    const button = el('veh-pf-use-date');
    const date = linkedSuggestion()?.date;
    const differs = Boolean(date) && date !== el('veh-pf-date').value;
    button.hidden = !differs;
    button.dataset.date = differs ? date : '';
    button.textContent = differs ? `Usar a data do registro (${Utils.fmtDateFull(date)})` : '';
  }

  function useRecordDate() {
    const date = el('veh-pf-use-date').dataset.date;
    if (date) el('veh-pf-date').value = date;
    updateDateButton();
    el('veh-pf-date').focus();
  }

  function fillEmptyFromRecord(suggestion) {
    const kmInput = el('veh-pf-km');
    if (kmInput.value.trim() === '' && Number.isInteger(suggestion.km)) kmInput.value = suggestion.km;
    if (!selectedZones.size) {
      suggestion.zones.forEach(zoneId => selectedZones.add(zoneId));
      renderZones();
    }
  }

  function onLinkChange() {
    const suggestion = linkedSuggestion();
    const roleSelect = el('veh-pf-role');
    roleSelect.disabled = !suggestion;
    if (!suggestion) roleSelect.value = '';
    else fillEmptyFromRecord(suggestion);
    updateDateButton();
  }

  // ===== Salvar =====

  function readPatch() {
    const kmText = el('veh-pf-km').value.trim();
    return {
      caption: el('veh-pf-caption').value,
      date: el('veh-pf-date').value,
      km: kmText === '' ? undefined : Number(kmText),
      zones: [...selectedZones],
      maintenanceId: el('veh-pf-link').value,
      role: el('veh-pf-role').value
    };
  }

  function save() {
    const result = VehicleService.updatePhoto(vehicleId, photoId, readPatch());
    if (result.erro) {
      el('veh-pf-error').textContent = result.erro;
      return;
    }
    callbacks.onSaved(result);
  }

  function cancel() {
    callbacks.onCancel();
  }

  // ===== Entrada =====

  /** Desenha o formulário em `container` e foca a legenda. */
  function show(container, vId, photo, handlers) {
    vehicleId = vId;
    photoId = photo.id;
    callbacks = handlers;
    selectedZones.clear();
    photo.zones.forEach(zoneId => selectedZones.add(zoneId));
    container.innerHTML = formHtml(photo);
    renderZones();
    updateDateButton();
    el('veh-pf-caption').focus();
  }

  return { show, save, cancel, toggleZone, onLinkChange, updateDateButton, useRecordDate };
})();
