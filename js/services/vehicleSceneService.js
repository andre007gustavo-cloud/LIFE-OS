/**
 * ===================== VEHICLE SCENE SERVICE =====================
 * Dados que o carro 3D da Garagem precisa: o estado de cada zona.
 * Só consulta (nunca grava) e fica fora do conector MCP: nenhuma ferramenta usa.
 *
 * Camada de serviço: ZERO DOM.
 */

const VehicleSceneService = (() => {

  const { ZONES, ZONE_STATE, CARD_TYPE, CARD_STATUS } = Constants.VEHICLE;
  const PLANNED_STATUSES = [CARD_STATUS.TODO, CARD_STATUS.DOING];

  const _allNeutral = () => Object.fromEntries(ZONES.map(zone => [zone.id, ZONE_STATE.NEUTRAL]));

  /** Sintoma aberto pesa mais que card planejado; Ideias e sintomas resolvidos não colorem nada. */
  function _stateOf(card) {
    if (VehicleService.typeOf(card) === CARD_TYPE.SYMPTOM) return ZONE_STATE.SYMPTOM;
    return PLANNED_STATUSES.includes(VehicleService.statusOf(card)) ? ZONE_STATE.PLANNED : ZONE_STATE.NEUTRAL;
  }

  const _weight = state => [ZONE_STATE.NEUTRAL, ZONE_STATE.PLANNED, ZONE_STATE.SYMPTOM].indexOf(state);

  /** { [zoneId]: 'symptom' | 'planned' | 'neutral' } para todas as zonas; veículo inexistente → tudo neutro. */
  function getZoneStates(vehicleId) {
    const states = _allNeutral();
    const cards = VehicleBoardService.listOpenCards(vehicleId);
    if (cards.erro) return states;
    cards.forEach(card => {
      const state = _stateOf(card);
      card.zones.filter(zone => zone in states).forEach(zone => {
        if (_weight(state) > _weight(states[zone])) states[zone] = state;
      });
    });
    return states;
  }

  return { getZoneStates };
})();
