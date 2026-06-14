/**
 * ===================== FINANCE VIEW =====================
 * Fase 1: saldo total no topo, resumo do mês (entradas/saídas) e a lista de
 * lançamentos do mês agrupada por dia. Criação rápida pelo FAB (FinanceQuickAdd).
 * Fase 4: seção de cartões de crédito com fatura atual e limite disponível.
 */

const FinanceView = (() => {

  function render() {
    const mes = FinanceService.currentMonthPrefix();
    const saldoTotal = FinanceService.getSaldo();
    const resumo = FinanceService.getResumoMes(mes);
    const txs = FinanceService.listTransactions({ mes });

    document.getElementById('fin-content').innerHTML =
      headerHtml(saldoTotal, resumo) +
      FinanceCartoes.sectionHtml() +
      FinanceProjecao.sectionHtml() +
      FinanceRelatorios.sectionHtml() +
      FinanceBudget.sectionHtml(mes) +
      FinanceRecorrencias.sectionHtml(mes) +
      listHtml(txs) + devButtonHtml();
  }

  /** Botão de teste — só em localhost, nunca em produção */
  function devButtonHtml() {
    if (window.location.hostname !== 'localhost') return '';
    return `<button class="btn btn-ghost btn-sm" style="margin-top:16px"
              onclick="FinanceView.seedTest()">🧪 Semear lançamentos de teste</button>`;
  }

  function seedTest() {
    FinanceService._seedTestData();
    render();
    if (window.DashboardView) DashboardView.render();
  }

  // ===== Topo: saldo + resumo do mês =====

  function headerHtml(saldoTotal, resumo) {
    const saldoColor = saldoTotal >= 0 ? 'var(--green)' : 'var(--red)';
    return `
      <div class="card fin-balance-card">
        <div class="fin-balance-label">Saldo total</div>
        <div class="fin-balance-value" style="color:${saldoColor}">${Utils.formatBRL(saldoTotal)}</div>
      </div>
      <div class="fin-resumo">
        <div class="stat green">
          <div class="stat-val">${Utils.formatBRL(resumo.entradas)}</div>
          <div class="stat-label">Entradas do mês</div>
        </div>
        <div class="stat red">
          <div class="stat-val">${Utils.formatBRL(resumo.saidas)}</div>
          <div class="stat-label">Saídas do mês</div>
        </div>
      </div>`;
  }

  // ===== Lista agrupada por dia =====

  function listHtml(txs) {
    if (!txs.length) {
      return `<div class="empty"><i class="ti ti-coin"></i><p>Nenhum lançamento este mês</p></div>`;
    }
    const groups = {};
    txs.forEach(t => { (groups[t.data] = groups[t.data] || []).push(t); });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(d => `
      <div class="fin-day-group">
        <div class="fin-day-head">${dayLabel(d)}</div>
        ${groups[d].map(entryHtml).join('')}
      </div>`).join('');
  }

  function dayLabel(d) {
    if (d === Utils.today()) return 'Hoje';
    if (d === Utils.tomorrow()) return 'Amanhã';
    const dow = Constants.CALENDAR.WEEK_DAY_NAMES_FULL[Utils.parseISO(d).getDay()];
    return `${dow}, ${Utils.fmtDayMonth(d)}`;
  }

  function entryHtml(t) {
    if (t.tipo === 'transferencia') return transferHtml(t);
    if (t.cartaoId && !t.pagamentoFatura) return cardEntryHtml(t);
    if (t.pagamentoFatura) return faturaPaymentHtml(t);
    const cat = FinanceService.getCategoriaById(t.categoriaId);
    const conta = FinanceService.getContaById(t.contaId);
    const isEntrada = t.tipo === 'entrada';
    const cor = cat?.cor || (isEntrada ? 'var(--green)' : 'var(--red)');
    const icone = cat?.icone || (isEntrada ? '🟢' : '🔴');
    const sub = [cat?.nome, conta?.nome].filter(Boolean).join(' · ');
    return `<div class="fin-entry" onclick="FinanceModal.openEdit('${t.id}')">
      <div class="fin-dot" style="background:${cor}22">${Utils.escapeHtml(icone)}</div>
      <div class="fin-info">
        <div class="fin-title">${Utils.escapeHtml(t.descricao || cat?.nome || 'Lançamento')}</div>
        <div class="fin-sub">${Utils.escapeHtml(sub)}</div>
      </div>
      <div class="fin-amount" style="color:${isEntrada ? 'var(--green)' : 'var(--red)'}">
        ${isEntrada ? '+' : '−'}${Utils.formatBRL(t.valorCentavos)}
      </div>
      <button class="icon-btn" title="Excluir"
              onclick="event.stopPropagation();FinanceView.remove('${t.id}')"><i class="ti ti-x"></i></button>
    </div>`;
  }

  function cardEntryHtml(t) {
    const cartao = CartaoService.getCartaoById(t.cartaoId);
    const cat = FinanceService.getCategoriaById(t.categoriaId);
    const parcelas = t.parcelas || 1;
    const parcelaBadge = parcelas > 1
      ? `<span class="fin-parcela-badge">${parcelas}x</span>`
      : '';
    const sub = [cat?.nome, cartao?.nome].filter(Boolean).join(' · ');
    const cor = cartao?.cor || 'var(--accent)';
    return `<div class="fin-entry fin-entry-card" onclick="FinanceCartaoModal.openDetalhe('${t.cartaoId}')">
      <div class="fin-dot" style="background:${cor}22;color:${cor}">💳</div>
      <div class="fin-info">
        <div class="fin-title">${Utils.escapeHtml(t.descricao || 'Compra no cartão')} ${parcelaBadge}</div>
        <div class="fin-sub">${Utils.escapeHtml(sub)}</div>
      </div>
      <div class="fin-amount" style="color:var(--red)">−${Utils.formatBRL(t.valorCentavos)}</div>
      <button class="icon-btn" title="Excluir"
              onclick="event.stopPropagation();FinanceView.remove('${t.id}')"><i class="ti ti-x"></i></button>
    </div>`;
  }

  function faturaPaymentHtml(t) {
    const conta = FinanceService.getContaById(t.contaId);
    return `<div class="fin-entry fin-entry-fatura">
      <div class="fin-dot" style="background:var(--red)22">💳</div>
      <div class="fin-info">
        <div class="fin-title">${Utils.escapeHtml(t.descricao || 'Pagamento fatura')}</div>
        <div class="fin-sub">${Utils.escapeHtml(conta?.nome || '')}</div>
      </div>
      <div class="fin-amount" style="color:var(--red)">−${Utils.formatBRL(t.valorCentavos)}</div>
      <button class="icon-btn" title="Desfazer pagamento"
              onclick="event.stopPropagation();FinanceView.remove('${t.id}')"><i class="ti ti-x"></i></button>
    </div>`;
  }

  function transferHtml(t) {
    const origem = FinanceService.getContaById(t.contaId);
    const destino = FinanceService.getContaById(t.contaDestinoId);
    const rota = `${origem?.nome || '?'} → ${destino?.nome || '?'}`;
    return `<div class="fin-entry" onclick="FinanceModal.openEdit('${t.id}')">
      <div class="fin-dot" style="background:var(--bg4)">🔄</div>
      <div class="fin-info">
        <div class="fin-title">${Utils.escapeHtml(t.descricao || 'Transferência')}</div>
        <div class="fin-sub">${Utils.escapeHtml(rota)}</div>
      </div>
      <div class="fin-amount" style="color:var(--text2)">${Utils.formatBRL(t.valorCentavos)}</div>
      <button class="icon-btn" title="Excluir"
              onclick="event.stopPropagation();FinanceView.remove('${t.id}')"><i class="ti ti-x"></i></button>
    </div>`;
  }

  function remove(id) {
    const t = FinanceService.getTransacaoById(id);
    if (!t) return;
    if (t.pagamentoFatura) {
      if (!confirm('Desfazer pagamento desta fatura?')) return;
      const d = AppState.getDB();
      const fp = d.faturaPagamentos && d.faturaPagamentos.find(p => p.transacaoId === id);
      if (fp) CartaoService.desfazerPagamento(fp.cartaoId, fp.competencia);
      else FinanceService.deleteTransaction(id);
    } else {
      if (!confirm('Excluir lançamento?')) return;
      FinanceService.deleteTransaction(id);
    }
    render();
    if (window.DashboardView) DashboardView.render();
  }

  return { render, remove, seedTest };
})();
