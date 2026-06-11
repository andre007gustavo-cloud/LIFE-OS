/**
 * ===================== AREA MODAL =====================
 * Create or edit an Area, with color picker and nested project list.
 */

const AreaModal = (() => {

  function open(areaId) {
    AppState.ui.areaEditId = areaId || null;
    const area = areaId ? AreaService.getById(areaId) : {};

    document.getElementById('area-modal-title').textContent =
      areaId ? 'Editar Área' : 'Nova Área';
    document.getElementById('a-name').value = area.name || '';
    document.getElementById('a-icon').value = area.icon || '📁';

    AppState.ui.areaColorSel = area.color || Constants.COLORS[0];
    renderColorPicker();
    renderProjectFields(area.projects || []);

    Modal.open('area-modal');
  }

  function save() {
    const name = document.getElementById('a-name').value.trim();
    if (!name) return alert('Nome obrigatório');

    const icon = document.getElementById('a-icon').value || '📁';
    const color = AppState.ui.areaColorSel;
    const newProjects = collectNewProjects();

    if (AppState.ui.areaEditId) {
      AreaService.update(AppState.ui.areaEditId, { name, icon, color }, newProjects);
    } else {
      AreaService.create({ name, icon, color, projects: newProjects });
    }

    Modal.close('area-modal');
    refreshDependentViews();
  }

  function remove(id) {
    if (!confirm('Excluir área?')) return;
    AreaService.remove(id);
    refreshDependentViews();
  }

  function selectColor(color) {
    AppState.ui.areaColorSel = color;
    document.querySelectorAll('#color-picker div').forEach(d => {
      d.style.border = d.dataset.color === color
        ? '3px solid #fff' : '3px solid transparent';
    });
  }

  function addProjectField() {
    const container = document.getElementById('proj-fields');
    const row = document.createElement('div');
    row.style = 'display:flex;gap:6px;margin-bottom:6px';
    row.innerHTML = `
      <input class="form-input" style="flex:1" placeholder="Projeto">
      <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">
        <i class="ti ti-x"></i>
      </button>`;
    container.appendChild(row);
  }

  // ===== Internal =====

  function renderColorPicker() {
    document.getElementById('color-picker').innerHTML = Constants.COLORS
      .map(c => `<div onclick="selectColor('${c}')" data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === AppState.ui.areaColorSel ? '#fff' : 'transparent'};transition:border .15s"></div>`)
      .join('');
  }

  function renderProjectFields(projects) {
    document.getElementById('proj-fields').innerHTML = projects.map(p => `
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input class="form-input" value="${Utils.escapeAttr(p.name)}" style="flex:1" placeholder="Projeto">
        <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">
          <i class="ti ti-x"></i>
        </button>
      </div>
    `).join('');
  }

  function collectNewProjects() {
    return [...document.querySelectorAll('#proj-fields input')]
      .map(i => i.value.trim())
      .filter(Boolean)
      .map(name => ({ id: Utils.uid(), name, status: 'ativo', desc: '' }));
  }

  function refreshDependentViews() {
    if (window.AreasView?.render) AreasView.render();
    if (window.TasksView?.renderSidebar) TasksView.renderSidebar();
    if (window.TasksView?.filterAndRender) TasksView.filterAndRender();
  }

  return { open, save, remove, selectColor, addProjectField };
})();
