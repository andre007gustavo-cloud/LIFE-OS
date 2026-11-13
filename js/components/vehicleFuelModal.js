/**
 * ===================== VEHICLE FUEL MODAL =====================
 * Cria, edita e exclui um abastecimento do veículo. Dos três valores (litros,
 * preço por litro e total) bastam dois: o terceiro é calculado enquanto se
 * digita. O pagamento ligado às Finanças fica no VehiclePayment (alvo
 * 'fueling'), que este modal inicia, alimenta com data e valor e aplica ao salvar.
 * Markup estático em #veh-fuel-modal (index.html).
 */

const VehicleFuelModal = (() => {

  const MODAL_ID = 'veh-fuel-modal';
  const { FUEL } = Constants.VEHICLE;
  const AMOUNT_FIELDS = { liters: 'veh-f-liters', price: 'veh-f-price', total: 'veh-f-total' };
  const AMOUNT_DECIMALS = { liters: FUEL.LITER_DECIMALS, price: FUEL.PRICE_DECIMALS, total: 2 };
  const CENTS = 100;
  const el = id => document.getElementById(id);
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  let vehicleId = null;
  let editId = null;
  /** Os dois últimos valores que o usuário digitou; o que ficou de fora é o calculado. */
  let typed = [];

  // ===== Números digitados =====

  /** "32,5" ou "32.5" -> 32.5; vazio -> null; texto que não é número -> NaN. */
  function parseDecimal(text) {
    const clean = text.trim();
    if (clean === '') return null;
    return Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
  }

  const amount = field => parseDecimal(el(AMOUNT_FIELDS[field]).value);
  const isPositive = value => Number.isFinite(value) && value > 0;
  const formatAmount = (field, value) => value.toFixed(AMOUNT_DECIMALS[field]).replace('.', ',');

  const DERIVE = {
    liters: ({ price, total }) => total / price,
    price: ({ liters, total }) => total / liters,
    total: ({ liters, price }) => liters * price
  };

  /** Com dois valores válidos digitados, preenche o terceiro. */
  function deriveMissing() {
    const missing = Object.keys(AMOUNT_FIELDS).find(field => !typed.includes(field));
    if (typed.length < 2 || !missing) return;
    const values = Object.fromEntries(typed.map(field => [field, amount(field)]));
    if (!typed.every(field => isPositive(values[field]))) return;
    el(AMOUNT_FIELDS[missing]).value = formatAmount(missing, DERIVE[missing](values));
  }

  function onAmount(field) {
    typed = [...typed.filter(other => other !== field), field].slice(-2);
    deriveMissing();
    updatePayment();
  }

  /** Volume em mL e total em centavos a partir dos campos; valor ausente ou inválido vira undefined ou NaN (o service recusa). */
  function readAmounts() {
    const liters = amount('liters');
    const total = amount('total');
    return {
      volumeMl: liters == null ? undefined : Math.round(liters * FUEL.ML_PER_LITER),
      totalCentavos: total == null ? undefined : Math.round(total * CENTS)
    };
  }

  // ===== Pagamento =====

  /** Data e valor do formulário (ainda não salvo) que orientam as sugestões de vínculo. */
  function updatePayment() {
    const { totalCentavos } = readAmounts();
    const total = Number.isInteger(totalCentavos) && totalCentavos > 0 ? totalCentavos : 0;
    VehiclePayment.update({ date: el('veh-f-date').value, totalCentavos: total, amounts: total ? [total] : [] });
  }

  // ===== Campos =====

  function fillOptions() {
    el('veh-f-fuel').innerHTML = FUEL.TYPES.map(type => `<option value="${attr(type.id)}">${esc(type.label)}</option>`).join('');
    el('veh-dl-stations').innerHTML = VehicleFuelService.listStations(vehicleId).map(name => `<option value="${attr(name)}"></option>`).join('');
  }

  function kmHint() {
    const currentKm = VehicleService.getCurrentKm(VehicleService.getById(vehicleId));
    const last = currentKm == null ? '' : ` Último km registrado: ${currentKm.toLocaleString('pt-BR')}.`;
    return `Com o km, o app atualiza o odômetro e calcula o consumo.${last}`;
  }

  /** Abastecimento novo herda o combustível do último, que costuma se repetir. */
  function defaultFuel() {
    const last = VehicleFuelService.listFuelings(vehicleId)[0];
    return last ? last.fuel : FUEL.DEFAULT_TYPE;
  }

  function fillForm(fueling) {
    const f = fueling || {};
    el('veh-f-date').value = f.date || Utils.today();
    el('veh-f-date').max = Utils.today();
    el('veh-f-km').value = f.km ?? '';
    el('veh-f-km-hint').textContent = kmHint();
    el('veh-f-liters').value = fueling ? formatAmount('liters', f.volumeMl / FUEL.ML_PER_LITER) : '';
    el('veh-f-total').value = fueling ? formatAmount('total', f.totalCentavos / CENTS) : '';
    el('veh-f-price').value = fueling ? formatAmount('price', f.totalCentavos / CENTS / (f.volumeMl / FUEL.ML_PER_LITER)) : '';
    el('veh-f-fuel').value = f.fuel || defaultFuel();
    el('veh-f-full').checked = f.full !== false;
    el('veh-f-station').value = f.station || '';
    el('veh-f-notes').value = f.notes || '';
    typed = fueling ? ['liters', 'total'] : [];
  }

  function readForm() {
    const kmText = el('veh-f-km').value.trim();
    return {
      date: el('veh-f-date').value,
      km: kmText === '' ? null : Number(kmText),
      ...readAmounts(),
      fuel: el('veh-f-fuel').value,
      full: el('veh-f-full').checked,
      station: el('veh-f-station').value,
      notes: el('veh-f-notes').value
    };
  }

  // ===== Abrir =====

  function show(vehicle, fueling, { retryPayment = false } = {}) {
    vehicleId = vehicle;
    editId = fueling ? fueling.id : null;
    fillOptions();
    VehiclePayment.start(vehicle, editId, { target: 'fueling', ...(retryPayment && { adding: true }) });
    fillForm(fueling);
    updatePayment();
    el('veh-f-heading').textContent = fueling ? 'Editar abastecimento' : 'Novo abastecimento';
    el('veh-f-remove').style.display = fueling ? '' : 'none';
    Modal.open(MODAL_ID);
    el(fueling ? 'veh-f-liters' : 'veh-f-km').focus();
  }

  function openNew(id) {
    if (VehicleService.getById(id)) show(id, null);
  }

  function open(id, fuelingId) {
    const fueling = VehicleFuelService.getFueling(id, fuelingId);
    if (fueling.erro) return Feedback.toast(fueling.erro, 'error');
    show(id, fueling);
  }

  // ===== Salvar e excluir =====

  /** Se o pagamento falhar, o abastecimento já está salvo: o modal reabre em edição para nova tentativa. */
  function finishSave(fuelingId) {
    const payment = VehiclePayment.apply(vehicleId, fuelingId);
    VehicleView.refresh();
    if (payment.erro) {
      Feedback.toast(`Abastecimento salvo, mas o pagamento falhou: ${payment.erro}`, 'error');
      return show(vehicleId, VehicleFuelService.getFueling(vehicleId, fuelingId), { retryPayment: true });
    }
    Feedback.toast('Abastecimento salvo', 'success');
    Modal.close(MODAL_ID);
  }

  function save() {
    const paymentCheck = VehiclePayment.validate();
    if (paymentCheck.erro) return Feedback.toast(paymentCheck.erro, 'error');
    const dto = readForm();
    const result = editId
      ? VehicleFuelService.updateFueling(vehicleId, editId, dto)
      : VehicleFuelService.addFueling(vehicleId, dto);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    finishSave(result.id);
  }

  function remove() {
    if (!editId || !confirm('Excluir este abastecimento? Os lançamentos vinculados continuam nas Finanças.')) return;
    const result = VehicleFuelService.removeFueling(vehicleId, editId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Modal.close(MODAL_ID);
    Feedback.toast('Abastecimento excluído', 'success');
    VehicleView.refresh();
  }

  return { openNew, open, save, remove, onAmount, updatePayment };
})();
