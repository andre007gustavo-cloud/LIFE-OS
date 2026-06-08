/**
 * ===================== IMAGE RESIZE =====================
 * Wraps images in the note editor with resize handles, alignment toolbar,
 * and drag-to-resize. Used exclusively by NoteEditor.
 */

const ImageResize = (() => {

  let currentImg = null;
  let currentWrap = null;
  let activeHandle = null;
  let startX = 0, startY = 0, startW = 0, startH = 0;

  /** Wrap an <img> with resize machinery */
  function makeResizable(img) {
    const wrap = document.createElement('span');
    wrap.className = 'img-resize-wrap';
    wrap.contentEditable = 'false';
    img.parentNode?.insertBefore(wrap, img);
    wrap.appendChild(img);

    wrap.appendChild(buildToolbar());
    buildHandles(wrap, img);

    wrap._deselHandler = e => {
      if (!wrap.contains(e.target)) deselectAll();
    };
    document.addEventListener('click', wrap._deselHandler);

    return wrap;
  }

  function select(wrap, img) {
    deselectAll();
    wrap.classList.add('selected');
    currentImg = img;
    currentWrap = wrap;
  }

  function deselectAll() {
    document.querySelectorAll('.img-resize-wrap.selected')
      .forEach(w => w.classList.remove('selected'));
    currentImg = null;
    currentWrap = null;
  }

  function setPreset(btn, pct) {
    if (!currentImg) return;
    const editor = document.getElementById('note-editor-rich');
    const maxW = editor.offsetWidth - 32;
    const numPct = parseInt(pct);
    currentImg.style.width = Math.round(maxW * numPct / 100) + 'px';
    currentImg.style.height = 'auto';
    btn.closest('.img-resize-toolbar')
      .querySelectorAll('.img-resize-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function align(btn, alignment) {
    if (!currentWrap) return;
    currentWrap.style.display = alignment === 'center' ? 'block' : 'inline-block';
    currentWrap.style.textAlign = '';
    if (alignment === 'center') {
      currentWrap.style.display = 'block';
      currentWrap.style.margin = '8px auto';
      currentWrap.style.cssFloat = 'none';
    } else if (alignment === 'right') {
      currentWrap.style.cssFloat = 'right';
      currentWrap.style.margin = '4px 0 4px 12px';
    } else {
      currentWrap.style.cssFloat = 'none';
      currentWrap.style.margin = '8px 0';
    }
    btn.closest('.img-resize-toolbar')
      .querySelectorAll('[title^="Alinhar"],[title="Centralizar"]')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function removeCurrent() {
    if (currentWrap) {
      currentWrap.remove();
      currentImg = null;
      currentWrap = null;
    }
  }

  /** Insert an image at the cursor position */
  function insertAtCursor(dataUrl, name) {
    const editor = document.getElementById('note-editor-rich');
    editor.focus();
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = name || 'imagem';
    img.style.width = '100%';
    img.style.borderRadius = '8px';

    const wrap = makeResizable(img);
    const br = document.createElement('br');

    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)
          || range.commonAncestorContainer === editor) {
        range.insertNode(br.cloneNode());
        range.insertNode(wrap);
        range.collapse(false);
        select(wrap, img);
        return;
      }
    }
    editor.appendChild(wrap);
    editor.appendChild(br);
    select(wrap, img);
  }

  // ===== Internal: build toolbar and handles =====

  function buildToolbar() {
    const tb = document.createElement('div');
    tb.className = 'img-resize-toolbar';
    tb.innerHTML = `
      <button class="img-resize-btn" onclick="ImageResize.setPreset(this,'25%')" title="25%">25%</button>
      <button class="img-resize-btn" onclick="ImageResize.setPreset(this,'50%')" title="50%">50%</button>
      <button class="img-resize-btn" onclick="ImageResize.setPreset(this,'75%')" title="75%">75%</button>
      <button class="img-resize-btn active" onclick="ImageResize.setPreset(this,'100%')" title="100%">100%</button>
      <span style="width:1px;background:var(--border);margin:0 2px;display:inline-block;height:16px"></span>
      <button class="img-resize-btn" onclick="ImageResize.align(this,'left')" title="Alinhar esquerda"><i class="ti ti-align-left"></i></button>
      <button class="img-resize-btn" onclick="ImageResize.align(this,'center')" title="Centralizar"><i class="ti ti-align-center"></i></button>
      <button class="img-resize-btn" onclick="ImageResize.align(this,'right')" title="Alinhar direita"><i class="ti ti-align-right"></i></button>
      <span style="width:1px;background:var(--border);margin:0 2px;display:inline-block;height:16px"></span>
      <button class="img-resize-btn" onclick="ImageResize.removeCurrent()" title="Remover" style="color:var(--red)"><i class="ti ti-trash"></i></button>`;
    return tb;
  }

  function buildHandles(wrap, img) {
    ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].forEach(pos => {
      const h = document.createElement('div');
      h.className = `resize-handle ${pos}`;
      h.dataset.pos = pos;
      h.addEventListener('mousedown', e => beginResize(e, img, wrap, pos));
      wrap.appendChild(h);
    });
  }

  function beginResize(e, img, wrap, pos) {
    e.preventDefault();
    e.stopPropagation();
    currentImg = img;
    currentWrap = wrap;
    activeHandle = pos;
    startX = e.clientX;
    startY = e.clientY;
    startW = img.offsetWidth;
    startH = img.offsetHeight;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);
  }

  function onResizeMove(e) {
    if (!currentImg || !activeHandle) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = startW;
    let newH = startH;
    const pos = activeHandle;

    if (pos.includes('e')) newW = Math.max(60, startW + dx);
    if (pos.includes('w')) newW = Math.max(60, startW - dx);
    if (pos.includes('s')) newH = Math.max(40, startH + dy);
    if (pos.includes('n')) newH = Math.max(40, startH - dy);

    // Maintain aspect ratio for corner drags
    if (pos.length === 2) {
      const ratio = startW / startH;
      if (Math.abs(dx) > Math.abs(dy)) newH = Math.round(newW / ratio);
      else newW = Math.round(newH * ratio);
    }
    currentImg.style.width = newW + 'px';
    currentImg.style.height = newH + 'px';
  }

  function onResizeUp() {
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
    activeHandle = null;
  }

  return {
    makeResizable, select, deselectAll,
    setPreset, align, removeCurrent,
    insertAtCursor
  };
})();
