/**
 * ===================== NEXT-UP BAR =====================
 * Faixa fina sob a nav com o próximo compromisso de hoje (Fase 7, Parte A).
 * Mostra "Próximo: {tarefa} em {tempo}" com cor que esquenta conforme aproxima.
 * Recalcula a cada 30s; some quando não há compromisso ou no Modo Agora.
 * Consulta sempre os services — nunca o Storage direto.
 */

const NextUpBar = (() => {

  const escapeHtml = Utils.escapeHtml;
  let timer = null;
  let currentId = null;

  function init() {
    stop();
    timer = setInterval(render, Constants.NEXTUP.REFRESH_MS);
    render();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    const el = document.getElementById('nextup-bar');
    if (el) el.style.display = 'none';
  }

  // ===== Seleção do próximo compromisso =====

  /** Minutos (fracionários) desde a meia-noite local */
  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  /** Tarefas de hoje com horário, em aberto, num único dia */
  function timedCandidates() {
    const td = Utils.today();
    return TaskService.forDay(td).filter(t =>
      t.start && Utils.isTaskOpen(t) && (!t.dateend || t.dateend === t.date));
  }

  /**
   * O compromisso a exibir: o recém-passado (dentro da janela de tolerância,
   * "atrasado") tem prioridade sobre o próximo futuro. Null se nada se aplica.
   */
  function pickNext() {
    const nm = nowMinutes();
    const withDelta = timedCandidates()
      .map(t => ({ t, delta: Utils.timeToMins(t.start) - nm }));
    const future = withDelta.filter(x => x.delta >= 0).sort((a, b) => a.delta - b.delta);
    const pastRecent = withDelta
      .filter(x => x.delta < 0 && -x.delta <= Constants.NEXTUP.OVERDUE_GRACE_MIN)
      .sort((a, b) => b.delta - a.delta);
    return pastRecent[0] || future[0] || null;
  }

  /** Cor da contagem conforme proximidade (minutos arredondados) */
  function countColor(deltaMin) {
    if (deltaMin < 0) return 'var(--red)';
    if (deltaMin <= Constants.NEXTUP.IMMINENT_MIN) return 'var(--amber)';
    if (deltaMin <= Constants.NEXTUP.SOON_MIN) return 'var(--accent2)';
    return 'var(--text3)';
  }

  // ===== Render =====

  function render() {
    const el = document.getElementById('nextup-bar');
    if (!el) return;
    // Modo Agora é silêncio visual: a faixa não aparece lá
    if (document.body.classList.contains('now-mode')) { el.style.display = 'none'; return; }

    const pick = pickNext();
    if (!pick) { el.style.display = 'none'; currentId = null; return; }

    currentId = pick.t.id;
    const color = countColor(Math.round(pick.delta));
    const human = Utils.humanDuration(pick.delta * 60000);

    el.style.display = 'flex';
    el.innerHTML = `<div class="nextup-inner" onclick="NextUpBar.openTask()" title="Abrir tarefa">
      <i class="ti ti-clock"></i>
      <span class="nextup-text">Próximo: <strong>${escapeHtml(pick.t.name)}</strong>
        <span class="nextup-count" style="color:${color}">${human}</span></span>
    </div>`;
  }

  /** Clique na faixa: abre o painel de detalhes da tarefa */
  function openTask() {
    if (!currentId) return;
    Navigation.showView('tasks');
    TaskDetail.open(currentId);
  }

  return { init, stop, render, openTask };
})();
