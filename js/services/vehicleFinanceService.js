/**
 * ===================== VEHICLE FINANCE SERVICE =====================
 * Liga os gastos do veículo (manutenções e abastecimentos) a lançamentos de
 * Finanças. O vínculo vive só no registro do carro (transactionIds); as
 * transações não mudam de formato.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Erros de negócio voltam como { erro }.
 */

const VehicleFinanceService = (() => {

  const { WINDOW_DAYS, WIDE_WINDOW_DAYS, MAX_SUGGESTIONS } = Constants.VEHICLE.LINK;
  const { CARD_PREFIX } = Constants.VEHICLE;
  const TOTAL_AMOUNT_INDEX = 0;

  const _sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

  // ===== Valores-alvo =====

  /** Total, soma das peças, mão de obra e preço de cada peça (sem zero nem repetido). */
  function defaultMaintenanceAmounts(maintenance) {
    const amounts = [
      VehicleService.maintenanceTotal(maintenance),
      _sum(maintenance.parts, p => p.priceCentavos),
      maintenance.laborCentavos,
      ...maintenance.parts.map(p => p.priceCentavos)
    ];
    return [...new Set(amounts.filter(value => value > 0))];
  }

  // ===== Transações vinculadas =====

  /** transactionId -> id do registro (manutenção ou abastecimento, de qualquer veículo) a que está vinculada. */
  function _linkedIdsByRecord() {
    const linked = new Map();
    VehicleService.list().forEach(vehicle => [...vehicle.maintenances, ...(vehicle.fuelings || [])].forEach(record => {
      (record.transactionIds || []).forEach(id => linked.set(id, record.id));
    }));
    return linked;
  }

  function _sourceName(transaction) {
    if (transaction.cartaoId) {
      const card = typeof CartaoService !== 'undefined' ? CartaoService.getCartaoById(transaction.cartaoId) : null;
      return card ? card.nome : 'Cartão';
    }
    const account = FinanceService.getContaById(transaction.contaId);
    return account ? account.nome : '';
  }

  function _describeTransaction(transaction) {
    return {
      transactionId: transaction.id,
      data: transaction.data,
      valorCentavos: transaction.valorCentavos,
      descricao: transaction.descricao,
      contaOuCartao: _sourceName(transaction)
    };
  }

  // ===== Sugestões =====

  const _plural = days => `${days} ${days === 1 ? 'dia' : 'dias'}`;

  function _dayDistanceText(offset) {
    if (offset === 0) return 'no mesmo dia';
    return `${_plural(Math.abs(offset))} ${offset > 0 ? 'depois' : 'antes'}`;
  }

  function _reason(amountIndex, offset, transaction) {
    const match = amountIndex === TOTAL_AMOUNT_INDEX ? 'mesmo valor do total' : 'mesmo valor de uma parte do serviço';
    const origin = transaction.fonte === 'carteira' || transaction.aConferir ? ' · veio da Carteira' : '';
    return `${match}, ${_dayDistanceText(offset)}${origin}`;
  }

  function _isCandidate(transaction, linked, excludedRecordId) {
    const owner = linked.get(transaction.id);
    return transaction.tipo === 'saida' && !transaction.pagamentoFatura
      && (!owner || owner === excludedRecordId);
  }

  function _rankedSuggestion(transaction, date, amounts, windowDays) {
    const offset = Utils.diffDays(date, transaction.data);
    const amountIndex = amounts.indexOf(transaction.valorCentavos);
    if (amountIndex < 0 || Math.abs(offset) > windowDays) return null;
    return {
      amountIndex,
      distance: Math.abs(offset),
      suggestion: { ..._describeTransaction(transaction), reason: _reason(amountIndex, offset, transaction) }
    };
  }

  /**
   * Candidatos a vínculo a partir de valores puros (serve ao formulário ainda não salvo).
   * `excludeMaintenanceId` é o id do registro em edição (manutenção ou abastecimento): os vínculos dele não o bloqueiam.
   */
  function suggestLinks({ date, amountsCentavos = [], excludeMaintenanceId, wide = false } = {}) {
    if (!date || !amountsCentavos.length) return [];
    const windowDays = wide ? WIDE_WINDOW_DAYS : WINDOW_DAYS;
    const linked = _linkedIdsByRecord();
    return FinanceService.listTransactions()
      .filter(t => _isCandidate(t, linked, excludeMaintenanceId))
      .map(t => _rankedSuggestion(t, date, amountsCentavos, windowDays))
      .filter(Boolean)
      .sort((a, b) => a.amountIndex - b.amountIndex || a.distance - b.distance)
      .slice(0, MAX_SUGGESTIONS)
      .map(item => item.suggestion);
  }

  // ===== Alvos do vínculo: manutenção e abastecimento =====

  const _vehicleLabel = vehicle => vehicle.nickname || vehicle.model;

  /** Acha o veículo e o registro dele; `pick` devolve o registro ou null. */
  function _findRecord(vehicleId, pick, notFound) {
    const vehicle = VehicleService.getById(vehicleId);
    if (!vehicle) return { erro: 'Veículo não encontrado' };
    const record = pick(vehicle);
    return record ? { vehicle, record } : { erro: notFound };
  }

  const MAINTENANCE = {
    find: (vehicleId, id) => _findRecord(vehicleId, vehicle => vehicle.maintenances.find(m => m.id === id), 'Manutenção não encontrada'),
    notPayableError: record => (VehicleService.isHistory(record) ? null : 'Pagamento só em manutenção concluída (Feito)'),
    saveIds: (vehicleId, id, transactionIds) => VehicleService.updateMaintenance(vehicleId, id, { transactionIds }),
    takenError: 'Esse lançamento já está vinculado a outra manutenção',
    paidError: 'Esta manutenção já tem pagamento vinculado; para lançar outro, confirme que é um pagamento adicional',
    describe: (vehicle, record) => `${_vehicleLabel(vehicle)} · ${record.title}`
  };

  const FUELING = {
    find: (vehicleId, id) => _findRecord(vehicleId, vehicle => (vehicle.fuelings || []).find(f => f.id === id), 'Abastecimento não encontrado'),
    notPayableError: () => null,
    saveIds: (vehicleId, id, transactionIds) => VehicleFuelService.updateFueling(vehicleId, id, { transactionIds }),
    takenError: 'Esse lançamento já está vinculado a outro registro do veículo',
    paidError: 'Este abastecimento já tem pagamento vinculado; para lançar outro, confirme que é um pagamento adicional',
    describe: (vehicle, record) => `${_vehicleLabel(vehicle)} · Combustível${record.station ? ` · ${record.station}` : ''}`
  };

  // ===== Vincular =====

  function _saveIds(target, vehicleId, recordId, transactionIds) {
    const updated = target.saveIds(vehicleId, recordId, transactionIds);
    return updated.erro ? updated : { transactionIds: updated.transactionIds };
  }

  function _link(target, vehicleId, recordId, transactionId) {
    const found = target.find(vehicleId, recordId);
    if (found.erro) return found;
    const notPayable = target.notPayableError(found.record);
    if (notPayable) return { erro: notPayable };
    if (!FinanceService.getTransacaoById(transactionId)) return { erro: 'Lançamento não encontrado' };
    const owner = _linkedIdsByRecord().get(transactionId);
    if (owner && owner !== recordId) return { erro: target.takenError };
    const ids = found.record.transactionIds;
    return ids.includes(transactionId) ? { transactionIds: ids } : _saveIds(target, vehicleId, recordId, [...ids, transactionId]);
  }

  function _unlink(target, vehicleId, recordId, transactionId) {
    const found = target.find(vehicleId, recordId);
    if (found.erro) return found;
    return _saveIds(target, vehicleId, recordId, found.record.transactionIds.filter(id => id !== transactionId));
  }

  function _linkedTransactions(target, vehicleId, recordId) {
    const found = target.find(vehicleId, recordId);
    if (found.erro) return found;
    return found.record.transactionIds.map(id => {
      const transaction = FinanceService.getTransacaoById(id);
      return transaction ? _describeTransaction(transaction) : { transactionId: id, missing: true };
    });
  }

  // ===== Lançar pagamento =====

  /** `card:<id>` é cartão; qualquer outro valor é o id da conta. */
  function _splitMeans(meio) {
    const isCard = typeof meio === 'string' && meio.startsWith(CARD_PREFIX);
    return isCard ? { cartaoId: meio.slice(CARD_PREFIX.length) } : { contaId: meio };
  }

  function defaultCategoryId(vehicle) {
    const expenseCategories = FinanceService.listCategorias('despesa');
    if (expenseCategories.some(c => c.id === vehicle.financeCategoryId)) return vehicle.financeCategoryId;
    const wanted = Utils.normalizeText(Constants.VEHICLE.DEFAULT_FINANCE_CATEGORY);
    const byName = expenseCategories.find(c => Utils.normalizeText(c.nome) === wanted);
    return byName ? byName.id : null;
  }

  /** Confere se o registro pode receber um lançamento novo; devolve { erro } ou o registro achado. */
  function _payable(target, vehicleId, recordId, { meio, allowAdditional }) {
    const found = target.find(vehicleId, recordId);
    if (found.erro) return found;
    const notPayable = target.notPayableError(found.record);
    if (notPayable) return { erro: notPayable };
    if (found.record.transactionIds.length && !allowAdditional) return { erro: target.paidError };
    return !meio || meio === CARD_PREFIX ? { erro: 'Escolha uma conta ou um cartão' } : found;
  }

  /**
   * Cria a despesa (conta ou cartão) e já a vincula ao registro. Sem `allowAdditional`,
   * recusa quando o registro já tem pagamento (evita lançar em dobro).
   * Se o vínculo falhar, a despesa recém-criada é desfeita.
   */
  function _launch(target, vehicleId, recordId, { meio, valorCentavos, parcelas, categoriaId, data, allowAdditional = false } = {}) {
    const found = _payable(target, vehicleId, recordId, { meio, allowAdditional });
    if (found.erro) return found;
    const expense = FinanceService.addExpense({
      ..._splitMeans(meio),
      valorCentavos,
      parcelas,
      descricao: target.describe(found.vehicle, found.record),
      categoriaId: categoriaId || defaultCategoryId(found.vehicle) || '',
      data,
      fonte: 'veiculo'
    });
    if (expense.erro) return expense;
    const linked = _link(target, vehicleId, recordId, expense.id);
    if (!linked.erro) return expense;
    FinanceService.deleteTransaction(expense.id);
    return linked;
  }

  return {
    suggestLinks,
    defaultMaintenanceAmounts,
    defaultCategoryId,
    link: (vehicleId, maintenanceId, transactionId) => _link(MAINTENANCE, vehicleId, maintenanceId, transactionId),
    unlink: (vehicleId, maintenanceId, transactionId) => _unlink(MAINTENANCE, vehicleId, maintenanceId, transactionId),
    launchPayment: (vehicleId, maintenanceId, options) => _launch(MAINTENANCE, vehicleId, maintenanceId, options),
    getLinkedTransactions: (vehicleId, maintenanceId) => _linkedTransactions(MAINTENANCE, vehicleId, maintenanceId),
    linkFueling: (vehicleId, fuelingId, transactionId) => _link(FUELING, vehicleId, fuelingId, transactionId),
    unlinkFueling: (vehicleId, fuelingId, transactionId) => _unlink(FUELING, vehicleId, fuelingId, transactionId),
    launchFuelPayment: (vehicleId, fuelingId, options) => _launch(FUELING, vehicleId, fuelingId, options),
    getFuelingTransactions: (vehicleId, fuelingId) => _linkedTransactions(FUELING, vehicleId, fuelingId)
  };
})();
