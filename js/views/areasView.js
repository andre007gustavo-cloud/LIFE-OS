/**
 * ===================== AREAS / PROJECTS VIEW =====================
 * Project workspace with 4 tabs (overview/tasks/notes/files),
 * project list sidebar and area pills filter.
 */

const AreasView = (() => {

  function render() {
    ProjectService.ensureMigrated();
    renderProjectList();
    renderAreaPills();
    if (AppState.ui.activeProjectId) renderWorkspace();
  }

  // ===== Project list (sidebar) =====

  function renderProjectList(query = '') {
    const projects = ProjectService.search(query);
    const list = document.getElementById('proj-list');
    if (!list) return;

    list.innerHTML = projects.length
      ? projects.map(projectItemHtml).join('')
      : '<div class="text-muted" style="padding:14px;text-align:center;font-size:12px">Nenhum projeto</div>';
  }

  function projectItemHtml(project) {
    const taskCount = TaskService.forProject(project.id)
      .filter(t => t.status !== 'concluida').length;
    const isActive = AppState.ui.activeProjectId === project.id;
    const statusColor = project.status === 'concluido' ? 'var(--green)'
      : project.status === 'pausado' ? 'var(--amber)'
      : 'var(--accent2)';

    return `<div class="proj-item${isActive ? ' active' : ''}" onclick="openProject('${project.id}')">
      <div class="proj-item-icon" style="background:${project.color}22;color:${project.color}">${project.icon}</div>
      <div class="proj-item-name">${project.name}</div>
      <div class="proj-status-dot" style="background:${statusColor}"></div>
      ${taskCount ? `<div class="proj-item-count">${taskCount}</div>` : ''}
    </div>`;
  }

  function searchProjects() {
    const q = document.getElementById('proj-search').value;
    renderProjectList(q);
  }

  // ===== Area pills =====

  function renderAreaPills() {
    const container = document.getElementById('area-pill-list');
    if (!container) return;
    container.innerHTML = AreaService.getAll().map(a => `
      <div class="area-pill" onclick="openAreaModal('${a.id}')">
        <div class="area-pill-dot" style="background:${a.color}"></div>
        <span style="flex:1">${a.icon} ${a.name}</span>
      </div>`).join('');
  }

  // ===== Workspace =====

  function openProject(id) {
    AppState.ui.activeProjectId = id;
    AppState.ui.activeProjTab = 'overview';
    renderProjectList();
    renderWorkspace();
  }

  function renderWorkspace() {
    const project = ProjectService.getById(AppState.ui.activeProjectId);
    if (!project) return;

    const area = AreaService.getById(project.area);
    const tasks = TaskService.forProject(project.id);
    const completedTasks = tasks.filter(t => t.status === 'concluida');
    const progress = tasks.length ? Math.round(completedTasks.length / tasks.length * 100) : 0;

    document.getElementById('proj-workspace').innerHTML = `
      <div class="proj-ws-header">
        <div class="proj-ws-title-row">
          <div class="proj-ws-icon" style="background:${project.color}22;color:${project.color}">${project.icon}</div>
          <input class="proj-ws-name" value="${escapeAttr(project.name)}"
                 onblur="pSaveField('name',this.value);renderProjectList()">
          <button class="icon-btn" onclick="openEditProject('${project.id}')" title="Editar"><i class="ti ti-edit"></i></button>
          <button class="icon-btn" onclick="deleteProject('${project.id}')" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
        </div>

        <div class="proj-ws-meta">
          <div class="proj-meta-chip">
            <select onchange="pSaveField('status',this.value);renderProjectList()">
              <option value="ativo"${project.status === 'ativo' ? ' selected' : ''}>● Ativo</option>
              <option value="pausado"${project.status === 'pausado' ? ' selected' : ''}>● Pausado</option>
              <option value="concluido"${project.status === 'concluido' ? ' selected' : ''}>● Concluído</option>
            </select>
          </div>
          ${area ? `<div class="proj-meta-chip" style="background:${area.color}22;color:${area.color};border-color:${area.color}44">${area.icon} ${area.name}</div>` : ''}
          <div class="proj-meta-chip">
            <i class="ti ti-calendar" style="font-size:12px"></i>
            <input type="date" value="${project.deadline || ''}"
                   onchange="pSaveField('deadline',this.value)"
                   style="background:transparent;border:none;color:inherit;font-size:12px;outline:none">
          </div>
          <div class="proj-meta-chip">${tasks.length} tarefas · ${progress}%</div>
        </div>

        <div class="proj-tabs">
          ${['overview', 'tasks', 'notes', 'files'].map(tab => `
            <button class="proj-tab${AppState.ui.activeProjTab === tab ? ' active' : ''}" onclick="setProjTab('${tab}')">
              <i class="ti ti-${tabIcon(tab)}"></i> ${tabLabel(tab)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="proj-tab-content" id="proj-tab-content"></div>`;

    renderTabContent();
  }

  function setProjTab(tab) {
    AppState.ui.activeProjTab = tab;
    renderWorkspace();
  }

  function renderTabContent() {
    const tab = AppState.ui.activeProjTab;
    const project = ProjectService.getById(AppState.ui.activeProjectId);
    if (!project) return;

    if (tab === 'overview') renderOverview(project);
    if (tab === 'tasks') renderTasks(project);
    if (tab === 'notes') renderNotes(project);
    if (tab === 'files') renderFiles(project);
  }

  // ===== Tab renderers =====

  function renderOverview(project) {
    const tasks = TaskService.forProject(project.id);
    const doneTasks = tasks.filter(t => t.status === 'concluida').length;
    const progress = tasks.length ? Math.round(doneTasks / tasks.length * 100) : 0;
    const noteCount = (project.notes || []).length;
    const fileCount = (project.files || []).length;

    document.getElementById('proj-tab-content').innerHTML = `
      <div class="proj-overview-grid">
        <div class="proj-stat-card">
          <div class="proj-stat-val">${tasks.length}</div>
          <div class="proj-stat-label">Tarefas</div>
        </div>
        <div class="proj-stat-card">
          <div class="proj-stat-val">${progress}%</div>
          <div class="proj-stat-label">Progresso</div>
        </div>
        <div class="proj-stat-card">
          <div class="proj-stat-val">${noteCount}</div>
          <div class="proj-stat-label">Notas</div>
        </div>
        <div class="proj-stat-card">
          <div class="proj-stat-val">${fileCount}</div>
          <div class="proj-stat-label">Arquivos</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Descrição</div>
        <textarea class="form-textarea" onblur="pSaveField('desc',this.value)"
                  placeholder="Descreva o projeto, seus objetivos...">${escapeHtml(project.desc || '')}</textarea>
      </div>

      ${tasks.length ? `<div class="card">
        <div class="card-title">Próximas tarefas</div>
        ${tasks.filter(t => t.status !== 'concluida').slice(0, 5).map(miniTaskHtml).join('') || '<div class="text-muted">Sem tarefas pendentes</div>'}
      </div>` : ''}`;
  }

  function renderTasks(project) {
    const tasks = TaskService.forProject(project.id);
    const pending = tasks.filter(t => t.status !== 'concluida');
    const done = tasks.filter(t => t.status === 'concluida');

    document.getElementById('proj-tab-content').innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Pendentes (${pending.length})</span>
          <button class="btn btn-primary btn-sm" onclick="addTaskToProject('${project.id}')">
            <i class="ti ti-plus"></i> Nova
          </button>
        </div>
        ${pending.length ? pending.map(miniTaskHtml).join('') : '<div class="text-muted">Sem pendentes</div>'}
      </div>
      ${done.length ? `<div class="card">
        <div class="card-title">Concluídas (${done.length})</div>
        ${done.map(miniTaskHtml).join('')}
      </div>` : ''}`;
  }

  function renderNotes(project) {
    const notes = project.notes || [];
    document.getElementById('proj-tab-content').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:14px;color:var(--text2)">${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}</div>
        <button class="btn btn-primary btn-sm" onclick="openNote()">
          <i class="ti ti-plus"></i> Nova Nota
        </button>
      </div>
      ${notes.length ? notes.slice().reverse().map(n => {
        const text = Utils.extractHtmlText(n.content).slice(0, 200);
        const imgs = Utils.extractHtmlImages(n.content, 3);
        return `<div class="note-item" onclick="openNote('${n.id}')">
          <div style="display:flex;justify-content:space-between">
            <div style="flex:1">
              <div class="note-item-title">${escapeHtml(n.title)}</div>
              <div class="note-item-preview">${escapeHtml(text)}</div>
              ${imgs.length ? `<div class="note-item-imgs">${imgs.map(s => `<img class="note-item-thumb" src="${s}">`).join('')}</div>` : ''}
              <div class="note-item-date">${Utils.fmtDate(n.updatedAt || n.createdAt)}</div>
            </div>
            <button class="icon-btn" onclick="event.stopPropagation();deleteNote('${n.id}')" style="color:var(--red)">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </div>`;
      }).join('') : '<div class="empty"><i class="ti ti-notes"></i><p>Nenhuma nota ainda</p></div>'}`;
  }

  function renderFiles(project) {
    const files = project.files || [];
    document.getElementById('proj-tab-content').innerHTML = `
      <div class="file-drop-zone" id="file-drop-zone"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="handleFileDrop(event)"
           onclick="document.getElementById('file-input').click()">
        <i class="ti ti-cloud-upload"></i>
        <div>Arraste arquivos aqui ou clique para selecionar</div>
        <input type="file" id="file-input" multiple style="display:none" onchange="handleFileSelect(event)">
      </div>
      ${files.length ? `<div class="file-grid">
        ${files.map(f => `
          <div class="file-card" onclick="openFile('${f.id}')" title="${f.name}">
            <button class="icon-btn file-card-del" onclick="event.stopPropagation();deleteFile('${f.id}')" style="color:var(--red)"><i class="ti ti-x"></i></button>
            ${Utils.getFileType(f.name) === 'image' && f.data
              ? `<img src="${f.data}" style="width:100%;height:60px;object-fit:cover;border-radius:6px;margin-bottom:6px">`
              : `<div class="file-card-icon">${fileIcon(f.name)}</div>`}
            <div class="file-card-name">${f.name}</div>
            <div class="file-card-size">${f.size}</div>
          </div>`).join('')}
      </div>` : '<div class="empty"><i class="ti ti-file"></i><p>Nenhum arquivo</p></div>'}`;
  }

  // ===== Helpers =====

  function miniTaskHtml(task) {
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border)"
                 onclick="ttOpenDetail('${task.id}');showView('tasks')">
      <span>${Constants.PRI_ICONS[task.priority]}</span>
      <span style="flex:1;font-size:13px${task.status === 'concluida' ? ';text-decoration:line-through;color:var(--text3)' : ''}">${task.name}</span>
      ${task.date ? `<span style="font-size:11px;color:var(--text3)">${Utils.fmtDate(task.date)}</span>` : ''}
    </div>`;
  }

  function saveField(field, value) {
    ProjectService.updateField(AppState.ui.activeProjectId, field, value);
  }

  function addTaskToCurrent(projectId) {
    const project = ProjectService.getById(projectId);
    if (!project) return;
    AppState.ui.editTaskId = null;
    TaskModal.open();
    setTimeout(() => {
      document.getElementById('t-area').value = project.area;
      TaskModal.updateProjectSelect();
      setTimeout(() => document.getElementById('t-project').value = project.id, 50);
    }, 100);
  }

  function fileIcon(filename) {
    const type = Utils.getFileType(filename);
    const icons = {
      image: '🖼️', pdf: '📄', doc: '📝',
      text: '📃', video: '🎥', audio: '🎵', other: '📎'
    };
    return icons[type];
  }

  function tabIcon(tab) {
    return { overview: 'layout-dashboard', tasks: 'checklist', notes: 'notes', files: 'file' }[tab];
  }

  function tabLabel(tab) {
    return { overview: 'Visão Geral', tasks: 'Tarefas', notes: 'Notas', files: 'Arquivos' }[tab];
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  return {
    render, renderProjectList, renderAreaPills,
    openProject, renderWorkspace, setProjTab, renderTabContent,
    searchProjects, saveField, addTaskToCurrent
  };
})();
