/**
 * ===================== VEHICLE ZONE PANEL =====================
 * Painel que a Garagem mostra abaixo do carro quando uma zona é escolhida
 * (toque no 3D ou num chip): sintomas e cards abertos, as últimas manutenções
 * e os atalhos para registrar algo naquela zona. Funciona com e sem o 3D.
 * Só devolve HTML; os cliques abrem os modais que já existem.
 */

const VehicleZonePanel = (() => {

  const { CARD_STATUSES, CARD_TYPE, ZONES, SCENE, PHOTO } = Constants.VEHICLE;
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  function itemHtml({ onclick, title, meta, alert }) {
    const alertClass = alert ? ' veh-zone-item-alert' : '';
    return `<button type="button" class="veh-zone-item${alertClass}" onclick="${onclick}">
      <span class="veh-zone-item-title">${alert ? '<i class="ti ti-alert-triangle" aria-hidden="true"></i> ' : ''}${esc(title)}</span>
      <span class="veh-zone-item-meta">${esc(meta)}</span>
    </button>`;
  }

  const sectionHtml = (heading, body) => (body ? `<div class="veh-zone-section"><div class="veh-zone-heading">${heading}</div>${body}</div>` : '');

  function openCardItem(vehicleId, card) {
    const isSymptom = VehicleService.typeOf(card) === CARD_TYPE.SYMPTOM;
    const status = VehicleLabels.labelOf(CARD_STATUSES, VehicleService.statusOf(card));
    return itemHtml({
      onclick: `VehicleCardModal.open('${attr(vehicleId)}','${attr(card.id)}')`,
      title: card.title,
      meta: isSymptom ? 'Sintoma aberto' : status,
      alert: isSymptom
    });
  }

  function historyItem(vehicleId, maintenance) {
    return itemHtml({
      onclick: `VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(maintenance.id)}')`,
      title: maintenance.title,
      meta: Utils.fmtDate(maintenance.date)
    });
  }

  function openCardsHtml(vehicleId, cards) {
    const isSymptom = card => VehicleService.typeOf(card) === CARD_TYPE.SYMPTOM;
    const ordered = [...cards.filter(isSymptom), ...cards.filter(card => !isSymptom(card))];
    return sectionHtml('Em aberto', ordered.map(card => openCardItem(vehicleId, card)).join(''));
  }

  function historyHtml(vehicleId, history) {
    const recent = history.slice(0, SCENE.PANEL_RECENT);
    const more = history.length - recent.length;
    const rest = more > 0 ? `<div class="veh-zone-more">+${more} no histórico</div>` : '';
    return sectionHtml('Últimas manutenções', recent.map(m => historyItem(vehicleId, m)).join('') + rest);
  }

  /** Itens do plano preventivo desta zona, do mais urgente ao que está em dia. */
  function planHtml(vehicleId, zoneId) {
    const health = VehicleHealthService.getHealth(vehicleId);
    if (health.erro) return '';
    const rows = health.items.filter(entry => entry.item.zones.includes(zoneId)).map(entry => itemHtml({
      onclick: `VehiclePlanModal.open('${attr(vehicleId)}','${attr(entry.item.id)}')`,
      title: entry.item.title,
      meta: Constants.VEHICLE.HEALTH.STATUS_LABELS[entry.status],
      alert: entry.status === Constants.VEHICLE.HEALTH.STATUS.OVERDUE
    }));
    return sectionHtml('Revisões do plano', rows.join(''));
  }

  /**
   * Fotos da zona (conteúdo da região que photosChanged troca) e, quando a zona não tem nada
   * (nem registros nem fotos), o aviso de vazio.
   */
  function photosHtml(vehicleId, zoneId) {
    const photos = VehicleService.listPhotos(vehicleId, { zone: zoneId });
    const context = VehicleBoardService.getZoneContext(vehicleId, zoneId);
    if (photos.erro || context.erro) return '';
    if (!photos.length) return context.openCards.length || context.history.length ? '' : EMPTY_HTML;
    const row = VehiclePhotoImages.rowHtml(vehicleId, photos, { limit: PHOTO.ZONE_PANEL, scope: PHOTO.SCOPE.ZONE, scopeId: zoneId });
    return sectionHtml('Fotos', row);
  }

  const EMPTY_HTML = '<div class="text-muted">Nada registrado nesta zona ainda.</div>';

  function photosRegionHtml(vehicleId, zoneId) {
    return `<div class="veh-zone-photos" data-veh-photo-region="zone" data-vehicle-id="${attr(vehicleId)}" data-zone-id="${attr(zoneId)}">${photosHtml(vehicleId, zoneId)}</div>`;
  }

  function actionsHtml(vehicleId, zoneId) {
    const args = `'${attr(vehicleId)}','${attr(zoneId)}'`;
    return `<div class="veh-zone-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleCardModal.openNewSymptom(${args})"><i class="ti ti-alert-triangle"></i> Descrever sintoma aqui</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleCardModal.openNewInZone(${args})"><i class="ti ti-plus"></i> Novo card aqui</button>
    </div>`;
  }

  /** HTML do painel da zona; vazio se o veículo ou a zona não existem. */
  function html(vehicleId, zoneId) {
    const zone = ZONES.find(z => z.id === zoneId);
    const context = zone && VehicleBoardService.getZoneContext(vehicleId, zoneId);
    if (!context || context.erro) return '';
    return `<section class="veh-zone-panel" aria-label="Zona ${attr(zone.label)}">
      <div class="veh-zone-head">
        <h3 class="veh-zone-name">${esc(zone.label)}</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleView.clearZone('${attr(vehicleId)}')" aria-label="Fechar painel da zona">
          <i class="ti ti-x"></i>
        </button>
      </div>
      ${openCardsHtml(vehicleId, context.openCards)}
      ${planHtml(vehicleId, zoneId)}
      ${historyHtml(vehicleId, context.history)}
      ${photosRegionHtml(vehicleId, zoneId)}
      ${actionsHtml(vehicleId, zoneId)}
    </section>`;
  }

  return { html, photosHtml };
})();
