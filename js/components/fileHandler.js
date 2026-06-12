/**
 * ===================== FILE HANDLER =====================
 * Upload, download and preview files attached to a project.
 * Supports drag-drop, lightbox for images, in-tab preview for PDF/video/audio.
 */

const FileHandler = (() => {

  function handleSelect(e) {
    processFiles([...e.target.files]);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    document.getElementById('file-drop-zone')?.classList.remove('drag-over');
    processFiles([...e.dataTransfer.files]);
  }

  function processFiles(files) {
    const projectId = AppState.ui.activeProjectId;
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => {
        ProjectService.addFile(projectId, {
          name: f.name,
          size: Utils.formatFileSize(f.size),
          type: f.type,
          dataUrl: ev.target.result
        });
        if (window.AreasView?.renderTabContent) AreasView.renderTabContent();
      };
      reader.onerror = () => alert('Erro ao ler o arquivo: ' + f.name);
      reader.readAsDataURL(f);
    });
  }

  function remove(fileId) {
    if (!confirm('Remover arquivo?')) return;
    ProjectService.removeFile(AppState.ui.activeProjectId, fileId);
    if (window.AreasView?.renderTabContent) AreasView.renderTabContent();
  }

  function open(fileId) {
    const file = ProjectService.getFile(AppState.ui.activeProjectId, fileId);
    if (!file) return;
    const type = Utils.getFileType(file.name);

    if (type === 'image') lightbox(file.data, file.name);
    else if (['pdf', 'text', 'video', 'audio'].includes(type)) openInNewTab(file, type);
    else download(fileId);
  }

  function download(fileId) {
    const file = ProjectService.getFile(AppState.ui.activeProjectId, fileId);
    if (!file) return;
    const a = document.createElement('a');
    a.href = file.data;
    a.download = file.name;
    a.click();
  }

  // ===== Internal: preview implementations =====

  /** Visualização ampliada de uma imagem (data URL ou URL). Reusável. */
  function lightbox(src, name) {
    name = name || 'imagem';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000000cc;z-index:1000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    overlay.onclick = () => overlay.remove();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;max-width:92vw;max-height:92vh';

    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:100%;max-height:88vh;border-radius:10px;display:block';

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 4px';
    bar.innerHTML = `
      <span style="color:#fff;font-size:13px">${Utils.escapeHtml(name)}</span>
      <a href="${Utils.escapeAttr(src)}" download="${Utils.escapeAttr(name)}"
         style="color:#fff;background:#ffffff22;border-radius:6px;padding:5px 12px;font-size:12px;text-decoration:none;display:flex;align-items:center;gap:4px"
         onclick="event.stopPropagation()">
        <i class="ti ti-download"></i> Baixar
      </a>`;

    wrap.appendChild(img);
    wrap.appendChild(bar);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  function openInNewTab(file, type) {
    const win = window.open();
    if (!win) return;
    const src = Utils.escapeAttr(file.data);
    if (type === 'pdf' || type === 'text') {
      win.document.write(`<html><body style="margin:0;background:#111"><iframe src="${src}" style="width:100%;height:100vh;border:none"></iframe></body></html>`);
    } else if (type === 'video') {
      win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh"><video controls autoplay src="${src}" style="max-width:100%;max-height:100vh"></video></body></html>`);
    } else if (type === 'audio') {
      win.document.write(`<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px"><p style="color:#fff;font-family:sans-serif">${Utils.escapeHtml(file.name)}</p><audio controls autoplay src="${src}"></audio></body></html>`);
    }
  }

  return { handleSelect, handleDrop, remove, open, download, lightbox };
})();
