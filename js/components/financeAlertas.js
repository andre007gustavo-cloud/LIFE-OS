/**
 * ===================== FINANCE ALERTAS (Fase 7d) =====================
 * Painel de alertas proativos no topo de Finanças: orçamento estourado/apertado,
 * projeção negativa, fatura vencendo, assinatura não confirmada e meta atrasada.
 * Cada card tem cor/ícone por severidade, ação opcional e "Dispensar" (só nesta
 * sessão, sem persistir). Componente de UI: lê o FinanceService, zero Storage.
 */

const FinanceAlertas = (() => {

  // Dispensados só na sessão (em memória) — reaparecem ao recarregar.
  const _dispensados = new Set();

  const SEV = {
    critico: { cor: 'var(--red)',   icone: 'ti-alert-octagon' },
    atencao: { cor: 'var(--amber)', icone: 'ti-alert-triangle' },
    info:    { cor: 'var(--blue)',  icone: 'ti-info-circle' }
  };

  /** Alertas atuais menos os dispensados nesta sessão. */
  function _ativos() {
    return FinanceService.getAlertas().filter(a => !_dispensados.has(a.id));
  }

  /** Nº de alertas críticos ativos (para o Dashboard). */
  function criticosCount() {
    return _ativos().filter(a => a.severidade === 'critico').length;
  }

  // ===== Painel na view de Finanças =====

  function sectionHtml() {
    if (!FinanceService.listContas().length) return '';
    const alertas = _ativos();
    if (!alertas.length) {
      return `<div class="card fin-alertas-vazio">
        <i class="ti ti-circle-check"></i>
        <span>Tudo sob controle</span>
      </div>`;
    }
    return `<div class="card fin-alertas">
      <div class="card-title"><i class="ti ti-bell"></i> Alertas <span class="fin-alertas-badge">${alertas.length}</span></div>
      ${alertas.map(_cardHtml).join('')}
    </div>`;
  }

  function _cardHtml(a) {
    const s = SEV[a.severidade] || SEV.info;
    const acao = a.acao
      ? `<button class="fin-alerta-acao" onclick="FinanceAlertas.acao('${a.acao.tipo}','${Utils.escapeAttr(a.acao.alvoId)}')">${Utils.escapeHtml(a.acao.label)}</button>`
      : '';
    return `<div class="fin-alerta" style="--sev:${s.cor}">
      <i class="ti ${s.icone} fin-alerta-icon"></i>
      <div class="fin-alerta-corpo">
        <div class="fin-alerta-titulo">${Utils.escapeHtml(a.titulo)}</div>
        <div class="fin-alerta-desc">${Utils.escapeHtml(a.descricao)}</div>
      </div>
      <div class="fin-alerta-botoes">
        ${acao}
        <button class="fin-alerta-dispensar" title="Dispensar"
                onclick="FinanceAlertas.dispensar('${Utils.escapeAttr(a.id)}')">Dispensar</button>
      </div>
    </div>`;
  }

  // ===== Ações =====

  function dispensar(id) {
    _dispensados.add(id);
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  function acao(tipo, alvoId) {
    if (tipo === 'confirmar') {
      FinanceService.confirmarAssinatura(alvoId);
      Modal.toast('Assinatura confirmada');
      if (window.FinanceView) FinanceView.render();
      if (window.DashboardView) DashboardView.render();
    } else if (tipo === 'pagar') {
      if (window.FinanceCartaoModal) FinanceCartaoModal.openDetalhe(alvoId);
    }
  }

  // ===== Dashboard: contagem de críticos =====

  function dashHtml() {
    if (!FinanceService.listContas().length) return '';
    const n = criticosCount();
    if (!n) return '';
    return `<button class="fin-alertas-dash" onclick="showView('finance')">
      <i class="ti ti-alert-octagon"></i>
      <span><strong>${n}</strong> alerta${n > 1 ? 's' : ''} crítico${n > 1 ? 's' : ''}</span>
      <i class="ti ti-chevron-right"></i>
    </button>`;
  }

  return { sectionHtml, dashHtml, dispensar, acao, criticosCount };
})();
