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
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleVisualFields.clearColor('${prefix}','${key}');${onChange}">Original</button>
      </div>
    </div>`;
  }

  function filmHtml(prefix, onChange) {
    const options = VISUAL.FILMS.map(f => `<option value="${f.tint}">${esc(f.label)}</option>`).join('');
    return `<div class="veh-visual-field">
      <label class="form-label" for="${prefix}-tint">Película</label>
      <select class="form-select" id="${prefix}-tint" onchange="${onChange}"><option value="">Original do carro</option>${options}</select>
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
    input.value = originalColor(key);
    input.dataset.set = '0';
  }

  /** Cor que o seletor mostra quando nada foi escolhido: a do modelo na tela (o seletor não tem "sem valor"). */
  const originalColor = key => Vehicle3D.originalColors()?.[key] ?? COLORS.find(c => c.key === key).fallback;

  /** O 3D acabou de subir: campos de cor sem escolha passam a mostrar a cor original do modelo. */
  function showOriginals(prefix) {
    COLORS.forEach(({ key }) => {
      const input = el(`${prefix}-${key}`);
      if (input?.dataset.set === '0') input.value = originalColor(key);
    });
  }

  function fillColor(prefix, key, value) {
    clearColor(prefix, key);
    if (!value) return;
    el(`${prefix}-${key}`).value = value;
    el(`${prefix}-${key}`).dataset.set = '1';
  }

  /** Película que não é uma das opções (ex.: gravada pelo conector) ganha a sua própria opção, para não se perder ao salvar. */
  function fillTint(prefix, tint) {
    const select = el(`${prefix}-tint`);
    select.querySelector('[data-custom]')?.remove();
    const value = tint == null ? '' : String(tint);
    if (value && ![...select.options].some(option => option.value === value)) {
      const option = new Option(`Personalizada (${Math.round(tint * 100)}%)`, value);
      option.dataset.custom = '1';
      select.add(option);
    }
    select.value = value;
  }

  /** Preenche com o efeito { paint, wheels, tint, rideHeight } (ou limpa, se vazio). */
  function fill(prefix, effect) {
    const e = effect || {};
    COLORS.forEach(({ key }) => fillColor(prefix, key, e[key]));
    fillTint(prefix, e.tint);
    el(`${prefix}-ride`).value = e.rideHeight ?? '';
  }

  function readColor(prefix, key) {
    const input = el(`${prefix}-${key}`);
    return input.dataset.set === '1' ? input.value : undefined;
  }

  /**
   * Altura digitada: vazio ou que não é número finito vira "sem altura". Com clamp, valor fora
   * do alcance é limitado e o campo mostra o valor limitado; sem clamp, o service recusa com erro claro.
   */
  function readHeight(prefix, clamp) {
    const input = el(`${prefix}-ride`);
    const value = Number(input.value.trim() === '' ? NaN : input.value);
    if (!Number.isFinite(value)) return undefined;
    if (!clamp) return value;
    const limited = Utils.clamp(Math.round(value), VISUAL.RIDE_MIN_CM, VISUAL.RIDE_MAX_CM);
    if (limited !== value) input.value = limited;
    return limited;
  }

  /** Efeito digitado, só com o que foi mexido; null se nada foi mexido. */
  function read(prefix, { clamp = false } = {}) {
    const tint = el(`${prefix}-tint`).value;
    const effect = {
      paint: readColor(prefix, 'paint'),
      wheels: readColor(prefix, 'wheels'),
      tint: tint === '' ? undefined : Number(tint),
      rideHeight: readHeight(prefix, clamp)
    };
    const defined = Object.entries(effect).filter(([, value]) => value !== undefined);
    return defined.length ? Object.fromEntries(defined) : null;
  }

  const setVisible = (containerId, visible) => { el(containerId).hidden = !visible; };

  return { render, fill, read, clearColor, showOriginals, setVisible };
})();
