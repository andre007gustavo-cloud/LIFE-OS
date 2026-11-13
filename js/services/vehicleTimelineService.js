/**
 * ===================== VEHICLE TIMELINE SERVICE =====================
 * Máquina do tempo do veículo: o intervalo de datas conhecido, o retrato do
 * carro num dia (km, gasto acumulado, registros e fotos até ali) e as datas em
 * que algo aconteceu. Tudo calculado; só consulta (nunca grava) e fica fora
 * do conector MCP: nenhuma ferramenta usa.
 *
 * Camada de serviço: ZERO DOM.
 */

const VehicleTimelineService = (() => {

  const MONTH_LENGTH = 'YYYY-MM'.length;

  const _sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
  const _upTo = (items, date) => items.filter(item => item.date <= date);

  /** Tudo o que o veículo tem com data: histórico, abastecimentos, leituras de km e fotos. */
  function _records(vehicle) {
    const photos = VehicleService.listPhotos(vehicle.id);
    return {
      history: VehicleService.listMaintenances(vehicle.id),
      readings: vehicle.odometer,
      fuelings: VehicleFuelService.listFuelings(vehicle.id),
      photos: photos.erro ? [] : photos
    };
  }

  function _allDates(vehicle, { history, readings, photos, fuelings }) {
    const removals = history.map(m => m.removedOn);
    return [vehicle.purchaseDate, ...removals, ...[...history, ...readings, ...photos, ...fuelings].map(item => item.date)].filter(Boolean);
  }

  /** Do primeiro dia conhecido (em geral a compra) até hoje; null quando não há passado para visitar. */
  function getRange(vehicleId) {
    const vehicle = VehicleService.getById(vehicleId);
    if (!vehicle) return null;
    const end = Utils.today();
    const start = _allDates(vehicle, _records(vehicle)).sort()[0];
    if (!start || start >= end) return null;
    return { start, end, days: Utils.diffDays(start, end) };
  }

  /** Datas (sem repetição, em ordem) em que algo aconteceu dentro do intervalo: as paradas do "anterior/próximo". */
  function getEventDates(vehicleId) {
    const range = getRange(vehicleId);
    if (!range) return [];
    const vehicle = VehicleService.getById(vehicleId);
    const dates = _allDates(vehicle, _records(vehicle)).filter(date => date >= range.start && date <= range.end);
    return [...new Set(dates)].sort();
  }

  /** Maior km conhecido até o dia (leituras, manutenções, abastecimentos e a compra); null se nenhum. */
  function _kmAt(vehicleId, date) {
    const kms = _upTo(VehicleService.listKmPoints(vehicleId), date).map(point => point.km);
    return kms.length ? Math.max(...kms) : null;
  }

  /** Retrato do veículo no dia: km, gasto acumulado (manutenções + combustível), quantas manutenções e fotos existiam até ali. */
  function getSnapshot(vehicleId, date) {
    const vehicle = VehicleService.getById(vehicleId);
    if (!vehicle) return { erro: 'Veículo não encontrado' };
    const records = _records(vehicle);
    const history = _upTo(records.history, date);
    return {
      date,
      km: _kmAt(vehicleId, date),
      totalCentavos: _sum(history, VehicleService.maintenanceTotal) + _sum(_upTo(records.fuelings, date), f => f.totalCentavos),
      maintenanceCount: history.length,
      photoCount: _upTo(records.photos, date).length
    };
  }

  /** Fotos tiradas até o dia, da mais recente para a mais antiga. */
  function photosUntil(vehicleId, date) {
    const photos = VehicleService.listPhotos(vehicleId);
    return photos.erro ? [] : _upTo(photos, date);
  }

  /** Mês (YYYY-MM) da foto mais recente até o dia: para onde a galeria pula; null sem fotos no período. */
  function photoMonthAt(vehicleId, date) {
    const newest = photosUntil(vehicleId, date)[0];
    return newest ? newest.date.slice(0, MONTH_LENGTH) : null;
  }

  return { getRange, getEventDates, getSnapshot, photosUntil, photoMonthAt };
})();
