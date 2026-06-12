/**
 * ===================== TASK DETAIL PANEL =====================
 * Painel à direita do TasksView (layout estilo Todoist).
 * Barra de topo: concluir + pílula de data (DatePopover) + prioridade + fechar.
 * Corpo: título editável, anotações ricas (com anexos) e checklist de subtarefas.
 * Rodapé: área/projeto (clicáveis para trocar) + duplicar/excluir.
 */

const TaskDetail = (() => {

  const escapeHtml = Utils.escapeHtml;
  const escapeAttr = Utils.escapeAttr;

  // ===== Open / close =====

  function open(id) {
    AppState.ui.ttDetailId = id;
    document.getElementById('tt-detail-panel').classList.remove('closed');
    render(id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function close() {
    AppState.ui.ttDetailId = null;
    DatePopover.close();
    document.getElementById('tt-detail-panel').classList.add('closed');
    if (window.TasksView) TasksView.filterAndRender();
  }

  // ===== Main render =====

  function render(id) {
    const task = TaskService.getById(id);
    if (!task) return;
    document.getElementById('tt-detail-header').innerHTML = topbarHtml(task);
    document.getElementById('tt-detail-body').innerHTML =
      titleHtml(task) + notesHtml(task) + subtasksHtml(task);
    document.getElementById('tt-detail-foot').innerHTML = footerHtml(task);
    decorateNoteImages();
  }

  function topbarHtml(task) {
    const done = task.status === 'concluida';
    const priColor = Constants.PRI_COLORS[task.priority] || 'var(--text3)';
    const label = Utils.fmtSchedule(task) || 'Definir data';
    return `
      <div class="tt-detail-check${done ? ' checked' : ''}" onclick="ttDetailToggle('${task.id}')">
        ${done ? '<i class="ti ti-check"></i>' : ''}
      </div>
      <button class="tt-sched-pill${task.date ? ' active' : ''}" id="tt-detail-date-btn"
              onclick="ttDetailPickDate('${task.id}')">
        <i class="ti ti-calendar"></i><span>${escapeHtml(label)}</span>
      </button>
      <button class="tt-flag-btn" onclick="ttDetailCyclePri('${task.id}')" title="Prioridade">
        <i class="ti ti-flag" style="color:${priColor}"></i>
      </button>
      <button class="icon-btn" onclick="ttCloseDetail()" title="Fechar"><i class="ti ti-x"></i></button>`;
  }

  function titleHtml(task) {
    return `
      <div class="tt-detail-name" contenteditable="true"
           onblur="ttSaveDetailName('${task.id}',this.innerText)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">${escapeHtml(task.name)}</div>`;
  }

  // ===== Notes (anotações + anexos) =====

  function notesHtml(task) {
    return `
      <div class="task-notes-toolbar">
        <button class="icon-btn" title="Anexar foto ou arquivo"
                onclick="document.getElementById('tt-notes-file').click()">
          <i class="ti ti-paperclip"></i>
        </button>
        <input type="file" id="tt-notes-file" multiple style="display:none" onchange="ttNotesAttach(event)">
      </div>
      <div class="task-notes-editor" id="tt-notes-editor" contenteditable="true"
           data-placeholder="Anotações, links, ideias… arraste arquivos aqui"
           onblur="ttPersistNotes()" onpaste="ttNotesPaste(event)"
           ondragover="event.preventDefault()" ondrop="ttNotesDrop(event)">${task.notes || ''}</div>`;
  }

  /** Salva o HTML limpo (sem os controles de imagem injetados em runtime) */
  function persistNotes() {
    const editor = document.getElementById('tt-notes-editor');
    const id = AppState.ui.ttDetailId;
    if (!editor || !id) return;
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.note-img-wrap').forEach(w => {
      const img = w.querySelector('img');
      if (img) { img.removeAttribute('contenteditable'); w.replaceWith(img); }
      else w.remove();
    });
    TaskService.updateField(id, 'notes', clone.innerHTML.trim());
  }

  /** Envolve cada imagem das notas com botões de baixar/excluir e zoom ao clicar */
  function decorateNoteImages() {
    const editor = document.getElementById('tt-notes-editor');
    if (!editor) return;
    editor.querySelectorAll('img').forEach(img => {
      if (img.closest('.note-img-wrap')) return;
      const wrap = document.createElement('span');
      wrap.className = 'note-img-wrap';
      wrap.contentEditable = 'false';
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      img.addEventListener('click', () => FileHandler.lightbox(img.src, img.alt));
      wrap.appendChild(buildImgTools(wrap, img));
    });
  }

  function buildImgTools(wrap, img) {
    const tools = document.createElement('span');
    tools.className = 'note-img-tools';
    tools.contentEditable = 'false';
    const dl = document.createElement('button');
    dl.innerHTML = '<i class="ti ti-download"></i>';
    dl.title = 'Baixar';
    dl.onclick = e => { e.stopPropagation(); downloadImg(img); };
    const del = document.createElement('button');
    del.innerHTML = '<i class="ti ti-trash"></i>';
    del.title = 'Excluir';
    del.onclick = e => { e.stopPropagation(); wrap.remove(); persistNotes(); };
    tools.appendChild(dl);
    tools.appendChild(del);
    return tools;
  }

  function downloadImg(img) {
    const a = document.createElement('a');
    a.href = img.src;
    a.download = img.alt || 'imagem';
    a.click();
  }

  function notesPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        insertFile(item.getAsFile());
      }
    }
  }

  function notesDrop(e) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    [...e.dataTransfer.files].forEach(insertFile);
  }

  function notesAttach(e) {
    [...e.target.files].forEach(insertFile);
    e.target.value = '';
  }

  /** Lê o arquivo e insere no cursor: imagem inline ou chip de download */
  function insertFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      const html = file.type.startsWith('image/')
        ? `<img src="${ev.target.result}" alt="${escapeAttr(file.name)}">`
        : `<a href="${ev.target.result}" download="${escapeAttr(file.name)}" class="task-file-chip" contenteditable="false"><i class="ti ti-file"></i> ${escapeHtml(file.name)}</a>`;
      insertHtmlAtCursor(html);
      decorateNoteImages();
      persistNotes();
    };
    reader.onerror = () => alert('Erro ao ler o arquivo: ' + file.name);
    reader.readAsDataURL(file);
  }

  function insertHtmlAtCursor(html) {
    const editor = document.getElementById('tt-notes-editor');
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertHTML', false, html);
  }

  // ===== Subtasks (checklist) =====

  function subtasksHtml(task) {
    const subs = task.subtasks || [];
    return `
      <div class="detail-section-title">Checklist (${subs.filter(s => s.done).length}/${subs.length})</div>
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
        <i class="ti ti-plus"></i> Adicionar item
      </div>`;
  }

  // ===== Footer (área / projeto / ações) =====

  function footerHtml(task) {
    const area = AreaService.getById(task.area);
    const areaOpts = `<option value="">📁 Sem área</option>` +
      AreaService.getAll().map(a =>
        `<option value="${a.id}"${a.id === task.area ? ' selected' : ''}>${escapeHtml(a.icon)} ${escapeHtml(a.name)}</option>`).join('');
    const projSel = (area && area.projects.length) ? `
      <select class="tt-foot-select" onchange="ttSaveField('${task.id}','project',this.value)">
        <option value="">Sem projeto</option>
        ${area.projects.map(p =>
          `<option value="${p.id}"${p.id === task.project ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>` : '';
    return `
      <select class="tt-foot-select tt-foot-area" onchange="ttSaveArea('${task.id}',this.value)">${areaOpts}</select>
      ${projSel}
      <span style="flex:1"></span>
      <button class="icon-btn" onclick="ttDupTask('${task.id}')" title="Duplicar"><i class="ti ti-copy"></i></button>
      <button class="icon-btn" onclick="ttDeleteFromDetail('${task.id}')" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>`;
  }

  // ===== Header actions =====

  function toggleStatus(id) {
    TaskService.toggle(id);
    render(id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function cyclePriority(id) {
    TaskService.cyclePriority(id);
    render(id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function pickDate(id) {
    const t = TaskService.getById(id);
    if (!t) return;
    DatePopover.open(
      document.getElementById('tt-detail-date-btn'),
      { date: t.date, dateend: t.dateend, start: t.start, end: t.end, recurrence: t.recurrence },
      result => applySchedule(id, result)
    );
  }

  function applySchedule(id, result) {
    TaskService.update(id, {
      date: result.date, dateend: result.dateend,
      start: result.start, end: result.end, recurrence: result.recurrence
    });
    render(id);
    if (window.TasksView) TasksView.filterAndRender();
  }

  // ===== Field-save helpers =====

  function saveField(taskId, field, value) {
    TaskService.updateField(taskId, field, value);
    if (window.TasksView) TasksView.filterAndRender();
  }

  /** Trocar a área zera o projeto e re-renderiza (atualiza a lista de projetos) */
  function saveArea(taskId, areaId) {
    TaskService.update(taskId, { area: areaId, project: '' });
    render(taskId);
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

  // ===== Subtask handlers =====

  function addSub(taskId) {
    TaskService.addSubtask(taskId);
    open(taskId);
  }

  function toggleSub(taskId, idx) {
    TaskService.toggleSubtask(taskId, idx);
    render(taskId);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function renameSub(taskId, idx, name) {
    TaskService.renameSubtask(taskId, idx, name);
    if (window.TasksView) TasksView.filterAndRender();
  }

  function deleteSub(taskId, idx) {
    TaskService.removeSubtask(taskId, idx);
    render(taskId);
  }

  return {
    open, close, render,
    saveField, saveArea, saveName,
    toggleStatus, cyclePriority, pickDate,
    persistNotes, notesPaste, notesDrop, notesAttach,
    duplicateAndOpen, deleteAndClose,
    addSub, toggleSub, renameSub, deleteSub
  };
})();
