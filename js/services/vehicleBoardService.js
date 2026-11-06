/**
 * ===================== VEHICLE BOARD SERVICE =====================
 * Quadro do veículo (Sintomas, Ideias, A fazer, Fazendo, Feito) e contexto de
 * diagnóstico por zona. Só consulta e orquestra: toda escrita passa pelo
 * VehicleService, que guarda as regras de status, km e vínculo.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Erros de negócio voltam como { erro }.
 */

const VehicleBoardService = (() => {

  const { CARD_STATUS, CARD_TYPE, CARD_STATUSES, BOARD_DONE_LIMIT, ZONES } = Constants.VEHICLE;
  const BOARD_COLUMNS = CARD_STATUSES.filter(s => s.id !== CARD_STATUS.DONE).map(s => s.id);

  const _isSymptom = card => VehicleService.typeOf(card) === CARD_TYPE.SYMPTOM;
  const _isOpen = card => !VehicleService.isDone(card);
  const _sumEstimates = cards => cards.reduce((total, card) => total + (card.estimateCentavos || 0), 0);

  /** Roda fn só se o veículo existe; senão devolve { erro } sem tocar em nada. */
  function _withVehicle(vehicleId, fn) {
    return VehicleService.getById(vehicleId) ? fn() : { erro: 'Veículo não encontrado' };
  }

  // ===== Consultas =====

  function listOpenCards(vehicleId, { zone, type } = {}) {
    return _withVehicle(vehicleId, () => VehicleService.listCards(vehicleId, { zone, type }).filter(_isOpen));
  }

  /** Sintomas resolvidos, com a manutenção que os resolveu (null se ela não existe mais). */
  function listResolvedSymptoms(vehicleId, { zone, maintenanceId } = {}) {
    return _withVehicle(vehicleId, () => VehicleService
      .listCards(vehicleId, { zone, type: CARD_TYPE.SYMPTOM, status: CARD_STATUS.DONE })
      .filter(symptom => !maintenanceId || symptom.resolvedById === maintenanceId)
      .map(symptom => ({ ...symptom, resolvedBy: _resolverOf(vehicleId, symptom) })));
  }

  function _resolverOf(vehicleId, symptom) {
    const resolver = VehicleService.getMaintenance(vehicleId, symptom.resolvedById);
    return resolver.erro ? null : { id: resolver.id, title: resolver.title, date: resolver.date, km: resolver.km ?? null };
  }

  function _column(status, openCards) {
    const cards = openCards.filter(card => VehicleService.statusOf(card) === status);
    return { status, cards, estimateCentavos: _sumEstimates(cards) };
  }

  function _plannedCentavos(columns) {
    const planned = [CARD_STATUS.TODO, CARD_STATUS.DOING];
    return _sumEstimates(columns.filter(c => planned.includes(c.status)).flatMap(c => c.cards));
  }

  /** Sintomas ficam fora das colunas; Feito mostra só as últimas do histórico (inclui registros antigos sem status). */
  function getBoard(vehicleId) {
    return _withVehicle(vehicleId, () => {
      const open = VehicleService.listCards(vehicleId).filter(_isOpen);
      const columns = BOARD_COLUMNS.map(status => _column(status, open.filter(card => !_isSymptom(card))));
      return {
        symptoms: open.filter(_isSymptom),
        columns,
        recentDone: VehicleService.listMaintenances(vehicleId).slice(0, BOARD_DONE_LIMIT),
        plannedCentavos: _plannedCentavos(columns)
      };
    });
  }

  // ===== Sintomas =====

  function _requireOpenSymptom(vehicleId, symptomId) {
    const symptom = VehicleService.getMaintenance(vehicleId, symptomId);
    if (symptom.erro) return symptom;
    if (!_isSymptom(symptom)) return { erro: 'Esse card não é um sintoma' };
    return _isOpen(symptom) ? symptom : { erro: 'Esse sintoma já foi resolvido' };
  }

  /** Fecha o sintoma ligando-o à manutenção concluída que o resolveu; o VehicleService valida o alvo. */
  function resolveSymptom(vehicleId, symptomId, maintenanceId) {
    const symptom = _requireOpenSymptom(vehicleId, symptomId);
    if (symptom.erro) return symptom;
    const resolver = VehicleService.getMaintenance(vehicleId, maintenanceId);
    if (resolver.erro) return { erro: 'A manutenção que resolveu o sintoma não foi encontrada neste veículo' };
    return VehicleService.updateMaintenance(vehicleId, symptomId, {
      status: CARD_STATUS.DONE, resolvedById: maintenanceId, date: symptom.date || resolver.date || Utils.today()
    });
  }

  /** O próprio card deixa de ser sintoma e vira um serviço em A fazer. */
  function convertSymptom(vehicleId, symptomId) {
    const symptom = _requireOpenSymptom(vehicleId, symptomId);
    if (symptom.erro) return symptom;
    return VehicleService.updateMaintenance(vehicleId, symptomId, { type: CARD_TYPE.SERVICE, status: CARD_STATUS.TODO });
  }

  // ===== Diagnóstico =====

  /** Tudo o que se sabe sobre uma zona do carro: histórico, peças (garantia e idade), cards abertos e sintomas resolvidos. */
  function getZoneContext(vehicleId, zoneId) {
    return _withVehicle(vehicleId, () => {
      const zone = ZONES.find(z => z.id === zoneId);
      if (!zone) return { erro: `Zona inválida: ${zoneId}` };
      return {
        zone,
        currentKm: VehicleService.getCurrentKm(VehicleService.getById(vehicleId)),
        history: VehicleService.listMaintenances(vehicleId, { zone: zoneId }),
        parts: VehicleService.getPartsNotebook(vehicleId, { zone: zoneId }),
        openCards: listOpenCards(vehicleId, { zone: zoneId }),
        resolvedSymptoms: listResolvedSymptoms(vehicleId, { zone: zoneId })
      };
    });
  }

  return {
    getBoard,
    listOpenCards,
    listResolvedSymptoms,
    resolveSymptom,
    convertSymptom,
    getZoneContext
  };
})();
