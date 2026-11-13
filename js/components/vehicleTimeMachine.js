/**
 * ===================== VEHICLE TIME MACHINE =====================
 * Máquina do tempo da Garagem: um controle deslizante de datas, do primeiro dia
 * conhecido do carro até hoje, com os botões de evento anterior e próximo.
 * Numa data do passado o carro 3D mostra as modificações que existiam naquele
 * dia, a faixa de fotos mostra as fotos até ali e a linha de resumo traz o km e
 * o gasto acumulado. Nada é gravado: a data visitada vive em AppState.ui.vehicleTime.
 */

const VehicleTimeMachine = (() => {

  const HINT_TEXT = 'Arraste para ver o carro, o km e os gastos em outra data.';
  const NO_PHOTOS_TEXT = 'Nenhuma foto até essa data';
  const TODAY_LABEL = 'Hoje';
  const attr = Utils.escapeAttr;
  const esc = Utils.escapeHtml;
  const el = id => document.getElementById(id);

  /** A data visitada pertence a um veículo: ao trocar de veículo, volta para hoje. */
  function stateFor(vehicleId) {
    if (AppState.ui.vehicleTime.vehicleId !== vehicleId) AppState.ui.vehicleTime = { vehicleId, date: null };
    return AppState.ui.vehicleTime;
  }

  /** Data do passado que a Garagem está mostrando, ou null no presente. */
  function dateFor(vehicleId) {
    const { date } = stateFor(vehicleId);
    return date && date < Utils.today() ? date : null;
  }

  // ===== Textos =====

  const dateLabel = date => (date ? Utils.fmtDateFull(date) : TODAY_LABEL);
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

  function infoText(vehicleId, date) {
    if (!date) return HINT_TEXT;
    const snapshot = VehicleTimelineService.getSnapshot(vehicleId, date);
    if (snapshot.erro) return '';
    const km = snapshot.km == null ? 'km não registrado' : `${snapshot.km.toLocaleString('pt-BR')} km`;
    const spent = `${Utils.formatBRL(snapshot.totalCentavos)} gastos até ali`;
    return [km, spent, plural(snapshot.maintenanceCount, 'manutenção', 'manutenções'), plural(snapshot.photoCount, 'foto', 'fotos')].join(' · ');
  }

  // ===== Tela =====

  function stepButtonHtml(vehicleId, direction, label, icon) {
    return `<button type="button" class="btn btn-ghost btn-sm" aria-label="${label}" title="${label}"
      onclick="VehicleTimeMachine.step('${attr(vehicleId)}', ${direction})"><i class="ti ti-${icon}" aria-hidden="true"></i></button>`;
  }

  function sliderHtml(vehicleId, range, date) {
    const id = attr(vehicleId);
    const offset = date ? Utils.diffDays(range.start, date) : range.days;
    return `<input type="range" class="veh-time-range" id="veh-time-range" min="0" max="${range.days}" step="1" value="${offset}"
      aria-valuetext="${attr(dateLabel(date))}"
      oninput="VehicleTimeMachine.preview('${id}', this.value)" onchange="VehicleTimeMachine.commit('${id}')">`;
  }

  function actionsHtml(vehicleId, date) {
    const id = attr(vehicleId);
    return `<span class="veh-time-actions" id="veh-time-actions"${date ? '' : ' hidden'}>
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleTimeMachine.openPhotos('${id}')"><i class="ti ti-photo" aria-hidden="true"></i> Ver fotos do período</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleTimeMachine.reset('${id}')">Voltar para hoje</button>
    </span>`;
  }

  /** Data guardada que ficou fora do intervalo (registro apagado, virada do dia) volta para hoje. */
  function validDate(vehicleId, range) {
    const date = dateFor(vehicleId);
    if (date && date >= range.start) return date;
    stateFor(vehicleId).date = null;
    return null;
  }

  /** Bloco da Garagem; vazio enquanto o carro não tem nenhum dia no passado para visitar. */
  function html(vehicleId) {
    const range = VehicleTimelineService.getRange(vehicleId);
    if (!range) return '';
    const date = validDate(vehicleId, range);
    return `<div class="veh-time" id="veh-time">
      <div class="veh-time-head">
        <label class="veh-time-label" for="veh-time-range"><i class="ti ti-history" aria-hidden="true"></i> Máquina do tempo</label>
        <strong class="veh-time-date" id="veh-time-date">${esc(dateLabel(date))}</strong>
      </div>
      <div class="veh-time-row">
        ${stepButtonHtml(vehicleId, -1, 'Evento anterior', 'chevron-left')}
        ${sliderHtml(vehicleId, range, date)}
        ${stepButtonHtml(vehicleId, 1, 'Próximo evento', 'chevron-right')}
      </div>
      <div class="veh-time-foot">
        <span class="veh-time-info" id="veh-time-info" aria-live="polite">${esc(infoText(vehicleId, date))}</span>
        ${actionsHtml(vehicleId, date)}
      </div>
    </div>`;
  }

  /** Atualiza só os textos do bloco (o controle deslizante continua sob o dedo). */
  function syncBar(vehicleId, range, date) {
    const slider = el('veh-time-range');
    if (!slider) return;
    slider.value = date ? Utils.diffDays(range.start, date) : range.days;
    slider.setAttribute('aria-valuetext', dateLabel(date));
    el('veh-time-date').textContent = dateLabel(date);
    el('veh-time-info').textContent = infoText(vehicleId, date);
    el('veh-time-actions').hidden = !date;
  }

  // ===== Ações =====

  /** Muda a data visitada e atualiza o carro e os textos; as fotos só trocam no commit. */
  function show(vehicleId, date) {
    const range = VehicleTimelineService.getRange(vehicleId);
    if (!range) return;
    const clamped = date && date > range.start ? date : range.start;
    stateFor(vehicleId).date = clamped < range.end ? clamped : null;
    syncBar(vehicleId, range, dateFor(vehicleId));
    VehicleSimulator.timeChanged(vehicleId);
  }

  /** Enquanto o controle é arrastado: só o que é barato (3D e textos). */
  function preview(vehicleId, offset) {
    const range = VehicleTimelineService.getRange(vehicleId);
    if (range) show(vehicleId, Utils.addDays(range.start, Number(offset)));
  }

  /** Ao soltar o controle: a faixa de fotos da Garagem passa a mostrar as fotos até a data. */
  function commit(vehicleId) {
    VehicleView.photosChanged(vehicleId);
  }

  function goTo(vehicleId, date) {
    show(vehicleId, date);
    commit(vehicleId);
  }

  /** Pula para o evento anterior (-1) ou o próximo (+1); depois do último evento, volta para hoje. */
  function step(vehicleId, direction) {
    const range = VehicleTimelineService.getRange(vehicleId);
    if (!range) return;
    const current = dateFor(vehicleId) || range.end;
    const events = VehicleTimelineService.getEventDates(vehicleId);
    const target = direction < 0 ? events.filter(date => date < current).pop() : events.find(date => date > current);
    goTo(vehicleId, target || (direction < 0 ? range.start : range.end));
  }

  function reset(vehicleId) {
    goTo(vehicleId, Utils.today());
  }

  /** Abre a aba Fotos já no mês da foto mais recente até a data visitada. */
  function openPhotos(vehicleId) {
    const month = VehicleTimelineService.photoMonthAt(vehicleId, dateFor(vehicleId) || Utils.today());
    if (!month) return Feedback.toast(NO_PHOTOS_TEXT, 'info');
    AppState.ui.vehiclePhotoMonth = month;
    AreasView.setProjTab('photos');
  }

  return { dateFor, html, preview, commit, step, reset, openPhotos };
})();
