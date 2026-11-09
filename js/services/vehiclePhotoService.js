/**
 * ===================== VEHICLE PHOTO SERVICE =====================
 * Consultas calculadas sobre as fotos do veículo: grupos por mês, par do
 * comparador antes/depois, sugestão a partir do registro e título do vínculo.
 * Só leitura (a escrita é do VehicleService) e fora do conector MCP: nenhuma ferramenta usa.
 *
 * Camada de serviço: ZERO DOM.
 */

const VehiclePhotoService = (() => {

  const { ROLE } = Constants.VEHICLE.PHOTO;
  const MONTH_LENGTH = 'YYYY-MM'.length;

  const _monthOf = photo => photo.date.slice(0, MONTH_LENGTH);

  /** Meses do mais recente ao mais antigo; dentro do mês, a ordem recebida. */
  function groupByMonth(photos) {
    const groups = new Map();
    photos.forEach(photo => {
      const month = _monthOf(photo);
      groups.set(month, [...(groups.get(month) || []), photo]);
    });
    return [...groups.entries()]
      .map(([month, items]) => ({ month, photos: items }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  const _oldestUploadFirst = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

  /** Primeira foto Antes e primeira Depois do registro (pela ordem de envio); null se faltar uma das duas. */
  function comparisonPair(vehicleId, maintenanceId) {
    const photos = VehicleService.listPhotos(vehicleId, { maintenanceId });
    if (photos.erro) return null;
    const ordered = [...photos].sort(_oldestUploadFirst);
    const before = ordered.find(p => p.role === ROLE.BEFORE);
    const after = ordered.find(p => p.role === ROLE.AFTER);
    return before && after ? { before, after } : null;
  }

  /** O que preencher numa foto nova ligada ao registro: data, km e zonas dele (campos vazios ou data futura ficam de fora). */
  function suggestionFor(vehicleId, maintenanceId) {
    const record = VehicleService.getMaintenance(vehicleId, maintenanceId);
    if (record.erro) return { zones: [] };
    return {
      ...(record.date && record.date <= Utils.today() && { date: record.date }),
      ...(Number.isInteger(record.km) && { km: record.km }),
      zones: [...record.zones]
    };
  }

  /** Registro ao qual a foto está ligada; null sem vínculo ou com vínculo pendurado. */
  function linkOf(vehicleId, photo) {
    if (!photo.maintenanceId) return null;
    const record = VehicleService.getMaintenance(vehicleId, photo.maintenanceId);
    if (record.erro) return null;
    return { id: record.id, title: record.title, done: VehicleService.isDone(record) };
  }

  return { groupByMonth, comparisonPair, suggestionFor, linkOf };
})();
