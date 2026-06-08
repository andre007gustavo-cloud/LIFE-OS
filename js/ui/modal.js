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

  return { open, close, wireBackdropClicks };
})();
