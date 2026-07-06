/**
 * ===================== NOTE EDITOR =====================
 * Rich-text editor for project notes.
 * Supports headings, lists, blockquotes, inline images with resize, paste/drop.
 *
 * Imagens: comprimidas e gravadas em docs próprios do Firestore
 * (users/{uid}/noteImages/{id}). A nota guarda só `<img data-image-id="{id}">`.
 * Ao abrir, um hidratador busca cada doc e injeta o `src` (base64). Ao salvar,
 * o `src` é removido do HTML persistido — só o `data-image-id` fica.
 */

const NoteEditor = (() => {

  async function open(noteId) {
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

    hydrateImages(editor);
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

    const editor = document.getElementById('note-editor-rich');
    if (editor.querySelector('img[data-pending="1"]')) {
      alert('Aguarde as imagens terminarem de subir…');
      return;
    }

    const title = document.getElementById('note-title-input').value.trim();
    const content = _serializeContent(editor);
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

    ImageService.removeMany(ImageService.diffRemovedIds(oldContent, content));

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
      const id = await ImageService.uploadImage(dataUrl);
      // Se o usuário já apagou a imagem enquanto subia, o img saiu do DOM.
      if (!editor.contains(img)) return ImageService.removeById(id);
      img.dataset.imageId = id;
      delete img.dataset.pending;
      img.style.opacity = '';
    } catch (err) {
      console.error('[NoteEditor] upload falhou:', err);
      alert('Falha ao salvar imagem "' + name + '": ' + (err.message || err.code || err));
      img.remove();
    }
  }

  /** When opening a saved note, wrap existing <img> tags with resize handles */
  function attachResizeToExistingImages(editor) {
    editor.querySelectorAll('img:not(.img-resize-wrap img)').forEach(img => {
      if (!img.closest('.img-resize-wrap')) ImageResize.makeResizable(img);
    });
  }

  /** Busca cada imagem referenciada por data-image-id e injeta o src (base64). */
  async function hydrateImages(editor) {
    const imgs = [...editor.querySelectorAll('img[data-image-id]')];
    await Promise.all(imgs.map(async img => {
      if (img.src && !img.src.startsWith('http')) return; // já hidratada / inline
      const id = img.dataset.imageId;
      img.style.opacity = '0.55';
      const dataUrl = await ImageService.fetchImage(id);
      if (dataUrl) {
        img.src = dataUrl;
        img.style.opacity = '';
      } else {
        img.alt = '⚠ imagem não encontrada';
        img.style.opacity = '';
      }
    }));
  }

  /**
   * Prepara o HTML para persistir: tira o `src` das imagens que têm ID
   * (o base64 vive no Firestore, não no doc principal). Imagens sem ID
   * (legado ou pendentes) ficam como estão — para pendentes o save() já
   * bloqueou antes.
   */
  function _serializeContent(editor) {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('img[data-image-id]').forEach(img => img.removeAttribute('src'));
    return clone.innerHTML.trim();
  }

  return {
    open, close, handleOverlayClick, save, remove, cmd,
    insertFromFiles, handlePaste, handleDrop
  };
})();
