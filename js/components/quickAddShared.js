/**
 * ===================== QUICK ADD SHARED =====================
 * Lógica compartilhada entre os pontos de criação rápida de tarefa:
 * o quick-add inline (Tarefas), o QuickAddPopover e o campo do calendário.
 * Consome o QuickParser; não duplica a montagem dos chips nem o debounce.
 */

const QuickAddShared = (() => {

  const escapeHtml = Utils.escapeHtml;

  /** Chips de preview ao vivo a partir do resultado do QuickParser */
  function buildPreviewChips(parsed) {
    const chips = [];
    if (parsed.date) {
      const dow = Constants.CALENDAR.WEEK_DAY_NAMES_FULL[Utils.parseISO(parsed.date).getDay()].toLowerCase();
      chips.push(`<span class="ttq-chip">📅 ${dow} ${Utils.fmtDate(parsed.date)}</span>`);
    }
    if (parsed.time) {
      chips.push(`<span class="ttq-chip">⏰ ${parsed.time}${parsed.timeend ? '–' + parsed.timeend : ''}</span>`);
    }
    if (parsed.recurrence) {
      const labels = { daily: 'diária', weekly: 'semanal', monthly: 'mensal' };
      chips.push(`<span class="ttq-chip">🔁 ${labels[parsed.recurrence]}</span>`);
    }
    if (parsed.priority) {
      chips.push(`<span class="ttq-chip">${Constants.PRI_ICONS[parsed.priority]} ${parsed.priority}</span>`);
    }
    const area = parsed.areaId && AreaService.getById(parsed.areaId);
    if (area) {
      chips.push(`<span class="ttq-chip">${escapeHtml(area.icon)} ${escapeHtml(area.name)}</span>`);
    }
    return chips;
  }

  /** Debounce simples para o parse ao vivo (chips/campos respondem em ~50ms) */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  return { buildPreviewChips, debounce };
})();
