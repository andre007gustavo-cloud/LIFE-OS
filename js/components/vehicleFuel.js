/**
 * ===================== VEHICLE FUEL =====================
 * Aba Abastecimento do veículo: os números do consumo (média de tanque cheio
 * a tanque cheio, último tanque, preço médio, custo por km, gasto no mês e no
 * ano) e a lista de abastecimentos com o km/L de cada tanque e o estado
 * financeiro. Só lê dos services; tocar num item abre o VehicleFuelModal.
 */

const VehicleFuel = (() => {

  const { FUEL } = Constants.VEHICLE;
  const ROOT_ID = 'proj-tab-content';
  const FINANCE_STATES = {
    linked: { icon: 'link', label: 'Vinculado' },
    missing: { icon: 'link-off', label: 'Lançamento removido' },
    none: { icon: 'circle-dashed', label: 'Sem lançamento' }
  };
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const { labelOf } = VehicleLabels;

  // ===== Textos =====

  const decimal = (value, digits) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const litersText = volumeMl => `${decimal(volumeMl / FUEL.ML_PER_LITER, FUEL.LITER_DECIMALS)} L`;
  const kmPerLiterText = value => (value == null ? '—' : `${decimal(value, FUEL.KM_PER_LITER_DECIMALS)} km/L`);

  /** Preço por litro com 3 casas, como na bomba (o guardado é o total). */
  function pricePerLiterText(fueling) {
    const price = fueling.totalCentavos / 100 / (fueling.volumeMl / FUEL.ML_PER_LITER);
    return `R$ ${decimal(price, FUEL.PRICE_DECIMALS)}/L`;
  }

  // ===== Números =====

  function statHtml(label, value, hint) {
    return `<div class="proj-stat-card veh-stat">
      <div class="proj-stat-val veh-stat-val">${esc(value)}</div>
      <div class="proj-stat-label">${label}</div>
      ${hint ? `<div class="veh-stat-hint">${esc(hint)}</div>` : ''}
    </div>`;
  }

  function byFuelHint(stats) {
    return stats.byFuel.map(entry => `${labelOf(FUEL.TYPES, entry.fuel)}: ${kmPerLiterText(entry.kmPerLiter)}`).join(' · ');
  }

  function consumptionHint(stats) {
    if (stats.kmPerLiter == null) return 'Complete o tanque duas vezes, com o km, para medir';
    return byFuelHint(stats) || `${stats.segments.length} ${stats.segments.length === 1 ? 'tanque medido' : 'tanques medidos'}`;
  }

  function statsHtml(stats) {
    const avgPrice = stats.avgPricePerLiterCentavos == null ? '—' : `${Utils.formatBRL(stats.avgPricePerLiterCentavos)}/L`;
    const perKm = stats.costPerKmCentavos == null ? '—' : `${Utils.formatBRL(stats.costPerKmCentavos)}/km`;
    return `<div class="veh-stats">
      ${statHtml('Consumo médio', kmPerLiterText(stats.kmPerLiter), consumptionHint(stats))}
      ${statHtml('Último tanque', kmPerLiterText(stats.lastKmPerLiter))}
      ${statHtml('Combustível por km', perKm)}
      ${statHtml('Preço médio', avgPrice)}
      ${statHtml('Gasto no mês', Utils.formatBRL(stats.monthCentavos), `No ano: ${Utils.formatBRL(stats.yearCentavos)}`)}
    </div>`;
  }

  // ===== Lista =====

  /** 'missing' vence 'linked': basta um lançamento apagado para pedir atenção. */
  function financeStateOf(vehicleId, fuelingId) {
    const linked = VehicleFinanceService.getFuelingTransactions(vehicleId, fuelingId);
    if (linked.erro || !linked.length) return 'none';
    return linked.some(t => t.missing) ? 'missing' : 'linked';
  }

  function financeBadgeHtml(state) {
    const { icon, label } = FINANCE_STATES[state];
    return `<span class="veh-fin-state veh-fin-${state}"><i class="ti ti-${icon}" aria-hidden="true"></i> ${label}</span>`;
  }

  function segmentHtml(segment) {
    if (!segment) return '';
    return `<span class="veh-fuel-segment"><i class="ti ti-gauge" aria-hidden="true"></i> ${kmPerLiterText(segment.kmPerLiter)} em ${segment.distanceKm.toLocaleString('pt-BR')} km</span>`;
  }

  function metaHtml(fueling) {
    const km = fueling.km == null ? '' : `<span>${fueling.km.toLocaleString('pt-BR')} km</span>`;
    const station = fueling.station ? `<span>${esc(fueling.station)}</span>` : '';
    const partial = fueling.full ? '' : '<span>não completou</span>';
    return `<span class="veh-hist-meta"><span>${esc(labelOf(FUEL.TYPES, fueling.fuel))}</span><span>${litersText(fueling.volumeMl)}</span>
      <span>${pricePerLiterText(fueling)}</span>${km}${station}${partial}</span>`;
  }

  function itemHtml(vehicleId, fueling, segment) {
    return `<button type="button" class="veh-hist-item" onclick="VehicleFuelModal.open('${attr(vehicleId)}','${attr(fueling.id)}')">
      <span class="veh-hist-main"><span class="veh-hist-title">${Utils.fmtDateFull(fueling.date)}</span>${metaHtml(fueling)}${segmentHtml(segment)}</span>
      <span class="veh-hist-side"><strong>${Utils.formatBRL(fueling.totalCentavos)}</strong>${financeBadgeHtml(financeStateOf(vehicleId, fueling.id))}</span>
    </button>`;
  }

  function listHtml(vehicleId, fuelings, stats) {
    const segments = new Map(stats.segments.map(segment => [segment.fuelingId, segment]));
    return `<div class="card">${fuelings.map(fueling => itemHtml(vehicleId, fueling, segments.get(fueling.id))).join('')}</div>`;
  }

  // ===== Render =====

  function newButtonHtml(vehicleId) {
    return `<button type="button" class="btn btn-primary btn-sm" onclick="VehicleFuelModal.openNew('${attr(vehicleId)}')">
      <i class="ti ti-gas-station" aria-hidden="true"></i> Novo abastecimento</button>`;
  }

  function emptyHtml(vehicleId) {
    return `<div class="card veh-hist-empty"><div class="card-title">Nenhum abastecimento ainda</div>
      <p class="veh-health-pace">Registre cada abastecimento com o km: o app atualiza o odômetro, mede o consumo de tanque cheio a tanque cheio e soma o combustível ao custo por km.</p>
      ${newButtonHtml(vehicleId)}</div>`;
  }

  function render(vehicle) {
    const fuelings = VehicleFuelService.listFuelings(vehicle.id);
    const stats = VehicleFuelService.getStats(vehicle.id);
    const body = fuelings.length
      ? `<div class="veh-hist-head"><div class="card-title">Abastecimento</div>${newButtonHtml(vehicle.id)}</div>${statsHtml(stats)}${listHtml(vehicle.id, fuelings, stats)}`
      : emptyHtml(vehicle.id);
    document.getElementById(ROOT_ID).innerHTML = body;
  }

  return { render, kmPerLiterText };
})();
