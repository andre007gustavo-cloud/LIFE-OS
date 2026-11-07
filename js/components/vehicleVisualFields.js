/**
 * ===================== VEHICLE VISUAL FIELDS =====================
 * Campos do efeito visual de uma modificação no carro 3D (cor da pintura, cor
 * das rodas, película e altura). Usado pelos modais de card e de manutenção e
 * pelo simulador, cada um com o seu prefixo de ids. Só monta e lê campos: quem
 * grava é o service (que valida os valores).
 */

const VehicleVisualFields = (() => {

  const { VISUAL } = Constants.VEHICLE;
  const esc = Utils.escapeHtml;
  const el = id => document.getElementById(id);
  const COLORS = [
    { key: 'paint', label: 'Pintura', fallback: VISUAL.DEFAULT_PAINT },
    { key: 'wheels', label: 'Rodas', fallback: VISUAL.DEFAULT_WHEELS }
  ];

  /** onChange é código fixo do chamador (nunca dado do usuário), executado a cada mudança. */
  function colorHtml(prefix, { key, label, fallback }, onChange) {
    const id = `${prefix}-${key}`;
    return `<div class="veh-visual-field">
      <label class="form-label" for="${id}">${label}</label>
      <div class="veh-visual-color">
        <input type="color" id="${id}" value="${fallback}" data-set="0" oninput="this.dataset.set='1';${onChange}">
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleVisualFields.clearColor('${prefix}','${key}');${onChange}">Padrão</button>
      </div>
    </div>`;
  }

  function filmHtml(prefix, onChange) {
    const options = VISUAL.FILMS.map(f => `<option value="${f.tint}">${esc(f.label)}</option>`).join('');
    return `<div class="veh-visual-field">
      <label class="form-label" for="${prefix}-tint">Película</label>
      <select class="form-select" id="${prefix}-tint" onchange="${onChange}"><option value="">Sem alteração</option>${options}</select>
    </div>`;
  }

  function heightHtml(prefix, onChange) {
    return `<div class="veh-visual-field">
      <label class="form-label" for="${prefix}-ride">Altura (cm)</label>
      <input class="form-input" type="number" id="${prefix}-ride" min="${VISUAL.RIDE_MIN_CM}" max="${VISUAL.RIDE_MAX_CM}" step="1"
        inputmode="numeric" placeholder="0" oninput="${onChange}" title="Em relação à original: negativo rebaixa, positivo levanta">
    </div>`;
  }

  /** Desenha os campos dentro do container (id) com o prefixo dado. */
  function render(containerId, prefix, onChange = '') {
    const change = onChange || 'void 0';
    el(containerId).innerHTML = `<div class="veh-visual-grid" role="group" aria-label="Efeito no carro 3D">
      ${COLORS.map(c => colorHtml(prefix, c, change)).join('')}${filmHtml(prefix, change)}${heightHtml(prefix, change)}
    </div>`;
  }

  function clearColor(prefix, key) {
    const input = el(`${prefix}-${key}`);
    input.value = COLORS.find(c => c.key === key).fallback;
    input.dataset.set = '0';
  }

  function fillColor(prefix, key, value) {
    clearColor(prefix, key);
    if (!value) return;
    el(`${prefix}-${key}`).value = value;
    el(`${prefix}-${key}`).dataset.set = '1';
  }

  /** Preenche com o efeito { paint, wheels, tint, rideHeight } (ou limpa, se vazio). */
  function fill(prefix, effect) {
    const e = effect || {};
    COLORS.forEach(({ key }) => fillColor(prefix, key, e[key]));
    el(`${prefix}-tint`).value = e.tint == null ? '' : String(e.tint);
    el(`${prefix}-ride`).value = e.rideHeight ?? '';
  }

  function readColor(prefix, key) {
    const input = el(`${prefix}-${key}`);
    return input.dataset.set === '1' ? input.value : undefined;
  }

  /** Efeito digitado, só com o que foi mexido; null se nada foi mexido. */
  function read(prefix) {
    const tint = el(`${prefix}-tint`).value;
    const ride = el(`${prefix}-ride`).value.trim();
    const effect = {
      paint: readColor(prefix, 'paint'),
      wheels: readColor(prefix, 'wheels'),
      tint: tint === '' ? undefined : Number(tint),
      rideHeight: ride === '' ? undefined : Number(ride)
    };
    const defined = Object.entries(effect).filter(([, value]) => value !== undefined);
    return defined.length ? Object.fromEntries(defined) : null;
  }

  const setVisible = (containerId, visible) => { el(containerId).hidden = !visible; };

  return { render, fill, read, clearColor, setVisible };
})();
