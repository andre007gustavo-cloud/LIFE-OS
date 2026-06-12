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

  /** "12 jun" — dia + mês abreviado (pt-BR) a partir de ISO */
  function fmtDayMonth(dateStr) {
    return parseISO(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  }

  /**
   * Rótulo de agenda de uma tarefa: "Hoje", "Amanhã", "12 jun",
   * "12 jun → 15 jun" (multi-dia) ou "Hoje, 15:00 - 16:00" (com horário).
   * Recebe um objeto com { date, dateend, start, end }. Vazio se não tiver data.
   */
  function fmtSchedule(s) {
    if (!s || !s.date) return '';
    if (s.dateend && s.dateend !== s.date) {
      return fmtDayMonth(s.date) + ' → ' + fmtDayMonth(s.dateend);
    }
    let label = s.date === today() ? 'Hoje' : s.date === tomorrow() ? 'Amanhã' : fmtDayMonth(s.date);
    if (s.start) label += ', ' + s.start + (s.end ? ' - ' + s.end : '');
    return label;
  }

  /** Diferença em dias entre duas datas ISO (d2 - d1), sem o +1 de daysBetween */
  function diffDays(d1, d2) {
    return Math.round((parseISO(d2) - parseISO(d1)) / 86400000);
  }

  /** Segunda-feira (início da semana) da semana que contém a data ISO */
  function startOfWeek(dateStr) {
    const offset = (parseISO(dateStr).getDay() + 6) % 7; // 0=seg ... 6=dom
    return addDays(dateStr, -offset);
  }

  function timeToMins(timeStr) {
    return timeStr.split(':').reduce((acc, n) => acc * 60 + parseInt(n), 0);
  }

  /** "47 min", "2h12", "1h", "3h05" — duração curta legível a partir de minutos */
  function fmtMinsShort(mins) {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  /**
   * Tempo relativo legível (pt-BR) a partir de um delta em ms.
   * Positivo (futuro) → "em X"; negativo (passado) → "atrasado Y";
   * |delta| < 1 min → "começando agora".
   */
  function humanDuration(ms) {
    if (Math.abs(ms) < 60000) return 'começando agora';
    const label = fmtMinsShort(Math.round(Math.abs(ms) / 60000));
    return ms > 0 ? `em ${label}` : `atrasado ${label}`;
  }

  // ===== Money formatting =====

  function fmtMoney(v) {
    return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ===== Task helpers =====

  /** Tarefa "em aberto": não concluída e não arquivada (descartada) */
  function isTaskOpen(task) {
    return task.status !== 'concluida' && task.status !== 'descartada';
  }

  /** Returns true if a task occupies the given ISO date (handles multi-day tasks) */
  function taskCoversDay(task, isoDate) {
    if (!task.date) return false;
    if (!task.dateend || task.dateend === task.date) return task.date === isoDate;
    return isoDate >= task.date && isoDate <= task.dateend;
  }

  /**
   * Projeção de recorrência: a tarefa pendente "cai" neste dia FUTURO?
   * Usada pelo calendário para mostrar as próximas ocorrências (ex.: toda
   * quinta) sem criar tarefas reais. Multi-dia não é projetada (só o span real).
   */
  function taskRecursOnDay(task, isoDate) {
    if (!task.recurrence || !task.date) return false;
    if (!isTaskOpen(task)) return false;
    if (task.dateend && task.dateend !== task.date) return false;
    if (isoDate <= task.date) return false; // o próprio dia já vem de taskCoversDay
    if (task.recurrence === 'daily') return true;
    const start = parseISO(task.date);
    const day = parseISO(isoDate);
    if (task.recurrence === 'weekly') return start.getDay() === day.getDay();
    if (task.recurrence === 'monthly') return start.getDate() === day.getDate();
    return false;
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
    diffDays,
    startOfWeek,
    fmtDate,
    fmtDayMonth,
    fmtSchedule,
    timeToMins,
    fmtMinsShort,
    humanDuration,
    fmtMoney,
    isTaskOpen,
    taskCoversDay,
    taskRecursOnDay,
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
