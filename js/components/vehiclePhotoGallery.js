/**
 * ===================== VEHICLE PHOTO GALLERY =====================
 * Aba Fotos do veículo: cabeçalho com a contagem e o botão de envio, envios
 * pendentes e as fotos agrupadas por mês (mais recente primeiro).
 * O conteúdo fica num contêiner marcado (data-veh-photo-region) para que
 * VehicleView.photosChanged o redesenhe sozinho, sem refazer a aba toda.
 */

const VehiclePhotoGallery = (() => {

  const REGION = 'gallery';
  const { SCOPE } = Constants.VEHICLE.PHOTO;
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  /** "2026-11" -> "Novembro de 2026". */
  function monthTitle(month) {
    const text = Utils.parseISO(`${month}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const countText = total => `${total} ${total === 1 ? 'foto' : 'fotos'}`;

  // O clique chama pick() direto: no iOS o input só abre se nada assíncrono vier antes.
  function addButtonHtml(vehicleId) {
    return `<button type="button" class="btn btn-primary btn-sm" data-focus-key="add" onclick="VehiclePhotoUpload.pick('${attr(vehicleId)}')">
      <i class="ti ti-photo-plus" aria-hidden="true"></i> Adicionar fotos
    </button>`;
  }

  function headerHtml(vehicleId, total) {
    return `<div class="veh-gallery-head">
      <h2 class="card-title veh-gallery-count">${countText(total)}</h2>
      ${addButtonHtml(vehicleId)}
    </div>`;
  }

  function monthSectionHtml(vehicleId, { month, photos }) {
    const titleId = `veh-gallery-${attr(month)}`;
    const tiles = photos.map(photo => VehiclePhotoImages.tileHtml(vehicleId, photo, { badge: true, scope: SCOPE.ALL })).join('');
    return `<section class="veh-gallery-month" aria-labelledby="${titleId}">
      <h3 class="veh-gallery-month-title" id="${titleId}" tabindex="-1">${esc(monthTitle(month))}</h3>
      <div class="veh-photo-grid">${tiles}</div>
    </section>`;
  }

  function emptyHtml(vehicleId) {
    return `<div class="proj-empty-state veh-gallery-empty">
      <i class="ti ti-photo" aria-hidden="true"></i>
      <p>Nenhuma foto ainda. Envie a primeira foto do seu veículo.</p>
      ${addButtonHtml(vehicleId)}
    </div>`;
  }

  /** Conteúdo interno da galeria (o que photosChanged troca). */
  function html(vehicleId) {
    const photos = VehicleService.listPhotos(vehicleId);
    if (photos.erro) return '';
    const pending = VehiclePhotoUpload.pendingHtml(vehicleId);
    const pendingGrid = pending ? `<div class="veh-photo-grid veh-gallery-pending">${pending}</div>` : '';
    const body = photos.length
      ? VehiclePhotoService.groupByMonth(photos).map(group => monthSectionHtml(vehicleId, group)).join('')
      : (pending ? '' : emptyHtml(vehicleId));
    return headerHtml(vehicleId, photos.length) + pendingGrid + body;
  }

  /** Desenha a aba: o contêiner marcado com o conteúdo dentro. */
  function render(vehicle) {
    document.getElementById('proj-tab-content').innerHTML =
      `<div class="veh-gallery" data-veh-photo-region="${REGION}" data-vehicle-id="${attr(vehicle.id)}">${html(vehicle.id)}</div>`;
  }

  /** Leva a tela (e o foco) até o mês pedido pela máquina do tempo; sem mês ou sem a seção, não faz nada. */
  function focusMonth(month) {
    const title = month ? document.getElementById(`veh-gallery-${month}`) : null;
    if (!title) return;
    title.scrollIntoView({ block: 'start' });
    title.focus({ preventScroll: true });
  }

  return { render, html, focusMonth, REGION };
})();
