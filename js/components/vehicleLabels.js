/**
 * ===================== VEHICLE LABELS =====================
 * Rótulo pt-BR de um id (categoria, zona, tipo, coluna) e os selos de zona,
 * usados pelo quadro e pelo histórico do veículo.
 */

const VehicleLabels = (() => {

  const labelOf = (list, id) => (list.find(x => x.id === id) || {}).label || id;

  const zoneBadgesHtml = zones => zones
    .map(z => `<span class="badge area">${Utils.escapeHtml(labelOf(Constants.VEHICLE.ZONES, z))}</span>`).join('');

  return { labelOf, zoneBadgesHtml };
})();
