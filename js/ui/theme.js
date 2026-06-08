/**
 * ===================== UI: theme =====================
 * Dark/light mode toggle with persistence.
 */

const Theme = (() => {

  function init() {
    const saved = Storage.loadTheme();
    if (saved === 'light') applyLight();
  }

  function toggle() {
    const isLight = document.body.classList.toggle('light');
    setIcon(isLight);
    Storage.saveTheme(isLight ? 'light' : 'dark');
  }

  function applyLight() {
    document.body.classList.add('light');
    setIcon(true);
  }

  function setIcon(isLight) {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = isLight ? 'ti ti-moon' : 'ti ti-sun';
  }

  return { init, toggle };
})();
