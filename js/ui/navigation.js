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

    const renderer = viewRenderers[viewName];
    if (renderer) renderer();
  }

  /** Re-render every registered view (used after data changes) */
  function renderAll() {
    if (viewRenderers.dashboard) viewRenderers.dashboard();
    if (viewRenderers.tasks) viewRenderers.tasks();
    if (viewRenderers.calendar) viewRenderers.calendar();
    if (viewRenderers.habits) viewRenderers.habits();
  }

  return { register, showView, renderAll };
})();
