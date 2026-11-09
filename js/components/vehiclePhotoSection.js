/**
 * ===================== VEHICLE PHOTO SECTION =====================
 * Fotos dentro do registro (manutenção, card ou sintoma): comparador
 * antes/depois, fileira de fotos do registro, envios pendentes e os botões
 * Antes, Depois e Outras. O contêiner interno é marcado com
 * data-veh-photo-region para que VehicleView.photosChanged o redesenhe sozinho
 * com o modal aberto, sem apagar o que foi digitado nos campos.
 */

const VehiclePhotoSection = (() => {

  const REGION = 'record';
  const SCOPE_RECORD = 'record';
  const REGION_SELECTOR = '.veh-photo-region';
  const { ROLE, COMPARE_START } = Constants.VEHICLE.PHOTO;
  const attr = Utils.escapeAttr;

  // ===== Comparador =====

  const valueText = percent => `Mostrando ${percent}% do antes`;

  /** Miniatura por baixo (reserva) e foto cheia por cima; as duas entram pela hidratação da VehiclePhotoImages. */
  function layerHtml(photo, label, extraClass) {
    return `<span class="veh-compare-layer${extraClass}">
      <img data-thumb-id="${attr(photo.thumbImageId)}" alt="" aria-hidden="true" draggable="false">
      <img data-full-id="${attr(photo.fullImageId)}" alt="${attr(`${label}: ${VehiclePhotoImages.altOf(photo)}`)}" draggable="false">
    </span>`;
  }

  function compareHtml(pair) {
    return `<div class="veh-compare" style="--pos:${COMPARE_START}">
      ${layerHtml(pair.after, 'Depois', '')}
      ${layerHtml(pair.before, 'Antes', ' veh-compare-before')}
      <span class="veh-compare-label veh-compare-label-before" aria-hidden="true">Antes</span>
      <span class="veh-compare-label veh-compare-label-after" aria-hidden="true">Depois</span>
      <span class="veh-compare-handle" aria-hidden="true"></span>
      <input type="range" class="veh-compare-range" min="0" max="100" step="1" value="${COMPARE_START}"
        aria-label="Comparar antes e depois" aria-valuetext="${valueText(COMPARE_START)}"
        oninput="VehiclePhotoSection.slide(this)">
    </div>`;
  }

  /** Move a divisória do comparador (teclado, toque ou mouse) e atualiza o texto lido pelo leitor de tela. */
  function slide(input) {
    input.closest('.veh-compare').style.setProperty('--pos', input.value);
    input.setAttribute('aria-valuetext', valueText(input.value));
  }

  // ===== Fotos e botões =====

  function addButtonHtml(vehicleId, recordId, key, label, role) {
    const roleArg = role ? `, role: '${role}'` : '';
    return `<button type="button" class="btn btn-ghost btn-sm" data-focus-key="record-${key}"
      onclick="VehiclePhotoUpload.pick('${attr(vehicleId)}', { maintenanceId: '${attr(recordId)}'${roleArg} })">
      <i class="ti ti-photo-plus" aria-hidden="true"></i> ${label}
    </button>`;
  }

  function buttonsHtml(vehicleId, recordId) {
    return `<div class="veh-photo-actions">
      ${addButtonHtml(vehicleId, recordId, 'before', 'Antes', ROLE.BEFORE)}
      ${addButtonHtml(vehicleId, recordId, 'after', 'Depois', ROLE.AFTER)}
      ${addButtonHtml(vehicleId, recordId, 'other', 'Outras')}
    </div>`;
  }

  /** Conteúdo interno da região (o que photosChanged troca). */
  function html(vehicleId, recordId) {
    const photos = VehicleService.listPhotos(vehicleId, { maintenanceId: recordId });
    if (photos.erro) return '';
    const pair = VehiclePhotoService.comparisonPair(vehicleId, recordId);
    const pending = VehiclePhotoUpload.pendingHtml(vehicleId, { maintenanceId: recordId });
    const row = photos.length ? VehiclePhotoImages.rowHtml(vehicleId, photos, { scope: SCOPE_RECORD, scopeId: recordId }) : '';
    return (pair ? compareHtml(pair) : '') + row
      + (pending ? `<div class="veh-photo-grid veh-photo-pending-grid">${pending}</div>` : '')
      + buttonsHtml(vehicleId, recordId);
  }

  // ===== Região =====

  const regionOf = sectionId => document.getElementById(sectionId).querySelector(REGION_SELECTOR);

  /** Desenha as fotos do registro dentro da seção `sectionId` (index.html) e a deixa à mostra. */
  function render(sectionId, vehicleId, recordId) {
    const region = regionOf(sectionId);
    Object.assign(region.dataset, { vehPhotoRegion: REGION, vehicleId, recordId });
    region.innerHTML = html(vehicleId, recordId);
    VehiclePhotoImages.hydrate(region);
    document.getElementById(sectionId).hidden = false;
  }

  /** Esconde a seção e solta a região (registro novo ainda não existe; nada a redesenhar). */
  function clear(sectionId) {
    const region = regionOf(sectionId);
    ['vehPhotoRegion', 'vehicleId', 'recordId'].forEach(key => delete region.dataset[key]);
    region.innerHTML = '';
    document.getElementById(sectionId).hidden = true;
  }

  return { render, clear, html, slide };
})();
