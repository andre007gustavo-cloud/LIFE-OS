/**
 * ===================== COMEBACK VIEW =====================
 * Recomeço sem culpa (Fase 6, Parte B). Tela cheia, amigável e não-bloqueante,
 * exibida UMA vez quando o usuário volta após uma ausência longa (> N dias).
 * Oferece 3 caminhos para reorganizar as tarefas vencidas; registra a escolha
 * como evento (Parte C). Hábitos não entram aqui — só um lembrete leve de escudos.
 */

const ComebackView = (() => {

  const escapeHtml = Utils.escapeHtml;

  let daysAway = 0;
  let onDone = null;

  /** Exibe a tela. onContinue roda depois da escolha, levando ao painel. */
  function show(days, onContinue) {
    daysAway = days;
    onDone = onContinue;
    renderMain();
    document.getElementById('comeback-screen').style.display = 'flex';
  }

  function hide() {
    document.getElementById('comeback-screen').style.display = 'none';
  }

  function _set(html) {
    document.getElementById('comeback-content').innerHTML = html;
  }

  // ===== Tela principal: 3 escolhas =====

  function renderMain() {
    _set(`<div class="cb-card">
      <div class="cb-title">Bem-vindo de volta 👋</div>
      <div class="cb-sub">Você ficou ${daysAway} ${daysAway === 1 ? 'dia' : 'dias'} longe. Sem julgamento — só vamos organizar o reencontro.</div>
      <div class="cb-choices">
        <button class="cb-choice cb-choice-primary" onclick="ComebackView.chooseClean()">
          <div class="cb-choice-title"><i class="ti ti-sparkles"></i> Começar limpo</div>
          <div class="cb-choice-desc">Arquiva as tarefas vencidas e zera o atraso. Projetos e hábitos ficam intactos.</div>
          <span class="cb-badge">Recomendado</span>
        </button>
        <button class="cb-choice" onclick="ComebackView.chooseReview()">
          <div class="cb-choice-title"><i class="ti ti-list-check"></i> Revisar as mais importantes</div>
          <div class="cb-choice-desc">Mantém até ${Constants.REVIEW.REVIEW_OVERDUE_KEEP} vencidas de alta prioridade; arquiva o resto.</div>
        </button>
        <button class="cb-choice" onclick="ComebackView.chooseSeeAll()">
          <div class="cb-choice-title"><i class="ti ti-eye"></i> Ver tudo mesmo assim</div>
          <div class="cb-choice-desc">Vai direto ao painel, sem mexer em nada.</div>
        </button>
      </div>
      ${shieldHintHtml()}
    </div>`);
  }

  /** Lembrete leve de escudos — informativo, sem ação obrigatória */
  function shieldHintHtml() {
    const withShields = HabitService.getAll()
      .map(h => ({ name: h.name, shields: HabitService.stats(h.id).shields }))
      .filter(h => h.shields > 0)
      .sort((a, b) => b.shields - a.shields)[0];
    if (!withShields) return '';
    return `<div class="cb-shield"><i class="ti ti-shield"></i> Sua sequência de ${escapeHtml(withShields.name)} tem ${withShields.shields} ${withShields.shields === 1 ? 'escudo disponível' : 'escudos disponíveis'}.</div>`;
  }

  // ===== Confirmações (mostram o que vai acontecer antes de executar) =====

  function chooseClean() {
    const n = ReviewService.overdueTasks().length;
    confirmPanel(
      'Começar limpo',
      n
        ? `${n} ${n === 1 ? 'tarefa vencida será arquivada' : 'tarefas vencidas serão arquivadas'} (não excluídas — ficam guardadas). Projetos e hábitos não mudam.`
        : 'Não há tarefas vencidas para arquivar. Você segue com tudo em dia.',
      'ComebackView.confirmClean()');
  }

  function chooseReview() {
    const kept = ReviewService.topOverdue().length;
    const total = ReviewService.overdueTasks().length;
    const archived = total - kept;
    confirmPanel(
      'Revisar as mais importantes',
      `Vamos manter ${kept} ${kept === 1 ? 'tarefa vencida de alta prioridade' : 'vencidas de alta prioridade'} e arquivar as outras ${archived}.`,
      'ComebackView.confirmReview()');
  }

  function confirmPanel(title, message, confirmCall) {
    _set(`<div class="cb-card">
      <div class="cb-title">${title}</div>
      <div class="cb-sub">${message}</div>
      <div class="cb-confirm-btns">
        <button class="cb-secondary" onclick="ComebackView.renderMain()"><i class="ti ti-arrow-left"></i> Voltar</button>
        <button class="cb-primary" onclick="${confirmCall}"><i class="ti ti-check"></i> Confirmar</button>
      </div>
    </div>`);
  }

  // ===== Execução das escolhas =====

  function confirmClean() {
    ReviewService.archiveOverdue();
    finalize('comecar_limpo');
  }

  function confirmReview() {
    const keepIds = ReviewService.topOverdue().map(t => t.id);
    ReviewService.archiveOverdue(keepIds);
    finalize('revisar_importantes');
  }

  function chooseSeeAll() {
    finalize('ver_tudo');
  }

  function finalize(choice) {
    ReviewService.addEvent({ type: 'comeback', daysAway, choice });
    hide();
    if (onDone) onDone();
  }

  return {
    show, renderMain,
    chooseClean, chooseReview, chooseSeeAll,
    confirmClean, confirmReview
  };
})();
