/**
 * ===================== VEHICLE SIMULATOR =====================
 * Controles da Garagem para ver o carro 3D com outra aparência: o toggle
 * "Prévia: incluir planejadas", a legenda do que está sendo mostrado e o painel
 * recolhível "Simular" (cor, rodas, película, altura), que age ao vivo e NUNCA
 * grava. "Salvar como ideia" abre o modal de card como Modificação em Ideias
 * com o efeito; "Descartar" volta ao que está registrado.
 * O estado (prévia ligada, simulação, painel aberto) vive só na tela, em AppState.ui.vehicleSim.
 */

const VehicleSimulator = (() => {

  const FIELDS_PREFIX = 'veh-sim';
  const UNAVAILABLE_TEXT = 'O simulador precisa do carro em 3D, que não está disponível neste aparelho.';
  const RETRY_TEXT = 'Não foi possível carregar o 3D agora; tente de novo.';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const el = id => document.getElementById(id);

  /** A simulação e a prévia pertencem a um veículo: ao trocar de veículo recomeçam. */
  function stateFor(vehicleId) {
    if (AppState.ui.vehicleSim.vehicleId !== vehicleId) {
      AppState.ui.vehicleSim = { vehicleId, preview: false, override: null, open: false };
    }
    return AppState.ui.vehicleSim;
  }

  /** Aparência a mostrar agora: registrado + prévia (se ligada) + simulação. */
  const lookFor = vehicleId => {
    const { preview, override } = stateFor(vehicleId);
    return VehicleSceneService.getLook(vehicleId, { preview, override: override || undefined });
  };

  function legendText(look) {
    const parts = look.applied.map(a => (a.planned ? `${a.title} (planejada)` : a.title));
    if (look.simulated) parts.push('sua simulação');
    return `Mostrando: ${parts.length ? parts.join(' · ') : 'o carro como está registrado'}`;
  }

  function refreshLegend(look) {
    const legend = el('veh-sim-legend');
    if (legend) legend.textContent = legendText(look);
  }

  /** Aplica a aparência no 3D e na legenda; não grava nada. */
  function applyNow(vehicleId) {
    const look = lookFor(vehicleId);
    Vehicle3D.applyLook(look);
    refreshLegend(look);
  }

  // ===== Ações =====

  function setPreview(vehicleId, checked) {
    stateFor(vehicleId).preview = checked;
    applyNow(vehicleId);
  }

  function setOpen(isOpen) {
    AppState.ui.vehicleSim.open = isOpen;
  }

  function update() {
    const sim = AppState.ui.vehicleSim;
    sim.override = VehicleVisualFields.read(FIELDS_PREFIX, { clamp: true });
    applyNow(sim.vehicleId);
  }

  function discard() {
    const sim = AppState.ui.vehicleSim;
    sim.override = null;
    VehicleVisualFields.fill(FIELDS_PREFIX, null);
    applyNow(sim.vehicleId);
  }

  function saveAsIdea(vehicleId) {
    const effect = VehicleVisualFields.read(FIELDS_PREFIX);
    if (!effect) return Feedback.toast('Mexa em algum campo do simulador antes de salvar como ideia', 'error');
    VehicleCardModal.openNewMod(vehicleId, effect);
  }

  // ===== Tela =====

  function controlsHtml(vehicleId) {
    const id = attr(vehicleId);
    return `<div id="veh-sim-fields"></div>
      <div class="veh-sim-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="VehicleSimulator.saveAsIdea('${id}')"><i class="ti ti-bulb"></i> Salvar como ideia</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleSimulator.discard()">Descartar</button>
      </div>
      <p class="veh-sim-note">A simulação só aparece na tela; nada é gravado até você salvar como ideia.</p>`;
  }

  /** Bloco da Garagem (toggle, legenda e painel). Sem 3D, só explica que o simulador precisa dele. */
  function html(vehicleId) {
    const { preview, open } = stateFor(vehicleId);
    if (!Vehicle3D.isSupported()) return unavailableHtml();
    return `<div class="veh-sim-bar">
        <label class="veh-sim-toggle"><input type="checkbox" id="veh-sim-preview"${preview ? ' checked' : ''}
          onchange="VehicleSimulator.setPreview('${attr(vehicleId)}', this.checked)"> Prévia: incluir planejadas</label>
        <div class="veh-sim-legend" id="veh-sim-legend" aria-live="polite">${esc(legendText(lookFor(vehicleId)))}</div>
      </div>
      <details class="veh-sim" id="veh-sim"${open ? ' open' : ''} ontoggle="VehicleSimulator.setOpen(this.open)">
        <summary>Simular</summary>${controlsHtml(vehicleId)}
      </details>`;
  }

  /** Sem suporte é definitivo; com suporte, o 3D só falhou agora (rede) e a próxima montagem tenta de novo. */
  const unavailableHtml = () => `<details class="veh-sim"><summary>Simular</summary><p class="veh-sim-note">${Vehicle3D.isSupported() ? RETRY_TEXT : UNAVAILABLE_TEXT}</p></details>`;

  /** Monta os campos depois que o HTML da Garagem entrou na tela. */
  function setup(vehicleId) {
    if (!el('veh-sim-fields')) return;
    VehicleVisualFields.render('veh-sim-fields', FIELDS_PREFIX, 'VehicleSimulator.update()');
    VehicleVisualFields.fill(FIELDS_PREFIX, stateFor(vehicleId).override);
  }

  /** O 3D não subiu: troca o bloco pela explicação. */
  function showUnavailable() {
    const root = el('veh-sim-root');
    if (root) root.innerHTML = unavailableHtml();
  }

  return { lookFor, html, setup, showUnavailable, setPreview, setOpen, update, discard, saveAsIdea };
})();
