/**
 * ===================== VEHICLE PHOTO UPLOAD =====================
 * Envio de fotos do veículo: fila FIFO, uma foto por vez. Para cada foto lê a
 * data do EXIF (do arquivo original), comprime a cheia e a miniatura (o canvas
 * descarta o EXIF), sobe as duas e grava os metadados no VehicleService, com
 * desfazimento das imagens quando uma etapa falha. O estado de cada item vive
 * só em memória e aparece como tiles pendentes.
 */

const VehiclePhotoUpload = (() => {

  const PHOTO = Constants.VEHICLE.PHOTO;
  const INPUT_ID = 'veh-photo-input';
  const STATUS = { PREPARING: 'preparing', UPLOADING: 'uploading', WAITING: 'waiting', FAILED: 'failed' };
  const LABELS = {
    [STATUS.PREPARING]: 'Preparando…',
    [STATUS.UPLOADING]: 'Enviando…',
    [STATUS.WAITING]: 'Aguardando conexão…'
  };
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  const items = [];
  const queue = [];
  let context = null;
  let running = false;
  let batch = { done: 0, failed: 0 };

  /** Um redesenho que falha não pode travar a fila nem recontar um item já enviado. */
  function notify(vehicleId) {
    if (typeof VehicleView === 'undefined') return;
    try {
      VehicleView.photosChanged(vehicleId);
    } catch (err) {
      console.error('Falha ao atualizar as fotos na tela', err);
    }
  }

  const toast = (text, type) => {
    if (typeof Feedback !== 'undefined') Feedback.toast(text, type);
  };

  // ===== Estado dos itens =====

  function setStatus(item, status, reason) {
    item.status = status;
    item.reason = reason || '';
    notify(item.vehicleId);
  }

  function release(item) {
    URL.revokeObjectURL(item.previewUrl);
    items.splice(items.indexOf(item), 1);
  }

  function dismiss(localId) {
    const item = items.find(i => i.id === localId);
    if (!item || item.status !== STATUS.FAILED) return;
    release(item);
    notify(item.vehicleId);
  }

  function onConnectionChange() {
    const online = navigator.onLine;
    items.forEach(item => {
      if (online && item.status === STATUS.WAITING) setStatus(item, STATUS.UPLOADING);
      else if (!online && item.status === STATUS.UPLOADING) setStatus(item, STATUS.WAITING);
    });
  }

  window.addEventListener('online', onConnectionChange);
  window.addEventListener('offline', onConnectionChange);

  // ===== Preparo =====

  async function readExifDate(file) {
    try {
      return ExifDate.fromBuffer(await file.slice(0, PHOTO.EXIF_SCAN_BYTES).arrayBuffer());
    } catch (err) {
      return null;
    }
  }

  async function compressFull(file) {
    for (const step of PHOTO.FULL_STEPS) {
      const dataUrl = await Utils.compressImage(file, step);
      if (dataUrl.length <= PHOTO.MAX_DATAURL_CHARS) return dataUrl;
    }
    throw new Error('Foto grande demais');
  }

  const suggestionOf = item => item.maintenanceId
    ? VehiclePhotoService.suggestionFor(item.vehicleId, item.maintenanceId)
    : { zones: [] };

  async function prepare(item) {
    const suggestion = suggestionOf(item);
    const date = await readExifDate(item.file) || suggestion.date || Utils.today();
    const full = await compressFull(item.file);
    const thumb = await Utils.compressImage(item.file, PHOTO.THUMB);
    return { suggestion, date, full, thumb };
  }

  // ===== Envio =====

  async function uploadBoth(thumb, full) {
    const thumbId = await ImageService.uploadImage(thumb);
    try {
      return { thumbId, fullId: await ImageService.uploadImage(full) };
    } catch (err) {
      ImageService.removeById(thumbId);
      throw err;
    }
  }

  function photoDto(item, { suggestion, date }, ids) {
    return {
      thumbImageId: ids.thumbId,
      fullImageId: ids.fullId,
      date,
      zones: suggestion.zones,
      ...(Number.isInteger(suggestion.km) && { km: suggestion.km }),
      ...(item.maintenanceId && { maintenanceId: item.maintenanceId }),
      ...(item.role && { role: item.role })
    };
  }

  function saveMetadata(item, prepared, ids) {
    const result = VehicleService.addPhoto(item.vehicleId, photoDto(item, prepared, ids));
    if (result.erro) {
      ImageService.removeMany([ids.thumbId, ids.fullId]);
      throw new Error(result.erro);
    }
  }

  async function processItem(item) {
    const prepared = await prepare(item);
    setStatus(item, navigator.onLine ? STATUS.UPLOADING : STATUS.WAITING);
    const ids = await uploadBoth(prepared.thumb, prepared.full);
    saveMetadata(item, prepared, ids);
    const { KIND } = VehiclePhotoImages;
    VehiclePhotoImages.remember(ids.thumbId, prepared.thumb, KIND.THUMB);
    VehiclePhotoImages.remember(ids.fullId, prepared.full, KIND.FULL);
  }

  async function runItem(item) {
    try {
      await processItem(item);
      batch.done++;
      release(item);
      notify(item.vehicleId);
    } catch (err) {
      batch.failed++;
      setStatus(item, STATUS.FAILED, err.message || 'erro desconhecido');
    }
  }

  // ===== Fila =====

  function summaryText({ done, failed }) {
    if (!failed) return `${done} ${done === 1 ? 'foto enviada' : 'fotos enviadas'}`;
    const lost = `${failed} ${failed === 1 ? 'falhou' : 'falharam'}`;
    return done ? `${done} ${done === 1 ? 'enviada' : 'enviadas'}, ${lost}` : `${failed} ${failed === 1 ? 'foto falhou' : 'fotos falharam'}`;
  }

  function finishBatch() {
    if (batch.done + batch.failed === 0) return;
    toast(summaryText(batch), batch.failed ? 'error' : 'success');
    batch = { done: 0, failed: 0 };
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) await runItem(queue.shift());
    } finally {
      running = false;
      finishBatch();
    }
  }

  function newItem(vehicleId, file, { maintenanceId, role }) {
    return {
      id: Utils.uid(), vehicleId, maintenanceId, role, file,
      status: STATUS.PREPARING, reason: '', previewUrl: URL.createObjectURL(file)
    };
  }

  /** Entrada testável: enfileira até MAX_PER_UPLOAD arquivos e devolve quantos entraram. */
  function enqueue(vehicleId, files, opts = {}) {
    const list = [...files];
    const accepted = list.slice(0, PHOTO.MAX_PER_UPLOAD);
    if (!accepted.length) return 0;
    if (list.length > accepted.length) {
      toast(`Só ${PHOTO.MAX_PER_UPLOAD} fotos por vez; as outras ficaram de fora`, 'warn');
    }
    accepted.forEach(file => {
      const item = newItem(vehicleId, file, opts);
      items.push(item);
      queue.push(item);
    });
    notify(vehicleId);
    drain();
    return accepted.length;
  }

  // ===== Entradas da tela =====

  function pick(vehicleId, { maintenanceId, role } = {}) {
    context = { vehicleId, maintenanceId, role };
    document.getElementById(INPUT_ID).click();
  }

  function onFilesChosen(input) {
    const files = [...input.files];
    input.value = '';
    if (context) enqueue(context.vehicleId, files, context);
  }

  // ===== Tiles pendentes =====

  function pendingTileHtml(item) {
    const failed = item.status === STATUS.FAILED;
    const text = failed ? `Falhou: ${item.reason}` : LABELS[item.status];
    const dismissButton = failed
      ? `<button type="button" class="veh-photo-dismiss" onclick="VehiclePhotoUpload.dismiss('${attr(item.id)}')">Dispensar</button>`
      : '';
    return `<div class="veh-photo-tile veh-photo-pending${failed ? ' veh-photo-error' : ''}" role="status">
      <img src="${attr(item.previewUrl)}" alt="Prévia da foto em envio" draggable="false">
      <span class="veh-photo-pending-label">${esc(text)}</span>${dismissButton}
    </div>`;
  }

  /** Tiles dos itens em andamento ou com falha; com `maintenanceId`, só os daquele registro. */
  function pendingHtml(vehicleId, { maintenanceId } = {}) {
    const mine = items.filter(i => i.vehicleId === vehicleId
      && (maintenanceId === undefined || i.maintenanceId === maintenanceId));
    return mine.map(pendingTileHtml).join('');
  }

  return { pick, onFilesChosen, enqueue, pendingHtml, dismiss };
})();
