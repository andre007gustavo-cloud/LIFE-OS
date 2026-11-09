/**
 * ===================== VEHICLE PHOTO IMAGES =====================
 * Miniaturas e fotos cheias do veículo: cache da sessão (miniaturas em Map,
 * cheias em LRU), buscas sem duplicar, tiles em HTML e carga sob demanda
 * (IntersectionObserver). Os bytes vêm do ImageService; nada aqui grava dados.
 */

const VehiclePhotoImages = (() => {

  const { FULL_CACHE_MAX, LAZY_ROOT_MARGIN, ROLES } = Constants.VEHICLE.PHOTO;
  const KIND = { THUMB: 'thumb', FULL: 'full' };
  const UNAVAILABLE_TEXT = 'Imagem indisponível';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  const thumbs = new Map();
  const fulls = new Map();
  const inFlight = new Map();
  let observer = null;

  // ===== Cache =====

  function cachedFull(imageId) {
    const dataUrl = fulls.get(imageId);
    if (dataUrl === undefined) return null;
    fulls.delete(imageId); // reinsere no fim: o mais recente
    fulls.set(imageId, dataUrl);
    return dataUrl;
  }

  const cached = (imageId, kind) =>
    kind === KIND.FULL ? cachedFull(imageId) : thumbs.get(imageId) || null;

  function remember(imageId, dataUrl, kind) {
    if (kind === KIND.THUMB) return void thumbs.set(imageId, dataUrl);
    fulls.delete(imageId);
    fulls.set(imageId, dataUrl);
    while (fulls.size > FULL_CACHE_MAX) fulls.delete(fulls.keys().next().value);
  }

  function forget(ids) {
    (ids || []).forEach(id => {
      thumbs.delete(id);
      fulls.delete(id);
    });
  }

  // ===== Busca =====

  async function fetchAndRemember(imageId, kind) {
    const dataUrl = await ImageService.fetchImage(imageId);
    if (!dataUrl) throw new Error('Imagem não encontrada');
    remember(imageId, dataUrl, kind);
    return dataUrl;
  }

  /** Devolve do cache ou busca uma vez só, mesmo com vários pedidos ao mesmo tempo. */
  function load(imageId, kind) {
    const hit = cached(imageId, kind);
    if (hit) return Promise.resolve(hit);
    if (!inFlight.has(imageId)) {
      const request = fetchAndRemember(imageId, kind).finally(() => inFlight.delete(imageId));
      inFlight.set(imageId, request);
    }
    return inFlight.get(imageId);
  }

  const loadThumb = imageId => load(imageId, KIND.THUMB);
  const loadFull = imageId => load(imageId, KIND.FULL);

  // ===== Texto =====

  const dateText = iso => iso.split('-').reverse().join('/');

  function altOf(photo) {
    return photo.caption || `Foto de ${dateText(photo.date)}`;
  }

  const roleLabel = role => ROLES.find(r => r.id === role)?.label || '';

  // ===== HTML =====

  function badgeHtml(photo) {
    const label = roleLabel(photo.role);
    return label ? `<span class="veh-photo-badge veh-photo-badge-${attr(photo.role)}">${esc(label)}</span>` : '';
  }

  function moreHtml(extra) {
    return extra ? `<span class="veh-photo-more" aria-hidden="true">+${extra}</span>` : '';
  }

  /** Quadrado clicável; a imagem só ganha `src` em `hydrate`. */
  function tileHtml(vehicleId, photo, { badge = false, more = 0, scope = '', scopeId = '' } = {}) {
    const label = more ? `Ver mais ${more} fotos` : altOf(photo);
    return `<button type="button" class="veh-photo-tile" aria-label="${attr(label)}"
        data-vid="${attr(vehicleId)}" data-photo-id="${attr(photo.id)}"
        data-scope="${attr(scope)}" data-scope-id="${attr(scopeId)}"
        onclick="VehiclePhotoImages.openViewer(this)">
      <img data-thumb-id="${attr(photo.thumbImageId)}" alt="${attr(altOf(photo))}" draggable="false">
      ${badge && !more ? badgeHtml(photo) : ''}${moreHtml(more)}
    </button>`;
  }

  /** Até `limit` tiles, mais um bloco "+N" (as N restantes) que abre a primeira delas. */
  function rowHtml(vehicleId, photos, { limit = photos.length, scope = '', scopeId = '' } = {}) {
    const opts = { badge: true, scope, scopeId };
    const tiles = photos.slice(0, limit).map(photo => tileHtml(vehicleId, photo, opts));
    const hidden = photos.length - limit;
    if (hidden > 0) tiles.push(tileHtml(vehicleId, photos[limit], { ...opts, more: hidden }));
    return `<div class="veh-photo-row">${tiles.join('')}</div>`;
  }

  function openViewer(button) {
    if (typeof VehiclePhotoViewer === 'undefined') return;
    const { vid, photoId, scope, scopeId } = button.dataset;
    VehiclePhotoViewer.open(vid, photoId, scope, scopeId);
  }

  // ===== Hidratação =====

  function markUnavailable(img) {
    const tile = img.closest('.veh-photo-tile') || img.parentElement;
    img.hidden = true;
    if (!tile || tile.querySelector('.veh-photo-failed-text')) return;
    tile.classList.add('veh-photo-unavailable');
    tile.insertAdjacentHTML('beforeend', `<span class="veh-photo-failed-text">${UNAVAILABLE_TEXT}</span>`);
  }

  function showImage(img) {
    const thumbId = img.dataset.thumbId;
    const imageId = thumbId || img.dataset.fullId;
    if (!imageId) return;
    const request = thumbId ? loadThumb(imageId) : loadFull(imageId);
    request.then(dataUrl => { if (img.isConnected) img.src = dataUrl; })
      .catch(() => { if (img.isConnected) markUnavailable(img); });
  }

  function getObserver() {
    if (!observer) {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        showImage(entry.target);
      }), { rootMargin: LAZY_ROOT_MARGIN });
    }
    return observer;
  }

  /** Cache primeiro (sem busca); o resto só quando chega perto da tela. */
  function hydrate(root) {
    const useObserver = typeof IntersectionObserver !== 'undefined';
    root.querySelectorAll('img[data-thumb-id], img[data-full-id]').forEach(img => {
      const hit = cached(img.dataset.thumbId || img.dataset.fullId, img.dataset.thumbId ? KIND.THUMB : KIND.FULL);
      if (hit) img.src = hit;
      else if (useObserver) getObserver().observe(img);
      else showImage(img);
    });
  }

  return { tileHtml, rowHtml, hydrate, loadThumb, loadFull, remember, forget, altOf, openViewer, KIND };
})();
