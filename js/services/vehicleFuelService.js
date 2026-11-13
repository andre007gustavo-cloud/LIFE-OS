/**
 * ===================== VEHICLE FUEL SERVICE =====================
 * Abastecimentos do veículo (vehicle.fuelings): registro, edição e exclusão, e
 * os números calculados a partir deles (consumo de tanque cheio a tanque cheio,
 * preço médio por litro, custo de combustível por km, gasto no mês e no ano).
 * O volume é guardado em mL inteiros e o valor em centavos inteiros.
 * O km de cada abastecimento entra na regra de km do veículo e no km atual.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Erros de negócio voltam como { erro }.
 * Leitura nunca grava.
 */

const VehicleFuelService = (() => {

  const { FUEL, NOTES_MAX, CENTAVOS_MAX } = Constants.VEHICLE;
  const { fail, guard, isBlank, compact, text, requiredDate, int, km, oneOf, requireVehicle, touch, assertRecordKm } = VehicleService.rules;
  const MONTH_LENGTH = 'YYYY-MM'.length;
  const YEAR_LENGTH = 'YYYY'.length;

  /** Leitura nunca grava: o primeiro abastecimento é que cria a chave `fuelings`. */
  const _fuelings = vehicle => vehicle.fuelings || [];
  const _sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
  const _hasKm = fueling => Number.isInteger(fueling.km);

  // ===== Normalização =====

  function _fuelingDate(value) {
    const date = requiredDate(value, 'Data do abastecimento');
    if (date > Utils.today()) fail('A data do abastecimento não pode ser no futuro');
    return date;
  }

  function _required(value, label) {
    return value ?? fail(`${label} é obrigatório`);
  }

  function _normalize(raw) {
    return compact({
      id: raw.id || Utils.uid(),
      date: _fuelingDate(raw.date),
      km: km(raw.km),
      volumeMl: _required(int(raw.volumeMl, 'Volume abastecido', 1, FUEL.VOLUME_ML_MAX), 'O volume abastecido'),
      totalCentavos: _required(int(raw.totalCentavos, 'Valor do abastecimento', 1, CENTAVOS_MAX), 'O valor do abastecimento'),
      fuel: isBlank(raw.fuel) ? FUEL.DEFAULT_TYPE : oneOf(raw.fuel, FUEL.TYPES, 'Combustível', 'inválido'),
      full: raw.full !== false,
      station: text(raw.station),
      notes: text(raw.notes, NOTES_MAX),
      transactionIds: [...(raw.transactionIds || [])]
    });
  }

  // ===== Escrita =====

  function _find(vehicle, fuelingId) {
    return _fuelings(vehicle).find(f => f.id === fuelingId) || fail('Abastecimento não encontrado');
  }

  function addFueling(vehicleId, dto = {}) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const now = Date.now();
      const fueling = { ..._normalize({ ...dto, id: undefined, transactionIds: [] }), createdAt: now, updatedAt: now };
      assertRecordKm(vehicle, fueling);
      vehicle.fuelings = [..._fuelings(vehicle), fueling];
      touch(vehicle);
      return fueling;
    });
  }

  /** A regra de km só é conferida de novo quando o km ou a data mudam. */
  function updateFueling(vehicleId, fuelingId, patch = {}) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const current = _find(vehicle, fuelingId);
      const next = _normalize({ ...current, ...patch, id: current.id });
      if (next.km !== current.km || next.date !== current.date) assertRecordKm(vehicle, next);
      const { createdAt } = current;
      Object.keys(current).forEach(key => delete current[key]);
      Object.assign(current, next, { createdAt, updatedAt: Date.now() });
      touch(vehicle);
      return current;
    });
  }

  /** Os lançamentos vinculados continuam nas Finanças; só o vínculo se perde. */
  function removeFueling(vehicleId, fuelingId) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const fueling = _find(vehicle, fuelingId);
      vehicle.fuelings = vehicle.fuelings.filter(f => f.id !== fuelingId);
      touch(vehicle);
      return fueling;
    });
  }

  // ===== Leitura =====

  const _newestFirst = (a, b) => b.date.localeCompare(a.date) || (b.km ?? -1) - (a.km ?? -1) || (b.createdAt || 0) - (a.createdAt || 0);

  /** Do mais recente ao mais antigo; veículo inexistente → lista vazia. */
  function listFuelings(vehicleId) {
    const vehicle = VehicleService.getById(vehicleId);
    return vehicle ? [..._fuelings(vehicle)].sort(_newestFirst) : [];
  }

  function getFueling(vehicleId, fuelingId) {
    return guard(() => _find(requireVehicle(vehicleId), fuelingId));
  }

  /** Preço por litro em centavos (arredondado): só para mostrar; o guardado é o total. */
  const pricePerLiterCentavos = fueling => Math.round(fueling.totalCentavos * FUEL.ML_PER_LITER / fueling.volumeMl);

  // ===== Consumo =====

  const _kmPerLiter = (distanceKm, volumeMl) => distanceKm / (volumeMl / FUEL.ML_PER_LITER);

  /** Trecho entre dois tanques cheios: km rodados e tudo o que foi abastecido depois do primeiro, até completar de novo. */
  function _segment(anchor, closing, filled) {
    const distanceKm = closing.km - anchor.km;
    if (distanceKm <= 0) return null;
    const volumeMl = _sum(filled, f => f.volumeMl);
    const fuels = [...new Set(filled.map(f => f.fuel))];
    return {
      fuelingId: closing.id, date: closing.date, distanceKm, volumeMl,
      totalCentavos: _sum(filled, f => f.totalCentavos),
      kmPerLiter: _kmPerLiter(distanceKm, volumeMl),
      fuel: fuels.length === 1 ? fuels[0] : null
    };
  }

  /**
   * Trechos de tanque cheio a tanque cheio, do mais antigo ao mais recente. Abastecimento parcial (ou sem km)
   * entra no volume do trecho; só um tanque cheio com km fecha o trecho e abre o seguinte.
   */
  function _segments(fuelings) {
    const segments = [];
    let anchor = null;
    let filled = [];
    [...fuelings].sort((a, b) => -_newestFirst(a, b)).forEach(fueling => {
      const closes = fueling.full && _hasKm(fueling);
      if (anchor) filled.push(fueling);
      if (!closes) return;
      const segment = anchor ? _segment(anchor, fueling, filled) : null;
      if (segment) segments.push(segment);
      anchor = fueling;
      filled = [];
    });
    return segments;
  }

  function _average(segments) {
    const distanceKm = _sum(segments, s => s.distanceKm);
    const volumeMl = _sum(segments, s => s.volumeMl);
    if (!distanceKm || !volumeMl) return { kmPerLiter: null, costPerKmCentavos: null };
    return {
      kmPerLiter: _kmPerLiter(distanceKm, volumeMl),
      costPerKmCentavos: Math.round(_sum(segments, s => s.totalCentavos) / distanceKm)
    };
  }

  /** Consumo médio de cada combustível, contando só os trechos em que o tanque recebeu um único tipo. */
  function _averageByFuel(segments) {
    return FUEL.TYPES
      .map(type => ({ fuel: type.id, ..._average(segments.filter(s => s.fuel === type.id)) }))
      .filter(entry => entry.kmPerLiter != null)
      .map(({ fuel, kmPerLiter }) => ({ fuel, kmPerLiter }));
  }

  const _spentSince = (fuelings, prefix) => _sum(fuelings.filter(f => f.date.startsWith(prefix)), f => f.totalCentavos);

  /**
   * Números do abastecimento: totais, consumo médio e do último trecho (km/L), custo de combustível por km,
   * preço médio por litro, gasto no mês e no ano, e os trechos (por id do abastecimento que fechou cada um).
   */
  function getStats(vehicleId) {
    const fuelings = listFuelings(vehicleId);
    const segments = _segments(fuelings);
    const volumeMl = _sum(fuelings, f => f.volumeMl);
    const totalCentavos = _sum(fuelings, f => f.totalCentavos);
    const today = Utils.today();
    return {
      count: fuelings.length,
      totalCentavos,
      volumeMl,
      ..._average(segments),
      lastKmPerLiter: segments.length ? segments[segments.length - 1].kmPerLiter : null,
      byFuel: _averageByFuel(segments),
      avgPricePerLiterCentavos: volumeMl ? Math.round(totalCentavos * FUEL.ML_PER_LITER / volumeMl) : null,
      monthCentavos: _spentSince(fuelings, today.slice(0, MONTH_LENGTH)),
      yearCentavos: _spentSince(fuelings, today.slice(0, YEAR_LENGTH)),
      segments
    };
  }

  /** Postos já usados, do mais recente ao mais antigo, sem repetição. */
  function listStations(vehicleId) {
    const names = listFuelings(vehicleId).map(f => f.station).filter(Boolean);
    const seen = new Set();
    return names.filter(name => {
      const key = Utils.normalizeText(name);
      return seen.has(key) ? false : seen.add(key);
    });
  }

  return {
    addFueling, updateFueling, removeFueling,
    listFuelings, getFueling, getStats, listStations, pricePerLiterCentavos
  };
})();
