/**
 * ===================== VEHICLE PAYMENT =====================
 * Seção de pagamento dentro de #veh-maint-modal: vincula a manutenção a um
 * lançamento existente, lança um novo (conta ou cartão) ou não lança nada.
 * A escolha só é aplicada quando o modal salva a manutenção (apply).
 * Desvincular, na edição, vale na hora. Renderiza em #veh-m-payment.
 */

const VehiclePayment = (() => {

  const ROOT_ID = 'veh-m-payment';
  const { CARD_PREFIX } = Constants.VEHICLE;
  const MODES = [
    { id: 'link', label: 'Vincular existente' },
    { id: 'launch', label: 'Lançar agora' },
    { id: 'none', label: 'Não lançar' }
  ];
  const el = id => document.getElementById(id);
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  let state = null;
  let suggestions = [];

  function freshState(vehicleId, maintenanceId, adding) {
    return {
      vehicleId, maintenanceId, adding,
      snapshot: { date: '', totalCentavos: 0, amounts: [] },
      mode: 'none', modeTouched: false, selectedId: null, wide: false,
      meio: '', parcelas: '1', categoriaId: null, valueText: '', valueTouched: false
    };
  }

  /** Zera a seção ao abrir o modal. `adding` mostra as opções já abertas (nova manutenção ou nova tentativa). */
  function start(vehicleId, maintenanceId, { adding = !maintenanceId } = {}) {
    state = freshState(vehicleId, maintenanceId, adding);
    suggestions = [];
    state.categoriaId = VehicleFinanceService.defaultCategoryId(VehicleService.getById(vehicleId));
  }

  // ===== Dados =====

  function linkedList() {
    if (!state.maintenanceId) return [];
    const linked = VehicleFinanceService.getLinkedTransactions(state.vehicleId, state.maintenanceId);
    return linked.erro ? [] : linked;
  }

  const hasTotal = () => state.snapshot.totalCentavos > 0;
  const optionsVisible = () => hasTotal() && state.adding;

  function loadSuggestions() {
    const { date, amounts } = state.snapshot;
    suggestions = VehicleFinanceService.suggestLinks({
      date, amountsCentavos: amounts, excludeMaintenanceId: state.maintenanceId, wide: state.wide
    });
    if (!suggestions.some(s => s.transactionId === state.selectedId)) state.selectedId = null;
    if (!state.modeTouched) state.mode = suggestions.length ? 'link' : 'none';
  }

  /** Chamado pelo modal sempre que a data ou os valores mudam. */
  function update(snapshot) {
    if (!state) return;
    state.snapshot = snapshot;
    if (!state.valueTouched) state.valueText = hasTotal() ? Utils.centavosToInput(snapshot.totalCentavos) : '';
    loadSuggestions();
    render();
  }

  // ===== HTML =====

  function linkedItemHtml(item) {
    const id = attr(item.transactionId);
    const button = label => `<button type="button" class="btn btn-ghost btn-sm"
      onclick="VehiclePayment.unlink('${id}')">${label}</button>`;
    if (item.missing) {
      return `<div class="veh-pay-item veh-pay-missing"><span>Lançamento removido das Finanças</span>${button('Remover vínculo')}</div>`;
    }
    const source = item.contaOuCartao ? ' · ' + esc(item.contaOuCartao) : '';
    return `<div class="veh-pay-item"><span>${Utils.fmtDate(item.data)} · ${Utils.formatBRL(item.valorCentavos)}
      · ${esc(item.descricao)}${source}</span>${button('Desvincular')}</div>`;
  }

  function linkedHtml(linked) {
    if (!linked.length) return '';
    return `<div class="veh-pay-linked" role="group" aria-label="Pagamentos vinculados">
      ${linked.map(linkedItemHtml).join('')}</div>`;
  }

  function modeRadiosHtml() {
    return `<div class="veh-pay-modes" role="radiogroup" aria-label="Pagamento">${MODES.map(m => `
      <label class="filter-chip${state.mode === m.id ? ' active' : ''}">
        <input type="radio" name="veh-pay-mode" id="veh-pay-mode-${m.id}" value="${m.id}"
          ${state.mode === m.id ? 'checked' : ''} onchange="VehiclePayment.setMode('${m.id}')"> ${m.label}
      </label>`).join('')}</div>`;
  }

  function suggestionHtml(s, index) {
    const source = s.contaOuCartao ? ' · ' + esc(s.contaOuCartao) : '';
    return `<label class="veh-pay-item veh-pay-suggestion">
      <input type="radio" name="veh-pay-pick" id="veh-pay-s-${index}" ${s.transactionId === state.selectedId ? 'checked' : ''}
        onchange="VehiclePayment.pick('${attr(s.transactionId)}')">
      <span>${Utils.fmtDate(s.data)} · ${Utils.formatBRL(s.valorCentavos)} · ${esc(s.descricao)}${source}
        <small class="veh-pay-reason">${esc(s.reason)}</small></span></label>`;
  }

  function linkPanelHtml() {
    const wideButton = state.wide ? '' : `<button type="button" class="btn btn-ghost btn-sm"
      onclick="VehiclePayment.searchWide()">Procurar em ${Constants.VEHICLE.LINK.WIDE_WINDOW_DAYS} dias</button>`;
    if (!suggestions.length) {
      return `<p class="veh-pay-empty">Nenhum lançamento parecido encontrado nas Finanças.</p>${wideButton}`;
    }
    return `<div role="radiogroup" aria-label="Lançamentos sugeridos">${suggestions.map(suggestionHtml).join('')}</div>${wideButton}`;
  }

  function meioOptionsHtml() {
    const accounts = FinanceService.listContas()
      .map(c => `<option value="${attr(c.id)}">${esc(c.icone)} ${esc(c.nome)}</option>`).join('');
    const cards = (typeof CartaoService !== 'undefined' ? CartaoService.listCartoes() : [])
      .map(c => `<option value="${CARD_PREFIX}${attr(c.id)}">💳 ${esc(c.nome)}</option>`).join('');
    const placeholder = '<option value="">Escolha a conta ou o cartão</option>';
    return placeholder + accounts + (cards ? `<optgroup label="Cartões de crédito">${cards}</optgroup>` : '');
  }

  function categoryOptionsHtml() {
    return FinanceService.listCategorias('despesa')
      .map(c => `<option value="${attr(c.id)}">${esc(c.icone)} ${esc(c.nome)}</option>`).join('');
  }

  const fieldHtml = (label, id, control) =>
    `<div class="form-group"><label class="form-label" for="${id}">${label}</label>${control}</div>`;

  function installmentsHtml() {
    if (!state.meio.startsWith(CARD_PREFIX)) return '';
    return fieldHtml('Parcelas', 'veh-pay-parcelas',
      `<input class="form-input" id="veh-pay-parcelas" type="number" min="1" step="1" value="${attr(state.parcelas)}"
        oninput="VehiclePayment.setField('parcelas', this.value)">`);
  }

  function launchPanelHtml() {
    const meio = `<select class="form-select" id="veh-pay-meio" onchange="VehiclePayment.setMeio(this.value)">${meioOptionsHtml()}</select>`;
    const valor = `<input class="form-input" id="veh-pay-valor" inputmode="decimal" value="${attr(state.valueText)}"
      oninput="VehiclePayment.setValue(this.value)">`;
    const categoria = `<select class="form-select" id="veh-pay-cat"
      onchange="VehiclePayment.setField('categoriaId', this.value)">${categoryOptionsHtml()}</select>`;
    return `<div class="form-row">${fieldHtml('Pagar com', 'veh-pay-meio', meio)}${fieldHtml('Valor (R$)', 'veh-pay-valor', valor)}</div>
      <div class="form-row">${fieldHtml('Categoria', 'veh-pay-cat', categoria)}${installmentsHtml()}</div>`;
  }

  const PANELS = { link: linkPanelHtml, launch: launchPanelHtml, none: () => '' };

  function optionsHtml() {
    if (optionsVisible()) return modeRadiosHtml() + PANELS[state.mode]();
    if (!state.maintenanceId || !hasTotal()) return '';
    return `<button type="button" class="btn btn-ghost btn-sm" id="veh-pay-add"
      onclick="VehiclePayment.addPayment()"><i class="ti ti-plus"></i> Adicionar pagamento</button>`;
  }

  function restoreSelects() {
    if (!optionsVisible() || state.mode !== 'launch') return;
    el('veh-pay-meio').value = state.meio;
    el('veh-pay-cat').value = state.categoriaId || '';
  }

  function render(focusId) {
    const root = el(ROOT_ID);
    if (!root || !state) return;
    const linked = linkedList();
    root.hidden = !hasTotal() && !linked.length;
    root.innerHTML = `<span class="form-label">Pagamento</span>${linkedHtml(linked)}${optionsHtml()}`;
    restoreSelects();
    if (focusId && el(focusId)) el(focusId).focus();
  }

  // ===== Ações da tela =====

  function setMode(mode) {
    state.mode = mode;
    state.modeTouched = true;
    render(`veh-pay-mode-${mode}`);
  }

  function pick(transactionId) {
    state.selectedId = transactionId;
  }

  function searchWide() {
    state.wide = true;
    loadSuggestions();
    render();
  }

  function setMeio(meio) {
    state.meio = meio;
    render('veh-pay-meio');
  }

  function setField(field, value) {
    state[field] = value;
  }

  function setValue(text) {
    state.valueText = text;
    state.valueTouched = true;
  }

  function addPayment() {
    state.adding = true;
    loadSuggestions();
    render(`veh-pay-mode-${state.mode}`);
  }

  function unlink(transactionId) {
    const result = VehicleFinanceService.unlink(state.vehicleId, state.maintenanceId, transactionId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    loadSuggestions();
    render();
  }

  // ===== Aplicar ao salvar =====

  function launchDto() {
    return {
      meio: state.meio,
      valorCentavos: Utils.brlToCentavos(state.valueText),
      parcelas: state.meio.startsWith(CARD_PREFIX) ? Number(state.parcelas) : 1,
      categoriaId: state.categoriaId || undefined,
      data: state.snapshot.date,
      allowAdditional: Boolean(state.maintenanceId)
    };
  }

  /** Confere a escolha antes de salvar a manutenção, para não deixar o pagamento pela metade. */
  function validate() {
    if (!state || !optionsVisible()) return {};
    if (state.mode === 'link' && !state.selectedId) {
      return { erro: 'Escolha o lançamento a vincular, ou marque "Não lançar"' };
    }
    if (state.mode !== 'launch') return {};
    if (!state.meio) return { erro: 'Escolha a conta ou o cartão do pagamento' };
    const { parcelas } = launchDto();
    if (!Number.isInteger(parcelas) || parcelas < 1) return { erro: 'As parcelas devem ser um número inteiro a partir de 1' };
    return launchDto().valorCentavos > 0 ? {} : { erro: 'Informe um valor de pagamento maior que zero' };
  }

  /** Aplica a escolha à manutenção já salva. Devolve { erro } se falhar; a manutenção não é desfeita. */
  function apply(vehicleId, maintenanceId) {
    if (!state || !optionsVisible()) return {};
    if (state.mode === 'link') return VehicleFinanceService.link(vehicleId, maintenanceId, state.selectedId);
    if (state.mode === 'launch') return VehicleFinanceService.launchPayment(vehicleId, maintenanceId, launchDto());
    return {};
  }

  return {
    start, update, validate, apply,
    setMode, pick, searchWide, setMeio, setField, setValue, addPayment, unlink
  };
})();
