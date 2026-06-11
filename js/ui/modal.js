/**
 * ===================== UI: modals =====================
 * Generic open/close for any overlay modal by id.
 */

const Modal = (() => {

  function open(id) {
    document.getElementById(id)?.classList.add('open');
  }

  function close(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  /** Wire backdrop click to close (called once on boot) */
  function wireBackdropClicks() {
    document.addEventListener('click', e => {
      if (e.target.classList?.contains('overlay')) {
        e.target.classList.remove('open');
      }
    });
  }

  /** Toast discreto de confirmação (some sozinho) */
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'app-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  return { open, close, wireBackdropClicks, toast };
})();
