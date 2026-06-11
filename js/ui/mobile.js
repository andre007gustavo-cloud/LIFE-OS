/**
 * ===================== UI: mobile sidebar =====================
 * Sliding drawer for the task sidebar on mobile screens.
 */

const MobileSidebar = (() => {

  let _closeTimer = null;

  function open() {
    if (!Utils.isMobile()) return;
    const panel = document.getElementById('mobile-sidebar-panel');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (!panel || !overlay) return;

    // Limpa o clone antigo ANTES de buscar a sidebar: o clone mantém a classe
    // .tt-sidebar e o painel vem antes no DOM, então sem isso o querySelector
    // encontraria o clone morto (sem onclick) e o menu abriria sem cliques.
    if (_closeTimer) clearTimeout(_closeTimer);
    panel.innerHTML = '';

    const sidebar = document.querySelector('.tt-sidebar');
    if (!sidebar) return;

    const clone = cloneAndRewireSidebar(sidebar);
    panel.appendChild(clone);

    panel.style.display = 'block';
    overlay.style.display = 'block';
    requestAnimationFrame(() => panel.style.transform = 'translateX(0)');
  }

  function close() {
    const panel = document.getElementById('mobile-sidebar-panel');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (!panel || !overlay) return;
    panel.style.transform = 'translateX(-100%)';
    overlay.style.display = 'none';
    _closeTimer = setTimeout(() => {
      panel.style.display = 'none';
      // Remove o clone para os re-renders voltarem a atualizar a sidebar real
      // (IDs duplicados no clone capturam os getElementById enquanto ele existe)
      panel.innerHTML = '';
    }, 260);
  }

  /** Update the menu button visibility based on viewport */
  function updateUI() {
    const btn = document.getElementById('tt-mobile-menu-btn');
    if (btn) btn.style.display = Utils.isMobile() ? 'flex' : 'none';
  }

  // ===== Internal =====

  /** Clone sidebar and convert inline onclick attrs into real listeners */
  function cloneAndRewireSidebar(sidebar) {
    const clone = sidebar.cloneNode(true);
    clone.style.cssText = 'width:260px;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg2);border-right:1px solid var(--border)';
    // cloneNode preserva a ordem dos nós, então o índice mapeia clone → original.
    // Disparar o click do original executa o onclick dele sem precisar de eval.
    const originals = sidebar.querySelectorAll('[onclick]');
    clone.querySelectorAll('[onclick]').forEach((el, i) => {
      const original = originals[i];
      el.removeAttribute('onclick');
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (original) original.click();
        close();
      });
    });
    return clone;
  }

  /**
   * Gesto: deslizar da borda esquerda → abre o menu (na aba de tarefas);
   * deslizar o drawer aberto para a esquerda → fecha.
   */
  function initEdgeSwipe() {
    let startX = null, startY = null, mode = null; // 'open' | 'close'

    document.addEventListener('touchstart', e => {
      mode = null;
      if (!Utils.isMobile()) return;
      const t = e.touches[0];
      const panel = document.getElementById('mobile-sidebar-panel');
      const panelOpen = panel && panel.style.display === 'block';

      if (panelOpen) {
        mode = 'close';
      } else {
        const view = document.getElementById('view-tasks');
        if (!view || !view.classList.contains('active')) return;
        if (t.clientX > 30) return; // só conta a partir da borda esquerda
        mode = 'open';
      }
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!mode) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Exige movimento claramente horizontal antes de agir
      if (mode === 'open' && dx > 50 && dx > dy * 1.5) {
        mode = null;
        open();
      } else if (mode === 'close' && dx < -50 && -dx > dy * 1.5) {
        mode = null;
        close();
      }
    }, { passive: true });

    document.addEventListener('touchend', () => { mode = null; }, { passive: true });
  }

  function init() {
    window.addEventListener('resize', updateUI);
    updateUI();
    initEdgeSwipe();
  }

  return { open, close, updateUI, init };
})();
