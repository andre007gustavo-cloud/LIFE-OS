/**
 * ===================== NOTE EDITOR =====================
 * Rich-text editor for project notes.
 * Supports headings, lists, blockquotes, inline images with resize, paste/drop.
 *
 * Imagens: comprimidas e enviadas pro Firebase Storage; a nota só guarda a URL.
 * Enquanto o upload roda, o próprio data URL comprimido serve de placeholder
 * (img.dataset.pending='1'). Save aguarda uploads pendentes; excluir/remover
 * imagens dispara delete no Storage para não deixar órfãos.
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

  async function save() {
    const projectId = AppState.ui.activeProjectId;
    const project = ProjectService.getById(projectId);
    if (!project) return;

    const editor = document.getElementById('note-editor-rich');
    if (editor.querySelector('img[data-pending="1"]')) {
      alert('Aguarde as imagens terminarem de subir…');
      return;
    }

    const title = document.getElementById('note-title-input').value.trim();
    const content = editor.innerHTML.trim();
    const textOnly = editor.innerText.trim();

    if (!title && !textOnly) return close();

    const noteId = AppState.ui.editNoteId;
    const oldContent = noteId
      ? (ProjectService.getNote(projectId, noteId)?.content || '')
      : '';

    if (noteId) {
      ProjectService.updateNote(projectId, noteId, { title, content });
    } else {
      ProjectService.addNote(projectId, { title, content });
    }

    ImageService.removeMany(ImageService.diffRemovedUrls(oldContent, content));

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

  async function readAndInsert(file, fallbackName) {
    const name = fallbackName || file.name;
    let dataUrl;
    try {
      dataUrl = await Utils.compressImage(file);
    } catch (err) {
      return alert('Erro ao ler a imagem: ' + name + ' — ' + err.message);
    }
    // Mostra a imagem comprimida imediatamente e captura o <img> recém-inserido
    // (varre de trás pra frente porque acabou de ser adicionada no cursor).
    ImageResize.insertAtCursor(dataUrl, name);
    const editor = document.getElementById('note-editor-rich');
    const img = [...editor.querySelectorAll('img')].reverse().find(i => i.src === dataUrl);
    if (!img) return;
    img.dataset.pending = '1';
    img.style.opacity = '0.55';

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const url = await ImageService.uploadNoteImage(blob);
      // Se o usuário já apagou a imagem enquanto subia, o img saiu do DOM.
      if (!editor.contains(img)) return ImageService.removeByUrl(url);
      img.src = url;
      delete img.dataset.pending;
      img.style.opacity = '';
    } catch (err) {
      console.error('[NoteEditor] upload falhou:', err);
      alert('Falha ao enviar imagem "' + name + '": ' + (err.message || err.code || err));
      img.remove();
    }
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
