/**
 * ===================== FINANCE CARTOES (Fase 4) =====================
 * Seção "Cartões" na view de Finanças: lista de cartões com fatura atual,
 * barra de limite e parcelas comprometidas. Card resumido no Dashboard.
 * Componente de UI: lê CartaoService / FinanceService, zero DOM direto.
 */

const FinanceCartoes = (() => {

  // ===== Seção da view de Finanças =====

  function sectionHtml() {
    const cartoes = CartaoService.listCartoes();
    return `<div class="card fin-cartoes-section">
      <div class="card-title fin-cartoes-title">
        <span><i class="ti ti-credit-card"></i> Cartões</span>
        <button class="btn btn-ghost btn-sm" onclick="FinanceCartaoModal.openNew()">
          <i class="ti ti-plus"></i> Adicionar
        </button>
      </div>
      ${cartoes.length
        ? cartoes.map(cartaoHtml).join('')
        : `<div class="text-muted" style="margin:4px 0 8px">Nenhum cartão cadastrado</div>`}
    </div>`;
  }

  function cartaoHtml(c) {
    const fatura = CartaoService.getFaturaAtual(c.id);
    const disponivel = CartaoService.getLimiteDisponivel(c.id);
    const comprometidas = CartaoService.getParcelasComprometidas(c.id);
    const usado = c.limiteCentavos - disponivel;
    const pct = c.limiteCentavos > 0 ? Math.min(100, Math.max(0, Math.round(usado / c.limiteCentavos * 100))) : 0;
    const total = fatura ? fatura.totalCentavos : 0;
    const paga = fatura ? fatura.paga : false;
    const statusLabel = paga ? 'Paga' : (total > 0 ? 'Em aberto' : 'Sem lançamentos');
    const statusClass = paga ? 'paga' : (total > 0 ? 'aberta' : '');
    const barClass = pct > 90 ? 'orc-estourado' : pct > 70 ? 'orc-alerta' : 'orc-ok';

    return `<div class="fin-card-item" onclick="FinanceCartaoModal.openDetalhe('${c.id}')">
      <div class="fin-card-header">
        <div class="fin-card-badge" style="background:${c.cor}22;color:${c.cor}">💳</div>
        <div class="fin-card-info">
          <div class="fin-card-name">${Utils.escapeHtml(c.nome)}</div>
          <div class="fin-card-meta">Fecha dia ${c.diaFechamento} · Vence dia ${c.diaVencimento}</div>
        </div>
        <div class="fin-card-fatura">
          <div class="fin-card-fatura-total">${Utils.formatBRL(total)}</div>
          <div class="fin-card-fatura-status ${statusClass}">${Utils.escapeHtml(statusLabel)}</div>
        </div>
      </div>
      <div class="orc-bar"><div class="orc-bar-fill ${barClass}" style="width:${pct}%"></div></div>
      <div class="fin-card-footer">
        <span>${Utils.formatBRL(disponivel)} disponível de ${Utils.formatBRL(c.limiteCentavos)}</span>
        ${comprometidas.totalCentavos > 0
          ? `<span>futuras: ${Utils.formatBRL(comprometidas.totalCentavos)} · ${comprometidas.numCompras} compra${comprometidas.numCompras !== 1 ? 's' : ''}</span>`
          : ''}
      </div>
    </div>`;
  }

  // ===== Card do Dashboard (compacto) =====

  function dashHtml() {
    const cartoes = CartaoService.listCartoes();
    if (!cartoes.length) return '';
    return cartoes.map(c => {
      const fatura = CartaoService.getFaturaAtual(c.id);
      const disponivel = CartaoService.getLimiteDisponivel(c.id);
      const total = fatura ? fatura.totalCentavos : 0;
      const usado = c.limiteCentavos - disponivel;
      const pct = c.limiteCentavos > 0 ? Math.min(100, Math.max(0, Math.round(usado / c.limiteCentavos * 100))) : 0;
      const barClass = pct > 90 ? 'orc-estourado' : pct > 70 ? 'orc-alerta' : 'orc-ok';
      return `<div class="orc-dash-row" style="margin-bottom:12px">
        <div class="orc-dash-head">
          <span class="orc-dash-cat">💳 ${Utils.escapeHtml(c.nome)}</span>
          <span class="orc-dash-val orc-${pct > 90 ? 'estourado' : pct > 70 ? 'alerta' : 'ok'}">${Utils.formatBRL(total)}</span>
        </div>
        <div class="orc-bar"><div class="orc-bar-fill ${barClass}" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${Utils.formatBRL(disponivel)} disponível</div>
      </div>`;
    }).join('');
  }

  return { sectionHtml, dashHtml };
})();
