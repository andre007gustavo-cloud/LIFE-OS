/**
 * ===================== TASK DETAIL PANEL =====================
 * Right-hand panel that opens when a task is selected in TasksView.
 * Inline-editable name, priority, date, time, recurrence, area, project,
 * tags, subtasks, notes, and an embedded pomodoro timer.
 */

const TaskDetail = (() => {

  // ===== Open / close =====

  function open(id) {
    AppState.ui.ttDetailId = id;
    document.getElementById('tt-detail-panel').classList.remove('closed');
    render(id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function close() {
    AppState.ui.ttDetailId = null;
    document.getElementById('tt-detail-panel').classList.add('closed');
    if (window.TasksView) TasksView.filterAndRender();
  }

  // ===== Main render =====

  function render(id) {
    const task = TaskService.getById(id);
    if (!task) return;

    const area = AreaService.getById(task.area);
    const body = document.getElementById('tt-detail-body');

    body.innerHTML = `
      <div class="tt-detail-name" contenteditable="true"
           onblur="ttSaveDetailName('${task.id}',this.innerText)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">
        ${escapeHtml(task.name)}
      </div>

      ${rowsHtml(task, area)}

      ${subtasksHtml(task)}
      ${tagsHtml(task)}
      ${notesHtml(task)}
      ${pomodoroHtml()}

      <div style="display:flex;gap:6px;margin-top:16px">
        <button class="btn btn-ghost btn-sm" onclick="ttDupTask('${task.id}')">
          <i class="ti ti-copy"></i> Duplicar
        </button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto"
                onclick="ttDeleteFromDetail('${task.id}')">
          <i class="ti ti-trash"></i> Excluir
        </button>
      </div>`;

    PomodoroUI.refresh();
  }

  // ===== Row builders =====

  function rowsHtml(task, area) {
    return `
      <div class="tt-detail-row">
        <i class="ti ti-flag"></i>
        <div class="tt-detail-row-label">Prioridade</div>
        <select onchange="ttSaveField('${task.id}','priority',this.value)">
          ${['nenhuma','alta','media','baixa'].map(p =>
            `<option value="${p}"${task.priority === p ? ' selected' : ''}>${Constants.PRI_ICONS[p]} ${p}</option>`
          ).join('')}
        </select>
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-calendar"></i>
        <div class="tt-detail-row-label">Data</div>
        <input type="date" value="${task.date || ''}"
               onchange="ttSaveField('${task.id}','date',this.value)">
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-calendar-event"></i>
        <div class="tt-detail-row-label">Data fim</div>
        <input type="date" value="${task.dateend || ''}"
               onchange="ttSaveField('${task.id}','dateend',this.value)">
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-clock"></i>
        <div class="tt-detail-row-label">Horário</div>
        <input type="time" value="${task.start || ''}"
               onchange="ttSaveField('${task.id}','start',this.value)" style="flex:1">
        <span style="color:var(--text3)">→</span>
        <input type="time" value="${task.end || ''}"
               onchange="ttSaveField('${task.id}','end',this.value)" style="flex:1">
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-refresh"></i>
        <div class="tt-detail-row-label">Recorrência</div>
        <select class="rec-select"
                onchange="ttSaveField('${task.id}','recurrence',this.value)">
          <option value="">Nenhuma</option>
          <option value="daily"${task.recurrence === 'daily' ? ' selected' : ''}>Diária</option>
          <option value="weekly"${task.recurrence === 'weekly' ? ' selected' : ''}>Semanal</option>
          <option value="monthly"${task.recurrence === 'monthly' ? ' selected' : ''}>Mensal</option>
        </select>
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-hourglass"></i>
        <div class="tt-detail-row-label">Estimativa</div>
        <input type="text" placeholder="ex: 30min, 2h"
               value="${task.estimate || ''}"
               onchange="ttSaveField('${task.id}','estimate',this.value)">
      </div>

      <div class="tt-detail-row">
        <i class="ti ti-folder"></i>
        <div class="tt-detail-row-label">Área</div>
        <select onchange="ttSaveField('${task.id}','area',this.value);ttOpenDetail('${task.id}')">
          <option value="">Nenhuma</option>
          ${AreaService.getAll().map(a =>
            `<option value="${a.id}"${a.id === task.area ? ' selected' : ''}>${a.icon} ${a.name}</option>`
          ).join('')}
        </select>
      </div>

      ${area ? `
        <div class="tt-detail-row">
          <i class="ti ti-briefcase"></i>
          <div class="tt-detail-row-label">Projeto</div>
          <select onchange="ttSaveField('${task.id}','project',this.value)">
            <option value="">Nenhum</option>
            ${area.projects.map(p =>
              `<option value="${p.id}"${p.id === task.project ? ' selected' : ''}>${p.name}</option>`
            ).join('')}
          </select>
        </div>` : ''}
    `;
  }

  function subtasksHtml(task) {
    const subs = task.subtasks || [];
    return `
      <div class="detail-section-title">Subtarefas (${subs.filter(s => s.done).length}/${subs.length})</div>
      ${subs.map((s, i) => `
        <div class="subtask-item">
          <div class="subtask-check${s.done ? ' done' : ''}" onclick="ttToggleSub('${task.id}',${i})">
            ${s.done ? '<i class="ti ti-check" style="font-size:10px;color:#fff"></i>' : ''}
          </div>
          <input class="subtask-name${s.done ? ' done-sub' : ''}"
                 value="${escapeAttr(s.name)}"
                 onchange="ttRenameSub('${task.id}',${i},this.value)">
          <button class="icon-btn subtask-del" onclick="ttDeleteSub('${task.id}',${i})"
                  style="color:var(--red)">
            <i class="ti ti-x" style="font-size:13px"></i>
          </button>
        </div>
      `).join('')}
      <div class="subtask-add" onclick="ttAddSub('${task.id}')">
        <i class="ti ti-plus"></i> Adicionar subtarefa
      </div>
    `;
  }

  function tagsHtml(task) {
    return `
      <div class="detail-section-title">Tags</div>
      <div class="tag-input-wrap">
        ${(task.tags || []).map((tag, i) => `
          <span class="tag-item">
            #${escapeHtml(tag)}
            <button onclick="ttRemoveTag('${task.id}',${i})">×</button>
          </span>
        `).join('')}
        <input class="tag-new-input" placeholder="+ tag"
               onkeydown="ttTagKey(event,'${task.id}')">
      </div>
    `;
  }

  function notesHtml(task) {
    return `
      <div class="detail-section-title">Notas</div>
      <textarea class="detail-notes" placeholder="Adicione notas, links, ideias..."
                onblur="ttSaveField('${task.id}','notes',this.value)">${escapeHtml(task.notes || '')}</textarea>
    `;
  }

  function pomodoroHtml() {
    return `
      <div class="pomo-bar">
        <div class="pomo-title">
          <i class="ti ti-flame" style="color:var(--accent2)"></i> Pomodoro
        </div>
        <div class="pomo-mode" id="pomo-mode-row"></div>
        <div class="pomo-display" id="pomo-display">25:00</div>
        <div class="pomo-controls">
          <button class="pomo-btn pomo-start" id="pomo-toggle" onclick="pomoToggle()">
            <i class="ti ti-player-play"></i> Iniciar
          </button>
          <button class="pomo-btn pomo-stop" onclick="pomoReset()">
            <i class="ti ti-refresh"></i> Reset
          </button>
        </div>
        <div class="pomo-dots" id="pomo-dots"></div>
      </div>
    `;
  }

  // ===== Field-save helpers =====

  function saveField(taskId, field, value) {
    TaskService.updateField(taskId, field, value);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function saveName(taskId, name) {
    TaskService.updateField(taskId, 'name', name.trim());
    if (window.TasksView) TasksView.filterAndRender();
  }

  function duplicateAndOpen(taskId) {
    const copy = TaskService.duplicate(taskId);
    if (copy) open(copy.id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function deleteAndClose(taskId) {
    if (!confirm('Excluir esta tarefa?')) return;
    TaskService.remove(taskId);
    close();
    if (window.TasksView) TasksView.filterAndRender();
  }

  // ===== Subtask / tag handlers =====

  function tagKeyHandler(event, taskId) {
    if (event.key !== 'Enter') return;
    const value = event.target.value.trim().replace(/^#/, '');
    if (!value) return;
    TaskService.addTag(taskId, value);
    open(taskId);
  }

  function removeTag(taskId, idx) {
    TaskService.removeTag(taskId, idx);
    open(taskId);
  }

  function addSub(taskId) {
    TaskService.addSubtask(taskId);
    open(taskId);
  }

  function toggleSub(taskId, idx) {
    TaskService.toggleSubtask(taskId, idx);
    open(taskId);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function renameSub(taskId, idx, name) {
    TaskService.renameSubtask(taskId, idx, name);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function deleteSub(taskId, idx) {
    TaskService.removeSubtask(taskId, idx);
    open(taskId);
  }

  // ===== Utilities =====

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  return {
    open, close, render,
    saveField, saveName,
    duplicateAndOpen, deleteAndClose,
    tagKeyHandler, removeTag,
    addSub, toggleSub, renameSub, deleteSub
  };
})();
