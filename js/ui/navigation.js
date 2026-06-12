/**
 * ===================== UI: navigation =====================
 * View switching and routing-level concerns.
 */

const Navigation = (() => {

  /** Active view → render function map. Populated by views/*.js on registration. */
  const viewRenderers = {};

  function register(viewName, renderFn) {
    viewRenderers[viewName] = renderFn;
  }

  function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + viewName)?.classList.add('active');
    document.getElementById('nav-' + viewName)?.classList.add('active');

    // Modo Agora esconde a nav e a faixa de próximo compromisso (silêncio visual)
    document.body.classList.toggle('now-mode', viewName === 'now');

    const renderer = viewRenderers[viewName];
    if (renderer) renderer();

    // Mantém a faixa coerente ao entrar/sair de qualquer view (inclui Modo Agora)
    if (typeof NextUpBar !== 'undefined') NextUpBar.render();
  }

  /** Re-render every registered view (used after data changes) */
  function renderAll() {
    if (viewRenderers.dashboard) viewRenderers.dashboard();
    if (viewRenderers.tasks) viewRenderers.tasks();
    if (viewRenderers.calendar) viewRenderers.calendar();
    if (viewRenderers.habits) viewRenderers.habits();
    if (typeof NextUpBar !== 'undefined') NextUpBar.render();
  }

  return { register, showView, renderAll };
})();
