/**
 * ===================== FINANCE REVIEW (Fase 7e) =====================
 * Revisão Financeira Mensal guiada: 5 passos em tela cheia, reusando o stepper e
 * o tom sóbrio da Revisão Semanal (classes rv-*). Oferecida (nunca forçada) ao
 * abrir Finanças quando há um mês fechado por revisar. Passo 4 edita orçamentos
 * inline; passo 5 registra a decisão. Lê o FinanceService; não toca no Storage.
 */

const FinanceReview = (() => {

  const escapeHtml = Utils.escapeHtml;
  const TOTAL = 5;

  let flow = null;          // null = inativo; { step, mes } = fluxo em andamento
  let _adiadoSessao = false; // "Agora não" some a oferta só nesta sessão

  function _mesRevisado() {
    return FinanceService.addMonths(FinanceService.currentMonthPrefix(), -1);
  }

  function _mesLabel(mes) {
    return Utils.parseISO(`${mes}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function isActive() { return !!flow; }

  // ===== Oferta (gatilho não-forçado) =====

  function offerHtml() {
    if (_adiadoSessao || !FinanceService.listContas().length) return '';
    if (!FinanceService.precisaRevisaoMensal()) return '';
    const mes = _mesRevisado();
    return `<div class="card fin-rev-offer">
      <div class="fin-rev-offer-txt">
        <i class="ti ti-report-analytics"></i>
        <div>
          <div class="fin-rev-offer-title">Revisão de ${escapeHtml(_mesLabel(mes))}</div>
          <div class="fin-rev-offer-sub">Cinco passos pra fechar o mês com clareza. No seu tempo.</div>
        </div>
      </div>
      <div class="fin-rev-offer-btns">
        <button class="btn btn-ghost" onclick="FinanceReview.adiar()">Agora não</button>
        <button class="btn btn-primary" onclick="FinanceReview.start()">Revisar</button>
      </div>
    </div>`;
  }

  function adiar() {
    _adiadoSessao = true;
    if (window.FinanceView) FinanceView.render();
  }

  // ===== Shell do fluxo =====

  function start() {
    flow = { step: 1, mes: _mesRevisado() };
    _render();
  }

  function exit() {
    flow = null;
    document.body.classList.remove('rv-flow');
    if (window.FinanceView) FinanceView.render();
  }

  function _render() {
    if (window.FinanceView) FinanceView.render();
  }

  function flowHtml() {
    document.body.classList.add('rv-flow');
    return `<div class="rv-flow fin-rev-flow">
      ${_progressHtml()}
      <div class="rv-step-body">${_stepBody()}</div>
      ${_footerHtml()}
    </div>`;
  }

  function _progressHtml() {
    const pct = Math.round(flow.step / TOTAL * 100);
    return `<div class="rv-progress">
      <div class="rv-progress-track"><div class="rv-progress-fill" style="width:${pct}%"></div></div>
      <span class="rv-progress-label">${flow.step}/${TOTAL}</span>
      <button class="fin-rev-sair" title="Sair (continua depois)" onclick="FinanceReview.exit()"><i class="ti ti-x"></i></button>
    </div>`;
  }

  function _stepBody() {
    const dados = FinanceService.getDadosRevisao(flow.mes);
    switch (flow.step) {
      case 1: return _step1(dados);
      case 2: return _step2(dados);
      case 3: return _step3(dados);
      case 4: return _step4(dados);
      case 5: return _step5(dados);
      default: return '';
    }
  }

  function _footerHtml() {
    const back = flow.step === 1 ? ' disabled' : '';
    const isLast = flow.step === TOTAL;
    const nextBtn = isLast
      ? `<button class="rv-next" onclick="FinanceReview.finish()"><i class="ti ti-check"></i> Concluir revisão</button>`
      : `<button class="rv-next" onclick="FinanceReview.next()">Próximo <i class="ti ti-arrow-right"></i></button>`;
    return `<div class="rv-footer"><div class="rv-foot-btns">
      <button class="rv-back"${back} onclick="FinanceReview.back()"><i class="ti ti-arrow-left"></i> Voltar</button>
      ${nextBtn}
    </div></div>`;
  }

  function next() {
    if (flow.step === 4) _saveOrcamentosVisiveis();
    if (flow.step < TOTAL) { flow.step++; _render(); }
  }

  function back() {
    if (flow.step === 4) _saveOrcamentosVisiveis();
    if (flow.step > 1) { flow.step--; _render(); }
  }

  function _header(title, sub) {
    return `<div class="rv-step-head">
      <h2 class="rv-step-title">${escapeHtml(title)}</h2>
      ${sub ? `<p class="rv-step-sub">${escapeHtml(sub)}</p>` : ''}
    </div>`;
  }

  // ===== Passo 1 — Fechamento =====

  function _step1(d) {
    const f = d.fechamento;
    const saldoCor = f.saldoMesCentavos < 0 ? 'var(--red)' : 'var(--emerald)';
    const taxaPct = Math.round(f.taxaPoupanca * 100);
    const taxaAntPct = Math.round(f.taxaPoupancaAnterior * 100);
    const deltaSaidas = f.comparativo.totalSaidasCentavos - f.comparativo.totalSaidasAnteriorCentavos;
    const cmp = deltaSaidas === 0 ? 'igual ao mês anterior'
      : `${deltaSaidas > 0 ? 'gastou' : 'gastou'} ${Utils.formatBRL(Math.abs(deltaSaidas))} ${deltaSaidas > 0 ? 'a mais' : 'a menos'} que no mês retrasado`;
    return _header(`Fechamento de ${_mesLabel(d.mes)}`, _moodPhrase(f))
      + `<div class="rv-close-card"><div class="rv-close-grid">
          ${_closeStat(Utils.formatBRL(f.entradasCentavos), 'entradas', 'var(--emerald)')}
          ${_closeStat(Utils.formatBRL(f.saidasCentavos), 'saídas', 'var(--red)')}
          ${_closeStat(Utils.formatBRL(f.saldoMesCentavos), 'saldo do mês', saldoCor)}
          ${_closeStat(taxaPct + '%', 'taxa de poupança')}
        </div>
        <div class="fin-rev-cmp">Saídas: ${escapeHtml(cmp)}. Poupança: ${taxaAntPct}% → ${taxaPct}%.</div>
      </div>`;
  }

  function _closeStat(value, label, color) {
    return `<div class="rv-close-stat">
      <div class="rv-close-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
      <div class="rv-close-label">${label}</div>
    </div>`;
  }

  /** Frase sóbria, sem culpa nem infantilização, inclusive num mês ruim. */
  function _moodPhrase(f) {
    if (f.saldoMesCentavos < 0) return 'Mês no vermelho. Isso é informação pra ajustar, não pra cobrar.';
    if (f.taxaPoupanca >= 0.2) return 'Mês sólido. Os números mostram o esforço.';
    return 'Mês de equilíbrio justo. Dá pra trabalhar com isso.';
  }

  // ===== Passo 2 — Onde foi o dinheiro =====

  function _step2(d) {
    const total = d.gastosPorCategoria.reduce((s, g) => s + g.totalCentavos, 0);
    const lista = d.gastosPorCategoria.length
      ? d.gastosPorCategoria.map(g => `<div class="fin-rev-cat">
          <span class="fin-rev-cat-dot" style="background:${g.cor}"></span>
          <span class="fin-rev-cat-nome">${escapeHtml(g.nome)}</span>
          <span class="fin-rev-cat-pct">${Math.round(g.percentual)}%</span>
          <span class="fin-rev-cat-val">${Utils.formatBRL(g.totalCentavos)}</span>
        </div>`).join('')
      : `<div class="rv-empty"><div class="rv-empty-emoji">🫧</div><p>Nenhuma despesa neste mês.</p></div>`;
    const estouros = d.estouros.length
      ? `<div class="fin-rev-estouros">
          <div class="fin-rev-sub-head">Estourou o orçamento</div>
          ${d.estouros.map(e => `<div class="fin-rev-estouro">
            <span>${escapeHtml(e.nome)}</span>
            <span>${Utils.formatBRL(e.gastoCentavos)} de ${Utils.formatBRL(e.limiteCentavos)}
              <strong>(+${Utils.formatBRL(e.excedenteCentavos)})</strong></span>
          </div>`).join('')}
        </div>`
      : '';
    return _header('Onde foi o dinheiro', total ? `Total de saídas: ${Utils.formatBRL(total)}.` : '')
      + `<div class="fin-rev-cats">${lista}</div>${estouros}`;
  }

  // ===== Passo 3 — Metas e reserva =====

  function _step3(d) {
    if (!d.metas.length) {
      return _header('Metas e reserva', '')
        + `<div class="rv-empty"><div class="rv-empty-emoji">🌱</div>
             <p>Nenhuma meta cadastrada ainda. Sem problema — dá pra criar quando fizer sentido.</p></div>`;
    }
    const cards = d.metas.map(m => {
      const objetivo = m.objetivoCentavos || 0;
      const pct = objetivo > 0 ? Math.min(100, Math.round(m.saldoAtualCentavos / objetivo * 100)) : 0;
      const aporte = m.aportesMesCentavos > 0
        ? `Aportou ${Utils.formatBRL(m.aportesMesCentavos)} no mês`
        : 'Sem aporte neste mês';
      const prazo = m.aporteMensalNecessarioCentavos
        ? ` · precisa de ${Utils.formatBRL(m.aporteMensalNecessarioCentavos)}/mês`
        : '';
      return `<div class="fin-rev-meta">
        <div class="fin-rev-meta-top">
          <span class="fin-rev-meta-nome">${escapeHtml(m.nome)}</span>
          <span class="fin-rev-meta-val">${Utils.formatBRL(m.saldoAtualCentavos)}${objetivo ? ' / ' + Utils.formatBRL(objetivo) : ''}</span>
        </div>
        <div class="fin-rev-meta-bar"><div class="fin-rev-meta-fill" style="width:${pct}%"></div></div>
        <div class="fin-rev-meta-sub">${escapeHtml(aporte)}${escapeHtml(prazo)}</div>
      </div>`;
    }).join('');
    return _header('Metas e reserva', 'Onde cada objetivo está e o que entrou no mês.')
      + `<div class="fin-rev-metas">${cards}</div>`;
  }

  // ===== Passo 4 — Orçamento do novo mês =====

  function _step4(d) {
    const novoMes = FinanceService.currentMonthPrefix();
    const linhas = d.sugestoesOrcamento.length
      ? d.sugestoesOrcamento.map(s => {
          const atual = s.limiteAtualCentavos ? _centsToInput(s.limiteAtualCentavos) : '';
          return `<div class="fin-rev-orc">
            <div class="fin-rev-orc-info">
              <span class="fin-rev-cat-dot" style="background:${s.cor}"></span>
              <div>
                <div class="fin-rev-orc-nome">${escapeHtml(s.nome)}</div>
                <div class="fin-rev-orc-hint">gastou ${Utils.formatBRL(s.gastoRealCentavos)}</div>
              </div>
            </div>
            <div class="fin-rev-orc-edit">
              <span class="fin-rev-orc-prefix">R$</span>
              <input class="fin-rev-orc-input" inputmode="decimal" id="fin-rev-orc-${s.categoriaId}"
                     value="${atual}" placeholder="${_centsToInput(s.sugestaoCentavos)}"
                     onchange="FinanceReview.salvarOrcamento('${s.categoriaId}', this.value)">
            </div>
          </div>`;
        }).join('')
      : `<div class="rv-empty"><div class="rv-empty-emoji">🗒️</div><p>Sem gastos por categoria pra basear tetos.</p></div>`;
    return _header(`Orçamento de ${_mesLabel(novoMes)}`,
      'Use o real do mês passado como ponto de partida. Deixe em branco pra não orçar.')
      + `<div class="fin-rev-orcs">${linhas}</div>`;
  }

  function salvarOrcamento(categoriaId, valor) {
    const limiteCentavos = Utils.brlToCentavos(valor);
    const atual = FinanceService.getOrcamentoByCategoria(categoriaId);
    if (!limiteCentavos) {
      if (atual) FinanceService.removeOrcamento(categoriaId);
      return;
    }
    FinanceService.setOrcamento({
      categoriaId, limiteCentavos, rollover: atual ? !!atual.rollover : false
    });
  }

  /** Salva o que estiver digitado nos inputs do passo 4 (edições sem blur). */
  function _saveOrcamentosVisiveis() {
    document.querySelectorAll('[id^="fin-rev-orc-"]').forEach(el => {
      const categoriaId = el.id.replace('fin-rev-orc-', '');
      salvarOrcamento(categoriaId, el.value);
    });
  }

  function _centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  // ===== Passo 5 — Decisão =====

  function _step5(d) {
    return _header('Uma decisão pro mês',
      'Escolha uma única ação concreta. Pequena e factível vale mais que ambiciosa e vaga.')
      + `<div class="fin-rev-decisao">
          <textarea class="fin-rev-decisao-input" id="fin-rev-decisao" maxlength="240"
                    placeholder="Ex.: revisar assinaturas e cancelar o que não uso"></textarea>
          <div class="fin-rev-decisao-hint">Opcional, mas ajuda a fechar o mês com um próximo passo claro.</div>
        </div>`;
  }

  function finish() {
    const el = document.getElementById('fin-rev-decisao');
    FinanceService.registrarRevisao({ mes: flow.mes, decisao: el ? el.value : '' });
    flow = null;
    document.body.classList.remove('rv-flow');
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
    if (window.Feedback) Feedback.toast('Revisão financeira concluída', 'success');
  }

  return {
    isActive, offerHtml, adiar, flowHtml,
    start, exit, next, back, finish, salvarOrcamento
  };
})();
