/**
 * ===================== VEHICLE PARTS =====================
 * Aba Peças e oficinas do veículo: caderno de peças com busca, selo de
 * garantia e histórico de preço, mais a lista de oficinas. Só lê dos services.
 */

const VehicleParts = (() => {

  const { SEARCH_DEBOUNCE_MS } = Constants.VEHICLE;
  const ROOT_ID = 'proj-tab-content';
  const RESULTS_ID = 'veh-parts-results';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  let debounceTimer = null;

  const currentVehicle = () => VehicleService.getByProject(AppState.ui.activeProjectId);

  // ===== Caderno =====

  function warrantyBadgeHtml(warranty) {
    if (!warranty) return '';
    if (warranty.active) {
      return `<span class="badge baixa veh-warranty">Na garantia até ${Utils.fmtDateFull(warranty.until)}</span>`;
    }
    return '<span class="badge nenhuma veh-warranty">Garantia vencida</span>';
  }

  function partSubtitleHtml(item) {
    const { lastUse } = item;
    const pieces = [item.code && `Cód. ${esc(item.code)}`, lastUse.brand && esc(lastUse.brand), lastUse.store && esc(lastUse.store)];
    return pieces.filter(Boolean).join(' · ');
  }

  function lastChangeText(lastUse) {
    const km = lastUse.km == null ? '' : ` · ${lastUse.km.toLocaleString('pt-BR')} km`;
    return `Última troca: ${Utils.fmtDateFull(lastUse.date)}${km}`;
  }

  function priceHistoryHtml(item) {
    const rows = [...item.priceHistory].reverse().map(h => `<li>
      <span>${Utils.fmtDateFull(h.date)}</span><span>${h.store ? esc(h.store) : '—'}</span>
      <strong>${Utils.formatBRL(h.unitPriceCentavos)}</strong></li>`).join('');
    return `<ul class="veh-price-history" aria-label="Histórico de preço">${rows}</ul>`;
  }

  function partCardHtml(vehicleId, item) {
    const { lastUse } = item;
    return `<details class="veh-part-card">
      <summary>
        <span class="veh-part-head"><strong>${esc(item.name)}</strong>${warrantyBadgeHtml(item.warranty)}</span>
        <span class="veh-part-sub">${partSubtitleHtml(item)}</span>
        <span class="veh-part-sub">${lastChangeText(lastUse)} · ${Utils.formatBRL(lastUse.unitPriceCentavos)} cada · ${item.timesReplaced}x trocada</span>
      </summary>
      ${priceHistoryHtml(item)}
      <button type="button" class="btn btn-ghost btn-sm"
        onclick="VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(lastUse.maintenanceId)}')">Ver manutenção</button>
    </details>`;
  }

  function notebookHtml(vehicle) {
    const text = AppState.ui.vehiclePartsText;
    const items = VehicleService.getPartsNotebook(vehicle.id, { text });
    if (items.length) return items.map(item => partCardHtml(vehicle.id, item)).join('');
    const empty = text ? 'Nenhuma peça encontrada com essa busca.' : 'Nenhuma peça registrada ainda. Adicione peças numa manutenção.';
    return `<div class="text-muted">${empty}</div>`;
  }

  // ===== Oficinas =====

  function shopRowHtml(shop) {
    const visits = `${shop.visits} ${shop.visits === 1 ? 'visita' : 'visitas'}`;
    return `<li class="veh-shop-row"><strong>${esc(shop.name)}</strong>
      <span>${visits} · última em ${Utils.fmtDateFull(shop.lastVisit)}</span>
      <span>${Utils.formatBRL(shop.totalCentavos)}</span></li>`;
  }

  function shopsHtml(vehicle) {
    const shops = VehicleService.getShops(vehicle.id);
    const body = shops.length
      ? `<ul class="veh-shop-list">${shops.map(shopRowHtml).join('')}</ul>`
      : '<div class="text-muted">Nenhuma oficina registrada ainda. Informe a oficina numa manutenção.</div>';
    return `<div class="card"><div class="card-title">Oficinas</div>${body}</div>`;
  }

  // ===== Render e ações =====

  function render(vehicle) {
    document.getElementById(ROOT_ID).innerHTML = `<div class="card">
      <div class="card-title">Caderno de peças</div>
      <input class="form-input veh-hist-search" type="search" aria-label="Buscar peça" placeholder="Buscar por nome, código, marca ou loja…"
        value="${attr(AppState.ui.vehiclePartsText)}" oninput="VehicleParts.onText(this.value)">
      <div id="${RESULTS_ID}">${notebookHtml(vehicle)}</div>
    </div>${shopsHtml(vehicle)}`;
  }

  function onText(text) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      AppState.ui.vehiclePartsText = text;
      const vehicle = currentVehicle();
      const target = document.getElementById(RESULTS_ID);
      if (vehicle && target) target.innerHTML = notebookHtml(vehicle);
    }, SEARCH_DEBOUNCE_MS);
  }

  return { render, onText };
})();
