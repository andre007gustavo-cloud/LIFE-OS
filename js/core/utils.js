/**
 * ===================== UTILS =====================
 * Pure, side-effect-free helper functions.
 * No state, no DOM, no storage. Can be tested in isolation.
 */

const Utils = (() => {

  // ===== ID generation =====

  function uid() {
    // crypto.randomUUID evita colisão de IDs; fallback para browsers antigos
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substr(2, 9);
  }

  // ===== Date helpers (ISO format YYYY-MM-DD) =====
  // Sempre em horário LOCAL: toISOString()/new Date("YYYY-MM-DD") usam UTC
  // e deslocam o dia (ex.: às 21h em UTC-3, o "hoje" UTC já é amanhã).

  /** Date → "YYYY-MM-DD" usando o fuso local */
  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** "YYYY-MM-DD" → Date à meia-noite local */
  function parseISO(dateStr) {
    return new Date(dateStr + 'T00:00:00');
  }

  function today() {
    return toISO(new Date());
  }

  function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISO(d);
  }

  function addDays(dateStr, days) {
    const d = parseISO(dateStr);
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function daysBetween(d1, d2) {
    return Math.round((parseISO(d2) - parseISO(d1)) / 86400000) + 1;
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [_, m, dy] = dateStr.split('-');
    return `${dy}/${m}`;
  }

  function timeToMins(timeStr) {
    return timeStr.split(':').reduce((acc, n) => acc * 60 + parseInt(n), 0);
  }

  // ===== Money formatting =====

  function fmtMoney(v) {
    return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ===== Task helpers =====

  /** Returns true if a task occupies the given ISO date (handles multi-day tasks) */
  function taskCoversDay(task, isoDate) {
    if (!task.date) return false;
    if (!task.dateend || task.dateend === task.date) return task.date === isoDate;
    return isoDate >= task.date && isoDate <= task.dateend;
  }

  // ===== File helpers =====

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  function getFileType(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (['txt', 'md'].includes(ext)) return 'text';
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'other';
  }

  // ===== Viewport =====

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ===== Pomodoro formatting =====

  function formatPomodoroTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ===== HTML helpers =====

  /** Escapa conteúdo do usuário antes de interpolar em innerHTML */
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Escapa para uso dentro de atributos HTML (value="...", title="...") */
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  /** Extract plain text from HTML string (for previews) */
  function extractHtmlText(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.innerText || d.textContent || '';
  }

  /** Extract image sources from HTML string (limit to N) */
  function extractHtmlImages(html, limit = 3) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return [...d.querySelectorAll('img')].map(i => i.src).slice(0, limit);
  }

  return {
    uid,
    toISO,
    parseISO,
    today,
    tomorrow,
    addDays,
    daysBetween,
    fmtDate,
    timeToMins,
    fmtMoney,
    taskCoversDay,
    formatFileSize,
    getFileType,
    isMobile,
    formatPomodoroTime,
    escapeHtml,
    escapeAttr,
    extractHtmlText,
    extractHtmlImages
  };
})();
