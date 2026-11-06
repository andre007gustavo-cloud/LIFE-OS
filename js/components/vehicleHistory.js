/**
 * ===================== VEHICLE HISTORY =====================
 * Aba Manutenções do veículo: filtros (texto, categoria, zona, ano), lista por
 * data com o estado financeiro de cada item e totais por categoria e por ano
 * que acompanham os filtros. Os filtros vivem em AppState.ui (nunca no DB).
 * Só lê dos services; tocar num item abre o VehicleMaintenanceModal.
 */

const VehicleHistory = (() => {

  const { CATEGORIES, ZONES, SEARCH_DEBOUNCE_MS, FULL_BAR_PERCENT, CARD_TYPE, CARD_TYPES } = Constants.VEHICLE;
  const FINANCE_STATES = {
    linked: { icon: 'link', label: 'Vinculado' },
    missing: { icon: 'link-off', label: 'Lançamento removido' },
    none: { icon: 'circle-dashed', label: 'Sem lançamento' }
  };
  const ROOT_ID = 'proj-tab-content';
  const RESULTS_ID = 'veh-hist-results';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const labelOf = (list, id) => (list.find(x => x.id === id) || {}).label || id;

  let debounceTimer = null;

  const filters = () => AppState.ui.vehicleFilters;
  const currentVehicle = () => VehicleService.getByProject(AppState.ui.activeProjectId);

  // ===== Dados =====

  function queryFor(vehicleId, { text, category, zone, year }) {
    return VehicleService.listMaintenances(vehicleId, {
      text, category, zone,
      from: year ? `${year}-01-01` : undefined,
      to: year ? `${year}-12-31` : undefined
    });
  }

  const yearsOf = vehicleId => [...new Set(VehicleService.listMaintenances(vehicleId).map(m => m.date.slice(0, 4)))]
    .sort().reverse();

  /** 'missing' vence 'linked': basta um lançamento apagado para pedir atenção. */
  function financeStateOf(vehicleId, maintenanceId) {
    const linked = VehicleFinanceService.getLinkedTransactions(vehicleId, maintenanceId);
    if (linked.erro || !linked.length) return 'none';
    return linked.some(t => t.missing) ? 'missing' : 'linked';
  }

  function totalsBy(maintenances, keyOf) {
    const totals = new Map();
    maintenances.forEach(m => {
      totals.set(keyOf(m), (totals.get(keyOf(m)) || 0) + VehicleService.maintenanceTotal(m));
    });
    return [...totals];
  }

  // ===== Filtros =====

  function optionsHtml(items, selected) {
    return items.map(([value, label]) =>
      `<option value="${attr(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }

  function selectHtml(field, label, allLabel, items) {
    const current = filters()[field];
    return `<select class="form-select veh-hist-select" aria-label="${label}"
      onchange="VehicleHistory.setFilter('${field}', this.value)">
      <option value="">${allLabel}</option>${optionsHtml(items, current)}</select>`;
  }

  function filtersHtml(vehicle) {
    const years = yearsOf(vehicle.id).map(y => [y, y]);
    return `<div class="veh-hist-filters">
      <input class="form-input veh-hist-search" type="search" aria-label="Buscar manutenção" placeholder="Buscar por título, peça, oficina…"
        value="${attr(filters().text)}" oninput="VehicleHistory.onText(this.value)">
      ${selectHtml('category', 'Categoria', 'Todas as categorias', CATEGORIES.map(c => [c.id, c.label]))}
      ${selectHtml('zone', 'Zona do carro', 'Todas as zonas', ZONES.map(z => [z.id, z.label]))}
      ${selectHtml('year', 'Ano', 'Todos os anos', years)}
    </div>`;
  }

  // ===== Lista =====

  function financeBadgeHtml(state) {
    const { icon, label } = FINANCE_STATES[state];
    return `<span class="veh-fin-state veh-fin-${state}"><i class="ti ti-${icon}" aria-hidden="true"></i> ${label}</span>`;
  }

  function itemMetaHtml(m) {
    const km = m.km == null ? '' : `<span>${m.km.toLocaleString('pt-BR')} km</span>`;
    const shop = m.shop ? `<span>${esc(m.shop)}</span>` : '';
    return `<span class="veh-hist-meta"><span>${Utils.fmtDateFull(m.date)}</span>
      <span>${esc(labelOf(CATEGORIES, m.category))}</span>${shop}${km}</span>`;
  }

  function zoneBadgesHtml(m) {
    return m.zones.map(z => `<span class="badge area">${esc(labelOf(ZONES, z))}</span>`).join('');
  }

  const modBadgeHtml = m => (VehicleService.typeOf(m) === CARD_TYPE.MOD
    ? `<span class="badge time">${esc(labelOf(CARD_TYPES, CARD_TYPE.MOD))}</span>` : '');

  function itemHtml(vehicleId, m) {
    const total = Utils.formatBRL(VehicleService.maintenanceTotal(m));
    return `<button type="button" class="veh-hist-item" onclick="VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(m.id)}')">
      <span class="veh-hist-main"><span class="veh-hist-title">${esc(m.title)}</span>${itemMetaHtml(m)}
        <span class="veh-hist-zones">${modBadgeHtml(m)}${zoneBadgesHtml(m)}</span></span>
      <span class="veh-hist-side"><strong>${total}</strong>${financeBadgeHtml(financeStateOf(vehicleId, m.id))}</span>
    </button>`;
  }

  // ===== Totais =====

  function barRowHtml(label, value, max) {
    const width = max ? Math.max(1, Math.round(value / max * FULL_BAR_PERCENT)) : 0;
    return `<div class="veh-bar-row"><div class="veh-bar-label"><span>${esc(label)}</span><span>${Utils.formatBRL(value)}</span></div>
      <div class="orc-bar" role="img" aria-label="${attr(label)}: ${Utils.formatBRL(value)}"><div class="orc-bar-fill veh-bar-fill" style="width:${width}%"></div></div></div>`;
  }

  function barsHtml(title, entries) {
    const max = Math.max(0, ...entries.map(([, value]) => value));
    return `<div class="veh-bars"><div class="card-title">${title}</div>
      ${entries.map(([label, value]) => barRowHtml(label, value, max)).join('')}</div>`;
  }

  function totalsHtml(maintenances) {
    const byCategory = totalsBy(maintenances, m => m.category)
      .sort((a, b) => b[1] - a[1]).map(([id, v]) => [labelOf(CATEGORIES, id), v]);
    const byYear = totalsBy(maintenances, m => m.date.slice(0, 4)).sort((a, b) => b[0].localeCompare(a[0]));
    return `<div class="card veh-totals">
      <p class="veh-totals-note">Os totais acompanham os filtros acima.</p>
      ${barsHtml('Total por categoria', byCategory)}${barsHtml('Total por ano', byYear)}
    </div>`;
  }

  // ===== Render =====

  function emptyHtml(vehicleId, hasAny) {
    if (!hasAny) {
      return `<div class="card veh-hist-empty"><div class="card-title">Nenhuma manutenção ainda</div>
        <button class="btn btn-primary btn-sm" onclick="VehicleMaintenanceModal.openNew('${attr(vehicleId)}')">
          <i class="ti ti-plus"></i> Nova manutenção</button></div>`;
    }
    return `<div class="card veh-hist-empty"><div class="card-title">Nada encontrado com esses filtros</div>
      <button class="btn btn-ghost btn-sm" onclick="VehicleHistory.clearFilters()">Limpar filtros</button></div>`;
  }

  function resultsHtml(vehicle) {
    const list = queryFor(vehicle.id, filters());
    if (!list.length) return emptyHtml(vehicle.id, VehicleService.listMaintenances(vehicle.id).length > 0);
    return `<div class="card">${list.map(m => itemHtml(vehicle.id, m)).join('')}</div>${totalsHtml(list)}`;
  }

  function headHtml(vehicle) {
    return `<div class="veh-hist-head"><div class="card-title">Manutenções</div>
      <button class="btn btn-primary btn-sm" onclick="VehicleMaintenanceModal.openNew('${attr(vehicle.id)}')">
        <i class="ti ti-plus"></i> Nova manutenção</button></div>`;
  }

  /** Descarta um filtro de ano que não existe mais (outro veículo, manutenção apagada). */
  function sanitizeYear(vehicle) {
    if (filters().year && !yearsOf(vehicle.id).includes(filters().year)) filters().year = '';
  }

  function render(vehicle) {
    sanitizeYear(vehicle);
    document.getElementById(ROOT_ID).innerHTML =
      `${headHtml(vehicle)}${filtersHtml(vehicle)}<div id="${RESULTS_ID}">${resultsHtml(vehicle)}</div>`;
  }

  function renderResults() {
    const vehicle = currentVehicle();
    const target = document.getElementById(RESULTS_ID);
    if (vehicle && target) target.innerHTML = resultsHtml(vehicle);
  }

  // ===== Ações =====

  function onText(text) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters().text = text;
      renderResults();
    }, SEARCH_DEBOUNCE_MS);
  }

  function setFilter(field, value) {
    filters()[field] = value;
    renderResults();
  }

  function clearFilters() {
    clearTimeout(debounceTimer);
    AppState.ui.vehicleFilters = { text: '', category: '', zone: '', year: '' };
    const vehicle = currentVehicle();
    if (vehicle) render(vehicle);
  }

  return { render, onText, setFilter, clearFilters };
})();
