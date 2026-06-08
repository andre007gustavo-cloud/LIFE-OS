/**
 * ===================== UI: mobile sidebar =====================
 * Sliding drawer for the task sidebar on mobile screens.
 */

const MobileSidebar = (() => {

  function open() {
    if (!Utils.isMobile()) return;
    const panel = document.getElementById('mobile-sidebar-panel');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const sidebar = document.querySelector('.tt-sidebar');
    if (!panel || !sidebar) return;

    panel.innerHTML = '';
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
    setTimeout(() => panel.style.display = 'none', 260);
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
    clone.querySelectorAll('[onclick]').forEach(el => {
      const handler = el.getAttribute('onclick');
      el.addEventListener('click', () => {
        // eslint-disable-next-line no-eval
        eval(handler);
        close();
      });
      el.removeAttribute('onclick');
    });
    return clone;
  }

  function init() {
    window.addEventListener('resize', updateUI);
    updateUI();
  }

  return { open, close, updateUI, init };
})();
