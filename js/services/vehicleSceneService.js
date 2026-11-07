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

  // ===== Aparência =====

  const { VISUAL } = Constants.VEHICLE;
  const LOOK_KEYS = ['paint', 'wheels', 'tint', 'rideHeight'];
  const _byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0);
  const _byCreation = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

  /** Modificações com efeito: as concluídas em ordem de data; com prévia, as abertas entram depois. */
  function _lookSources(vehicleId, preview) {
    const mods = VehicleService.listCards(vehicleId, { type: CARD_TYPE.MOD }).filter(card => card.visualEffect);
    const done = mods.filter(VehicleService.isDone).sort(_byDate);
    const open = preview ? mods.filter(card => !VehicleService.isDone(card)).sort(_byCreation) : [];
    return [...done, ...open];
  }

  /** Por efeito vale o último que o define; a altura é absoluta (não soma). */
  function _applyEffect(look, effect) {
    const defined = LOOK_KEYS.filter(key => effect[key] !== undefined);
    defined.forEach(key => { look[key] = effect[key]; });
    return defined.length > 0;
  }

  /**
   * Aparência do carro: ficha (cor da pintura) + efeitos das modificações concluídas
   * + (com preview) das abertas + o override da simulação, que vem por último.
   * `applied` diz quem mexeu no visual; `simulated`, se o override mexeu.
   */
  function getLook(vehicleId, { preview = false, override } = {}) {
    const vehicle = VehicleService.getById(vehicleId);
    const look = { paint: vehicle?.paintHex || VISUAL.DEFAULT_PAINT, wheels: VISUAL.DEFAULT_WHEELS, tint: 0, rideHeight: 0, applied: [], simulated: false };
    if (!vehicle) return look;
    _lookSources(vehicleId, preview).forEach(card => {
      _applyEffect(look, card.visualEffect);
      look.applied.push({ id: card.id, title: card.title, planned: !VehicleService.isDone(card) });
    });
    look.simulated = override ? _applyEffect(look, override) : false;
    return look;
  }

  return { getZoneStates, getLook };
})();
