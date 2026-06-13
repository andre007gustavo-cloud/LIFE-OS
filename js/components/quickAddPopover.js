/**
 * ===================== QUICK ADD POPOVER =====================
 * Popover universal de criação rápida de tarefa (FAB, "+ Adicionar" do
 * dashboard, "+ Nova tarefa" de projeto, comando da paleta). Modal centralizado;
 * vira tela cheia no mobile via CSS. Input único + preview do parser ao vivo.
 *
 * API: QuickAddPopover.open({ defaults, anchorEl, onSave })
 *  - defaults: { date?, time?, areaId?, projectId? } — usados quando o texto
 *    não preenche o campo. Texto explícito SEMPRE sobrescreve o default.
 *  - onSave(task): callback após criar (default: Navigation.renderAll)
 *
 * Componente de UI: lê services, nunca o Storage direto.
 */

const QuickAddPopover = (() => {

  let overlayEl, inputEl, previewEl;
  let defaults = {};
  let onSaveCb = null;
  let parseDebounced = null;

  // ===== DOM (montado uma vez) =====

  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'qap-overlay';
    overlayEl.id = 'qap-overlay';
    overlayEl.innerHTML = `
      <div class="qap-modal" role="dialog" aria-modal="true" aria-label="Adicionar tarefa">
        <input class="qap-input" id="qap-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="O que precisa ser feito? Ex.: ligar pro Caio amanhã 14h #trabalho !alta">
        <div class="qap-preview" id="qap-preview"></div>
        <div class="qap-footer">
          <button class="qap-more" type="button">+ Mais opções</button>
          <button class="qap-save btn btn-primary" type="button"><i class="ti ti-plus"></i> Adicionar</button>
        </div>
      </div>`;
    document.body.appendChild(overlayEl);

    inputEl = overlayEl.querySelector('#qap-input');
    previewEl = overlayEl.querySelector('#qap-preview');
    parseDebounced = QuickAddShared.debounce(preview, 50);

    inputEl.addEventListener('input', parseDebounced);
    inputEl.addEventListener('keydown', onKey);
    overlayEl.querySelector('.qap-save').addEventListener('click', save);
    overlayEl.querySelector('.qap-more').addEventListener('click', moreOptions);
    overlayEl.addEventListener('mousedown', e => { if (e.target === overlayEl) close(); });
  }

  // ===== Abrir / fechar =====

  function open({ defaults: d = {}, onSave } = {}) {
    ensureDom();
    defaults = d || {};
    onSaveCb = onSave || null;
    inputEl.value = '';
    preview();
    overlayEl.classList.add('open');
    setTimeout(() => inputEl.focus(), 30);
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.remove('open');
    defaults = {};
    onSaveCb = null;
  }

  // ===== Preview =====

  function preview() {
    const raw = inputEl.value.trim();
    if (!raw) {
      previewEl.innerHTML = '';
      previewEl.classList.remove('show');
      return;
    }
    const chips = QuickAddShared.buildPreviewChips(QuickParser.parse(raw, AreaService.getAll()));
    previewEl.innerHTML = chips.join('');
    previewEl.classList.toggle('show', chips.length > 0);
  }

  // ===== Salvar / Mais opções =====

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  /** Combina o que o parser entendeu com os defaults (texto tem precedência) */
  function mergedFields(parsed) {
    const d = defaults || {};
    let area = parsed.areaId || d.areaId || '';
    let project = '';
    if (!parsed.areaId && d.projectId) {
      // Default de projeto: deriva a área dona; texto explícito ignoraria isso
      const owner = AreaService.findAreaByNestedProjectId(d.projectId);
      if (owner) { area = owner.id; project = d.projectId; }
    }
    return {
      name: parsed.name,
      area, project,
      priority: parsed.priority || '',
      date: parsed.date || d.date || '',
      start: parsed.time || d.time || '',
      end: parsed.timeend || '',
      recurrence: parsed.recurrence || ''
    };
  }

  function save() {
    const raw = inputEl.value.trim();
    if (!raw) return;
    const parsed = QuickParser.parse(raw, AreaService.getAll());
    if (!parsed.name) return; // só tokens, sem nome de tarefa
    const task = TaskService.create(mergedFields(parsed));
    const cb = onSaveCb;
    close();
    (cb || Navigation.renderAll)(task);
    Feedback.toast('Tarefa adicionada', 'success');
  }

  /** Fecha e abre o modal completo pré-preenchido com parser + defaults */
  function moreOptions() {
    const parsed = QuickParser.parse(inputEl.value.trim(), AreaService.getAll());
    const fields = mergedFields(parsed);
    close();
    TaskModal.openPrefilled(fields);
  }

  return { open, close };
})();
