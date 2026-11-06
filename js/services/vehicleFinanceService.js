/**
 * ===================== VEHICLE FINANCE SERVICE =====================
 * Liga manutenções do veículo a lançamentos de Finanças. O vínculo vive só em
 * maintenance.transactionIds; as transações não mudam de formato.
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

  /** transactionId -> id da manutenção a que está vinculada (qualquer veículo). */
  function _linkedIdsByMaintenance() {
    const linked = new Map();
    VehicleService.list().forEach(vehicle => vehicle.maintenances.forEach(m => {
      (m.transactionIds || []).forEach(id => linked.set(id, m.id));
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

  function _isCandidate(transaction, linked, excludedMaintenanceId) {
    const owner = linked.get(transaction.id);
    return transaction.tipo === 'saida' && !transaction.pagamentoFatura
      && (!owner || owner === excludedMaintenanceId);
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

  /** Candidatos a vínculo a partir de valores puros (serve ao formulário ainda não salvo). */
  function suggestLinks({ date, amountsCentavos = [], excludeMaintenanceId, wide = false } = {}) {
    if (!date || !amountsCentavos.length) return [];
    const windowDays = wide ? WIDE_WINDOW_DAYS : WINDOW_DAYS;
    const linked = _linkedIdsByMaintenance();
    return FinanceService.listTransactions()
      .filter(t => _isCandidate(t, linked, excludeMaintenanceId))
      .map(t => _rankedSuggestion(t, date, amountsCentavos, windowDays))
      .filter(Boolean)
      .sort((a, b) => a.amountIndex - b.amountIndex || a.distance - b.distance)
      .slice(0, MAX_SUGGESTIONS)
      .map(item => item.suggestion);
  }

  // ===== Vincular =====

  function _findMaintenance(vehicleId, maintenanceId) {
    const vehicle = VehicleService.getById(vehicleId);
    if (!vehicle) return { erro: 'Veículo não encontrado' };
    const maintenance = vehicle.maintenances.find(m => m.id === maintenanceId);
    return maintenance ? { vehicle, maintenance } : { erro: 'Manutenção não encontrada' };
  }

  function _saveIds(vehicleId, maintenanceId, transactionIds) {
    const updated = VehicleService.updateMaintenance(vehicleId, maintenanceId, { transactionIds });
    return updated.erro ? updated : { transactionIds: updated.transactionIds };
  }

  const NOT_PAYABLE_ERROR = 'Pagamento só em manutenção concluída (Feito)';

  function link(vehicleId, maintenanceId, transactionId) {
    const found = _findMaintenance(vehicleId, maintenanceId);
    if (found.erro) return found;
    if (!VehicleService.isHistory(found.maintenance)) return { erro: NOT_PAYABLE_ERROR };
    if (!FinanceService.getTransacaoById(transactionId)) return { erro: 'Lançamento não encontrado' };
    const owner = _linkedIdsByMaintenance().get(transactionId);
    if (owner && owner !== maintenanceId) return { erro: 'Esse lançamento já está vinculado a outra manutenção' };
    const ids = found.maintenance.transactionIds;
    return ids.includes(transactionId) ? { transactionIds: ids } : _saveIds(vehicleId, maintenanceId, [...ids, transactionId]);
  }

  function unlink(vehicleId, maintenanceId, transactionId) {
    const found = _findMaintenance(vehicleId, maintenanceId);
    if (found.erro) return found;
    return _saveIds(vehicleId, maintenanceId, found.maintenance.transactionIds.filter(id => id !== transactionId));
  }

  function getLinkedTransactions(vehicleId, maintenanceId) {
    const found = _findMaintenance(vehicleId, maintenanceId);
    if (found.erro) return found;
    return found.maintenance.transactionIds.map(id => {
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

  const _vehicleLabel = vehicle => vehicle.nickname || vehicle.model;

  function defaultCategoryId(vehicle) {
    const expenseCategories = FinanceService.listCategorias('despesa');
    if (expenseCategories.some(c => c.id === vehicle.financeCategoryId)) return vehicle.financeCategoryId;
    const wanted = Utils.normalizeText(Constants.VEHICLE.DEFAULT_FINANCE_CATEGORY);
    const byName = expenseCategories.find(c => Utils.normalizeText(c.nome) === wanted);
    return byName ? byName.id : null;
  }

  const ALREADY_PAID_ERROR = 'Esta manutenção já tem pagamento vinculado; para lançar outro, confirme que é um pagamento adicional';

  /**
   * Cria a despesa (conta ou cartão) e já a vincula à manutenção. Sem
   * `allowAdditional`, recusa quando a manutenção já tem pagamento (evita lançar em dobro).
   * Se o vínculo falhar, a despesa recém-criada é desfeita.
   */
  function launchPayment(vehicleId, maintenanceId, { meio, valorCentavos, parcelas, categoriaId, data, allowAdditional = false } = {}) {
    const found = _findMaintenance(vehicleId, maintenanceId);
    if (found.erro) return found;
    if (!VehicleService.isHistory(found.maintenance)) return { erro: NOT_PAYABLE_ERROR };
    if (found.maintenance.transactionIds.length && !allowAdditional) return { erro: ALREADY_PAID_ERROR };
    if (!meio || meio === CARD_PREFIX) return { erro: 'Escolha uma conta ou um cartão' };
    const expense = FinanceService.addExpense({
      ..._splitMeans(meio),
      valorCentavos,
      parcelas,
      descricao: `${_vehicleLabel(found.vehicle)} · ${found.maintenance.title}`,
      categoriaId: categoriaId || defaultCategoryId(found.vehicle) || '',
      data,
      fonte: 'veiculo'
    });
    if (expense.erro) return expense;
    const linked = link(vehicleId, maintenanceId, expense.id);
    if (!linked.erro) return expense;
    FinanceService.deleteTransaction(expense.id);
    return linked;
  }

  return {
    suggestLinks,
    defaultMaintenanceAmounts,
    link,
    unlink,
    launchPayment,
    getLinkedTransactions,
    defaultCategoryId
  };
})();
