/**
 * ===================== VEHICLE PHOTO VIEWER =====================
 * Visualizador de foto em tela cheia (markup estático em #veh-photo-viewer):
 * navega pela lista do escopo (galeria toda, uma zona ou um registro), mostra
 * a miniatura na hora e troca pela imagem cheia quando chega, edita pelo
 * VehiclePhotoForm e exclui com confirmação. Acessível: diálogo modal, Esc,
 * setas, foco preso e devolvido a quem abriu.
 */

const VehiclePhotoViewer = (() => {

  const VIEWER_ID = 'veh-photo-viewer';
  const OPEN_CLASS = 'veh-viewer-open';
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]';
  const esc = Utils.escapeHtml;
  const el = id => document.getElementById(id);
  const root = () => el(VIEWER_ID);

  const state = { vehicleId: null, photoId: null, scope: 'all', scopeId: '', opener: null, region: null, editing: false, shown: null };

  const isOpen = () => state.photoId !== null;

  // ===== Lista =====

  function scopeFilter() {
    if (state.scope === 'zone') return { zone: state.scopeId };
    if (state.scope === 'record') return { maintenanceId: state.scopeId };
    return {};
  }

  function currentList() {
    const list = VehicleService.listPhotos(state.vehicleId, scopeFilter());
    return list.erro ? [] : list;
  }

  /** Lista de agora e posição da foto aberta (-1 se ela sumiu). */
  function locate() {
    const list = currentList();
    return { list, index: list.findIndex(p => p.id === state.photoId) };
  }

  // ===== Avisos para fora =====

  const notifyChanged = () => {
    if (typeof VehicleView !== 'undefined') VehicleView.photosChanged(state.vehicleId);
  };

  const toast = (text, type) => {
    if (typeof Feedback !== 'undefined') Feedback.toast(text, type);
  };

  // ===== Imagem =====

  function setImage(token, dataUrl, isFull) {
    if (state.shown !== token || (!isFull && token.full)) return;
    token.full = token.full || isFull;
    el('veh-viewer-img').src = dataUrl;
  }

  function setNotice(text) {
    const notice = el('veh-viewer-notice');
    notice.textContent = text;
    notice.hidden = !text;
  }

  function showImages(photo) {
    const token = { full: false };
    state.shown = token;
    const img = el('veh-viewer-img');
    img.removeAttribute('src');
    img.alt = VehiclePhotoImages.altOf(photo);
    setNotice('');
    VehiclePhotoImages.loadThumb(photo.thumbImageId).then(url => setImage(token, url, false)).catch(() => {});
    VehiclePhotoImages.loadFull(photo.fullImageId).then(url => setImage(token, url, true)).catch(() => {
      if (state.shown === token) setNotice(token.full ? '' : 'Não foi possível carregar a foto em tamanho cheio');
    });
  }

  // ===== Informações =====

  function zoneChipsHtml(zoneIds) {
    const labels = zoneIds.map(id => Constants.VEHICLE.ZONES.find(z => z.id === id)?.label).filter(Boolean);
    return labels.map(label => `<span class="veh-viewer-chip">${esc(label)}</span>`).join('');
  }

  function linkTextOf(photo) {
    const link = VehiclePhotoService.linkOf(state.vehicleId, photo);
    return link ? `${link.done ? 'Feito' : 'Quadro'} · ${link.title}` : '';
  }

  function metaParts(photo) {
    const role = Constants.VEHICLE.PHOTO.ROLES.find(r => r.id === photo.role);
    return [
      Utils.fmtDateFull(photo.date),
      Number.isInteger(photo.km) ? `${photo.km.toLocaleString('pt-BR')} km` : '',
      role ? role.label : ''
    ].filter(Boolean);
  }

  function infoHtml(photo) {
    const link = linkTextOf(photo);
    return `<p class="veh-viewer-caption">${photo.caption ? esc(photo.caption) : '<span class="veh-viewer-muted">Sem legenda</span>'}</p>
      <p class="veh-viewer-meta">${metaParts(photo).map(esc).join(' · ')}</p>
      ${photo.zones.length ? `<div class="veh-viewer-chips">${zoneChipsHtml(photo.zones)}</div>` : ''}
      ${link ? `<p class="veh-viewer-link"><i class="ti ti-link" aria-hidden="true"></i> ${esc(link)}</p>` : ''}`;
  }

  // ===== Tela =====

  function updateControls(index, total) {
    el('veh-viewer-counter').textContent = `${index + 1} de ${total}`;
    el('veh-viewer-prev').disabled = state.editing || index <= 0;
    el('veh-viewer-next').disabled = state.editing || index >= total - 1;
    el('veh-viewer-edit').disabled = state.editing;
    el('veh-viewer-remove').disabled = state.editing;
  }

  function renderInfo(photo) {
    el('veh-viewer-info').innerHTML = infoHtml(photo);
  }

  function render() {
    const { list, index } = locate();
    if (index < 0) return close();
    updateControls(index, list.length);
    if (!state.editing) renderInfo(list[index]);
  }

  function showPhoto(photo) {
    state.photoId = photo.id;
    state.editing = false;
    showImages(photo);
    render();
  }

  // ===== Teclado e foco =====

  const inField = target => Boolean(target.closest && target.closest('input, select, textarea'));

  function trapTab(event) {
    const items = [...root().querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeydown(event) {
    if (event.key === 'Tab') return trapTab(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      return state.editing ? cancelEdit() : close();
    }
    if (inField(event.target)) return;
    if (event.key === 'ArrowLeft') prev();
    else if (event.key === 'ArrowRight') next();
  }

  /** Foco que escapou do diálogo (clique fora, leitor de tela) volta para ele. */
  function onFocusIn(event) {
    if (!root().contains(event.target)) el('veh-viewer-close').focus();
  }

  /** Sem o tile de origem (última foto excluída), um botão estável da região de onde o visualizador abriu. */
  function regionFallback(region) {
    if (!region || !region.isConnected) return null;
    return region.querySelector('[data-focus-key]') || region.querySelector('button');
  }

  function restoreFocus({ opener, photoId, region }) {
    if (opener && opener.isConnected) return opener.focus();
    const tile = [...document.querySelectorAll('.veh-photo-tile')].find(t => t.dataset.photoId === photoId);
    (tile || regionFallback(region))?.focus();
  }

  // ===== Abrir e fechar =====

  function open(vehicleId, photoId, scope = 'all', scopeId = '') {
    if (isOpen()) return;
    const photo = VehicleService.getPhoto(vehicleId, photoId);
    if (photo.erro) return;
    const opener = document.activeElement;
    Object.assign(state, {
      vehicleId, scope: scope || 'all', scopeId: scopeId || '', opener,
      region: opener && opener.closest ? opener.closest('[data-veh-photo-region]') : null
    });
    root().hidden = false;
    document.body.classList.add(OPEN_CLASS);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusIn);
    showPhoto(photo);
    el('veh-viewer-close').focus();
  }

  function close() {
    if (!isOpen()) return;
    const closing = { opener: state.opener, photoId: state.photoId, region: state.region };
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('focusin', onFocusIn);
    root().hidden = true;
    document.body.classList.remove(OPEN_CLASS);
    el('veh-viewer-img').removeAttribute('src');
    Object.assign(state, { photoId: null, editing: false, shown: null, opener: null, region: null });
    notifyChanged();
    restoreFocus(closing);
    state.vehicleId = null;
  }

  /** Para quem muda fotos por fora: reavalia a lista e fecha se a foto aberta sumiu. */
  function refresh() {
    if (isOpen()) render();
  }

  // ===== Navegação =====

  function step(offset) {
    if (!isOpen() || state.editing) return;
    const { list, index } = locate();
    if (index < 0) return close();
    const target = list[index + offset];
    if (target) showPhoto(target);
  }

  const prev = () => step(-1);
  const next = () => step(1);

  // ===== Edição =====

  function setEditing(editing) {
    state.editing = editing;
    render();
  }

  function finishEdit() {
    setEditing(false);
    el('veh-viewer-edit').focus();
  }

  function startEdit() {
    if (!isOpen() || state.editing) return;
    const photo = VehicleService.getPhoto(state.vehicleId, state.photoId);
    if (photo.erro) return close();
    setEditing(true);
    VehiclePhotoForm.show(el('veh-viewer-info'), state.vehicleId, photo, {
      onSaved: () => {
        finishEdit();
        el('veh-viewer-img').alt = VehiclePhotoImages.altOf(VehicleService.getPhoto(state.vehicleId, state.photoId));
        toast('Foto atualizada', 'success');
        notifyChanged();
      },
      onCancel: finishEdit
    });
  }

  function cancelEdit() {
    if (state.editing) finishEdit();
  }

  // ===== Excluir =====

  function afterRemoval(index) {
    const list = currentList();
    if (!list.length) return close();
    showPhoto(list[Math.min(index, list.length - 1)]);
    notifyChanged();
  }

  function remove() {
    if (!isOpen() || state.editing) return;
    const { index } = locate();
    const photo = VehicleService.getPhoto(state.vehicleId, state.photoId);
    if (photo.erro) return close();
    if (!confirm('Excluir esta foto? Não dá para desfazer.')) return;
    const result = VehicleService.removePhoto(state.vehicleId, photo.id);
    if (result.erro) return toast(result.erro, 'error');
    VehiclePhotoImages.forget([photo.thumbImageId, photo.fullImageId]);
    toast('Foto excluída', 'success');
    afterRemoval(Math.max(index, 0));
  }

  return { open, close, prev, next, startEdit, remove, refresh };
})();
