/**
 * ===================== FINANCE QUICK ADD =====================
 * Popover de lançamento rápido (FAB de Finanças). Input único + preview ao vivo
 * dos chips do parser financeiro + voz (Web Speech API) + "+ Mais opções" que
 * abre o FinanceModal pré-preenchido. Mesmo padrão do QuickAddPopover de tarefas.
 *
 * Componente de UI: lê services, nunca o Storage direto.
 */

const FinanceQuickAdd = (() => {

  let overlayEl, inputEl, previewEl, micBtn, parseDebounced;
  let recognition = null;
  let usedVoice = false;

  function ctx() {
    return { categorias: FinanceService.listCategorias(), contas: FinanceService.listContas() };
  }

  // ===== DOM (montado uma vez) =====

  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'qap-overlay';
    overlayEl.id = 'fqa-overlay';
    overlayEl.innerHTML = `
      <div class="qap-modal" role="dialog" aria-modal="true" aria-label="Novo lançamento">
        <div class="fqa-input-row">
          <input class="qap-input" id="fqa-input" type="text" autocomplete="off" spellcheck="false"
                 placeholder="Ex.: mercado 85,50 #mercado @carteira · recebi 1500 salário">
          <button class="fqa-mic" id="fqa-mic" type="button" title="Falar"><i class="ti ti-microphone"></i></button>
        </div>
        <div class="qap-preview" id="fqa-preview"></div>
        <div class="qap-footer">
          <button class="qap-more" type="button">+ Mais opções</button>
          <button class="qap-save btn btn-primary" type="button"><i class="ti ti-plus"></i> Lançar</button>
        </div>
      </div>`;
    document.body.appendChild(overlayEl);

    inputEl = overlayEl.querySelector('#fqa-input');
    previewEl = overlayEl.querySelector('#fqa-preview');
    micBtn = overlayEl.querySelector('#fqa-mic');
    parseDebounced = QuickAddShared.debounce(preview, 50);

    inputEl.addEventListener('input', () => { usedVoice = false; parseDebounced(); });
    inputEl.addEventListener('keydown', onKey);
    overlayEl.querySelector('.qap-save').addEventListener('click', save);
    overlayEl.querySelector('.qap-more').addEventListener('click', moreOptions);
    overlayEl.addEventListener('mousedown', e => { if (e.target === overlayEl) close(); });
    initVoice();
  }

  // ===== Voz (mesmo padrão do InboxCapture) =====

  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.display = 'none'; return; }
    recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = e => {
      const text = e.results[0][0].transcript.trim();
      if (text) {
        inputEl.value = (inputEl.value + ' ' + text).trim();
        usedVoice = true;
        preview();
      }
    };
    recognition.onerror = e => {
      if (e.error === 'not-allowed') Feedback.toast('Permita o acesso ao microfone para usar a voz', 'warn');
      micBtn.classList.remove('listening');
    };
    recognition.onend = () => micBtn.classList.remove('listening');
    micBtn.addEventListener('click', () => {
      micBtn.classList.add('listening');
      try { recognition.start(); } catch { /* já estava ouvindo */ }
    });
  }

  // ===== Abrir / fechar =====

  function open() {
    ensureDom();
    inputEl.value = '';
    usedVoice = false;
    preview();
    overlayEl.classList.add('open');
    setTimeout(() => inputEl.focus(), 30);
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.remove('open');
    if (recognition) { try { recognition.abort(); } catch { /* não ouvia */ } }
    micBtn.classList.remove('listening');
  }

  // ===== Preview =====

  function preview() {
    const raw = inputEl.value.trim();
    if (!raw) {
      previewEl.innerHTML = '';
      previewEl.classList.remove('show');
      return;
    }
    const parsed = QuickParser.parseFinance(raw, ctx());
    const chips = QuickAddShared.buildFinancePreviewChips(parsed, ctx());
    previewEl.innerHTML = chips.join('');
    previewEl.classList.toggle('show', chips.length > 0);
  }

  // ===== Salvar / Mais opções =====

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  /** Completa o que o parser entendeu com defaults (1ª conta, 1ª categoria do tipo) */
  function mergedFields(parsed) {
    const c = ctx();
    let categoriaId = parsed.categoriaId;
    if (!categoriaId && parsed.tipo !== 'transferencia') {
      const list = FinanceService.listCategorias(parsed.tipo === 'entrada' ? 'receita' : 'despesa');
      categoriaId = list[0] ? list[0].id : '';
    }
    return {
      tipo: parsed.tipo,
      valorCentavos: parsed.valorCentavos,
      descricao: parsed.descricao,
      categoriaId,
      contaId: parsed.contaId || (c.contas[0] && c.contas[0].id) || '',
      data: parsed.data || Utils.today(),
      fonte: usedVoice ? 'voz' : 'parser'
    };
  }

  function save() {
    const raw = inputEl.value.trim();
    if (!raw) return;
    const parsed = QuickParser.parseFinance(raw, ctx());
    if (!parsed.valorCentavos) { Feedback.toast('Informe um valor', 'warn'); return; }
    FinanceService.addTransaction(mergedFields(parsed));
    close();
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
    Feedback.toast('Lançamento adicionado', 'success');
  }

  /** Fecha e abre o modal completo pré-preenchido com o que o parser entendeu */
  function moreOptions() {
    const parsed = QuickParser.parseFinance(inputEl.value.trim(), ctx());
    const fields = mergedFields(parsed);
    close();
    FinanceModal.openPrefilled(fields);
  }

  return { open, close };
})();
