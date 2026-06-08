/**
 * ===================== NOTE EDITOR =====================
 * Rich-text editor for project notes.
 * Supports headings, lists, blockquotes, inline images with resize, paste/drop.
 */

const NoteEditor = (() => {

  function open(noteId) {
    AppState.ui.editNoteId = noteId;
    const projectId = AppState.ui.activeProjectId;
    const note = noteId ? ProjectService.getNote(projectId, noteId) : null;

    document.getElementById('note-title-input').value = note?.title || '';
    const editor = document.getElementById('note-editor-rich');
    editor.innerHTML = note?.content || '';

    document.getElementById('note-overlay').classList.add('open');

    setTimeout(() => {
      attachResizeToExistingImages(editor);
      document.getElementById('note-title-input').focus();
    }, 120);
  }

  function close() {
    document.getElementById('note-overlay').classList.remove('open');
  }

  function handleOverlayClick(e) {
    if (e.target === document.getElementById('note-overlay')) close();
  }

  function save() {
    const projectId = AppState.ui.activeProjectId;
    const project = ProjectService.getById(projectId);
    if (!project) return;

    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-editor-rich').innerHTML.trim();
    const textOnly = document.getElementById('note-editor-rich').innerText.trim();

    if (!title && !textOnly) return close();

    if (AppState.ui.editNoteId) {
      ProjectService.updateNote(projectId, AppState.ui.editNoteId, { title, content });
    } else {
      ProjectService.addNote(projectId, { title, content });
    }

    close();
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function remove(noteId) {
    if (!confirm('Excluir nota?')) return;
    ProjectService.removeNote(AppState.ui.activeProjectId, noteId);
    if (window.AreasView?.renderTabContent) AreasView.renderTabContent();
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function cmd(command, value) {
    document.getElementById('note-editor-rich').focus();
    document.execCommand(command, false, value || null);
  }

  // ===== Image handling =====

  function insertFromFiles(e) {
    const files = [...e.target.files];
    files.forEach(file => readAndInsert(file));
    e.target.value = '';
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        readAndInsert(file, 'imagem colada');
      }
    }
  }

  function handleDrop(e) {
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(f => readAndInsert(f));
  }

  // ===== Internal =====

  function readAndInsert(file, fallbackName) {
    const reader = new FileReader();
    reader.onload = ev => ImageResize.insertAtCursor(ev.target.result, fallbackName || file.name);
    reader.readAsDataURL(file);
  }

  /** When opening a saved note, wrap existing <img> tags with resize handles */
  function attachResizeToExistingImages(editor) {
    editor.querySelectorAll('img:not(.img-resize-wrap img)').forEach(img => {
      if (!img.closest('.img-resize-wrap')) ImageResize.makeResizable(img);
    });
  }

  return {
    open, close, handleOverlayClick, save, remove, cmd,
    insertFromFiles, handlePaste, handleDrop
  };
})();
