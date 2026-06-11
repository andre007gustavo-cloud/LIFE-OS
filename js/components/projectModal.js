/**
 * ===================== PROJECT MODAL =====================
 * Modal for creating or editing a top-level project (with icon/color/area/etc).
 */

const ProjectModal = (() => {

  function open(projectId) {
    AppState.ui.editProjectId = projectId || null;
    AppState.ui.npColorSel = Constants.COLORS[0];

    const project = projectId ? ProjectService.getById(projectId) : {};

    document.getElementById('new-proj-modal-title').textContent =
      projectId ? 'Editar Projeto' : 'Novo Projeto';
    document.getElementById('np-name').value = project.name || '';
    document.getElementById('np-icon').value = project.icon || '📁';
    document.getElementById('np-status').value = project.status || 'ativo';
    document.getElementById('np-deadline').value = project.deadline || '';
    document.getElementById('np-desc').value = project.desc || '';

    if (projectId && project.color) AppState.ui.npColorSel = project.color;

    populateAreaSelect(project.area || '');
    renderColorPicker();

    Modal.open('new-proj-modal');
  }

  function save() {
    const name = document.getElementById('np-name').value.trim();
    if (!name) return alert('Nome obrigatório');

    const projectData = {
      id: AppState.ui.editProjectId,
      name,
      icon: document.getElementById('np-icon').value || '📁',
      color: AppState.ui.npColorSel,
      area: document.getElementById('np-area').value,
      status: document.getElementById('np-status').value,
      deadline: document.getElementById('np-deadline').value,
      desc: document.getElementById('np-desc').value
    };

    const isEdit = !!AppState.ui.editProjectId;
    const project = ProjectService.save(projectData, isEdit);

    Modal.close('new-proj-modal');
    refreshDependentViews();

    if (isEdit && AppState.ui.editProjectId === AppState.ui.activeProjectId
        || !isEdit) {
      AppState.ui.activeProjectId = project.id;
      if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
    }
  }

  function remove(id) {
    if (!confirm('Excluir projeto? As tarefas vinculadas perderão o projeto.')) return;
    ProjectService.remove(id);
    if (AppState.ui.activeProjectId === id) {
      AppState.ui.activeProjectId = null;
      const ws = document.getElementById('proj-workspace');
      if (ws) {
        ws.innerHTML = `<div class="proj-empty-state">
          <i class="ti ti-briefcase" style="font-size:48px;color:var(--text3);display:block;margin-bottom:12px"></i>
          <div style="font-size:16px;font-weight:600;color:var(--text2)">Selecione um projeto</div>
        </div>`;
      }
    }
    refreshDependentViews();
  }

  function selectColor(color) {
    AppState.ui.npColorSel = color;
    document.querySelectorAll('#np-color-picker div').forEach(d => {
      d.style.border = d.dataset.color === color
        ? '3px solid #fff' : '3px solid transparent';
    });
  }

  // ===== Internal =====

  function populateAreaSelect(selected) {
    document.getElementById('np-area').innerHTML =
      '<option value="">Nenhuma</option>' +
      AreaService.getAll()
        .map(a => `<option value="${a.id}"${a.id === selected ? ' selected' : ''}>${Utils.escapeHtml(a.icon)} ${Utils.escapeHtml(a.name)}</option>`)
        .join('');
  }

  function renderColorPicker() {
    document.getElementById('np-color-picker').innerHTML = Constants.COLORS
      .map(c => `<div onclick="npSelectColor('${c}')" id="npc-${c.replace('#', '')}" data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === AppState.ui.npColorSel ? '#fff' : 'transparent'};transition:border .15s"></div>`)
      .join('');
  }

  function refreshDependentViews() {
    if (window.AreasView?.renderProjectList) AreasView.renderProjectList();
    if (window.AreasView?.renderAreaPills) AreasView.renderAreaPills();
    if (window.TasksView?.renderSidebar) TasksView.renderSidebar();
  }

  return { open, save, remove, selectColor };
})();
