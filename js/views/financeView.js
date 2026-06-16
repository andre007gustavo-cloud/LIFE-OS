/**
 * ===================== FINANCE VIEW =====================
 * Fase 9: a aba Finanças é um HUB enxuto + SUB-TELAS. A home mostra só o dia a
 * dia (resumo compacto, lançamento rápido + recentes, alertas e a grade de
 * navegação). Cada sub-tela reusa, em tela cheia, o componente da sua fase
 * (orçamento/projeção/relatórios/cartões/…) sob um cabeçalho com "Voltar".
 * View NUNCA acessa Storage direto — só FinanceService e os componentes.
 */

const FinanceView = (() => {

  // Sub-tela atual: 'home' (hub) ou a chave de SUBVIEWS. Sempre volta a 'home'
  // ao (re)entrar na aba — ver enter().
  let subView = 'home';

  // Mês ('YYYY-MM') que filtra a lista de lançamentos do hub/sub-tela. O resumo
  // (Disponível/Guardado/Projetado) reflete sempre o estado atual, não o mês.
  let selectedMonth = null;

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  function mesAtivo() {
    if (!selectedMonth) selectedMonth = FinanceService.currentMonthPrefix();
    return selectedMonth;
  }

  function mesLabel(mes) {
    const d = Utils.parseISO(`${mes}-01`);
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }

  /** Navega meses na lista de lançamentos; não passa do mês corrente. */
  function setMes(delta) {
    const alvo = FinanceService.addMonths(mesAtivo(), delta);
    if (alvo > FinanceService.currentMonthPrefix()) return;
    selectedMonth = alvo;
    render();
  }

  /**
   * Mapa das sub-telas: título + ícone do cabeçalho + função que devolve o HTML
   * do componente JÁ EXISTENTE. Nada de lógica nova aqui, só roteamento.
   */
  const SUBVIEWS = {
    orcamento:    { title: 'Orçamento',       icon: 'ti-target-arrow',     render: () => FinanceBudget.sectionHtml(FinanceService.currentMonthPrefix()) },
    projecao:     { title: 'Projeção',        icon: 'ti-chart-line',       render: () => FinanceProjecao.sectionHtml() },
    relatorios:   { title: 'Relatórios',      icon: 'ti-report-analytics', render: () => FinanceRelatorios.sectionHtml() },
    regua:        { title: 'Régua 50/30/20',  icon: 'ti-scale',            render: () => FinanceRegua.sectionHtml() },
    cartoes:      { title: 'Cartões',         icon: 'ti-credit-card',      render: () => FinanceCartoes.sectionHtml() },
    carteiras:    { title: 'Carteiras',       icon: 'ti-wallet',           render: () => FinanceCarteiras.sectionHtml() },
    categorias:   { title: 'Categorias',      icon: 'ti-tag',              render: () => FinanceCategorias.sectionHtml() },
    metas:        { title: 'Metas',           icon: 'ti-target',           render: () => FinanceMetas.sectionHtml() },
    recorrencias: { title: 'Recorrências',    icon: 'ti-repeat',           render: () => FinanceRecorrencias.sectionHtml(FinanceService.currentMonthPrefix()) },
    alertas:      { title: 'Alertas',         icon: 'ti-bell',             render: () => FinanceAlertas.sectionHtml() },
    lancamentos:  { title: 'Lançamentos',     icon: 'ti-list',             render: () => listHtml(FinanceService.listTransactions({ mes: mesAtivo() })) }
  };

  /**
   * Grade de navegação do hub. Sub-telas usam openSub; Importar e "Posso gastar?"
   * já são fluxos de modal (Fases 7c/8) — o botão só dispara o modal existente.
   */
  const NAV_ITEMS = [
    { icon: 'ti-target-arrow',     label: 'Orçamento',      onclick: "FinanceView.openSub('orcamento')" },
    { icon: 'ti-chart-line',       label: 'Projeção',       onclick: "FinanceView.openSub('projecao')" },
    { icon: 'ti-report-analytics', label: 'Relatórios',     onclick: "FinanceView.openSub('relatorios')" },
    { icon: 'ti-credit-card',      label: 'Cartões',        onclick: "FinanceView.openSub('cartoes')" },
    { icon: 'ti-target',           label: 'Metas',          onclick: "FinanceView.openSub('metas')" },
    { icon: 'ti-repeat',           label: 'Recorrências',   onclick: "FinanceView.openSub('recorrencias')" },
    { icon: 'ti-file-import',      label: 'Importar',       onclick: "FinanceImport.openCentral()" },
    { icon: 'ti-wallet',           label: 'Posso gastar?',  onclick: "FinancePossoGastar.open()" },
    { icon: 'ti-building-bank',    label: 'Carteiras',      onclick: "FinanceView.openSub('carteiras')" },
    { icon: 'ti-tag',              label: 'Categorias',     onclick: "FinanceView.openSub('categorias')" },
    { icon: 'ti-scale',            label: 'Régua 50/30/20', onclick: "FinanceView.openSub('regua')" }
  ];

  // ===== Roteamento =====

  /** Ponto de entrada da aba (registrado na Navigation): sempre abre no hub. */
  function enter() {
    subView = 'home';
    selectedMonth = FinanceService.currentMonthPrefix();
    render();
  }

  /** Abre uma sub-tela em tela cheia do módulo. */
  function openSub(name) {
    if (!SUBVIEWS[name]) return;
    subView = name;
    render();
    const el = document.getElementById('fin-content');
    if (el) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function goHome() {
    subView = 'home';
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    // Revisão financeira em andamento (Fase 7e): toma a tela inteira
    if (FinanceReview.isActive()) {
      document.getElementById('fin-content').innerHTML = FinanceReview.flowHtml();
      return;
    }
    document.body.classList.remove('rv-flow');
    document.getElementById('fin-content').innerHTML =
      (subView === 'home' || !SUBVIEWS[subView]) ? homeHtml() : subviewHtml(subView);
  }

  // ===== HUB (home) =====

  function homeHtml() {
    const recentes = FinanceService.listTransactions({ mes: mesAtivo() }).slice(0, 5);
    return hubHeaderHtml() +
      resumoHtml() +
      quickbarHtml() +
      FinanceReview.offerHtml() +
      FinanceAlertas.compactHtml() +
      navGridHtml() +
      recentesHtml(recentes) +
      devButtonHtml();
  }

  /** Cabeçalho do hub: título + seletor de mês da lista de lançamentos. */
  function hubHeaderHtml() {
    const noAtual = mesAtivo() >= FinanceService.currentMonthPrefix();
    return `<div class="fin-hub-head">
      <div class="fin-hub-title">
        <span class="fin-hub-icon"><i class="ti ti-wallet"></i></span> Financeiro
      </div>
      <div class="fin-month-nav">
        <button class="fin-month-btn" onclick="FinanceView.setMes(-1)" title="Mês anterior"><i class="ti ti-chevron-left"></i></button>
        <span class="fin-month-label">${Utils.escapeHtml(mesLabel(mesAtivo()))}</span>
        <button class="fin-month-btn" onclick="FinanceView.setMes(1)" title="Próximo mês" ${noAtual ? 'disabled' : ''}><i class="ti ti-chevron-right"></i></button>
      </div>
    </div>`;
  }

  /** Resumo compacto: caixa disponível, guardado em metas e projeção do mês. */
  function resumoHtml() {
    const disponivel = FinanceService.getSaldoAte(null, Utils.today());
    const guardado = FinanceService.listMetas()
      .reduce((s, m) => s + FinanceService.getSaldo(m.id), 0);
    const projetado = FinanceService.getSaldoProjetadoFimMes();
    return `<div class="fin-resumo fin-resumo-3">
      ${statHtml('Disponível', disponivel, disponivel >= 0 ? '' : 'red')}
      ${statHtml('Guardado', guardado, 'green')}
      ${statHtml('Projetado fim do mês', projetado, 'accent')}
    </div>`;
  }

  function statHtml(label, centavos, cls) {
    return `<div class="stat ${cls}">
      <div class="stat-val">${Utils.formatBRL(centavos)}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  /** Barra de lançamento rápido (abre o popover do FinanceQuickAdd). */
  function quickbarHtml() {
    return `<button class="fin-quickbar" onclick="FinanceQuickAdd.open()">
      <i class="ti ti-plus"></i>
      <span class="fin-quickbar-ph">Novo lançamento — ex.: almoço 32 #alimentação @nubank</span>
      <i class="ti ti-microphone fin-quickbar-mic"></i>
    </button>`;
  }

  function navGridHtml() {
    return `<div class="fin-nav-grid">
      ${NAV_ITEMS.map(it => `
        <button class="fin-nav-btn" onclick="${it.onclick}">
          <span class="fin-nav-ico"><i class="ti ${it.icon}"></i></span>
          <span class="fin-nav-lbl">${it.label}</span>
        </button>`).join('')}
    </div>`;
  }

  function recentesHtml(txs) {
    return `<div class="fin-recent">
      <div class="fin-recent-head">
        <span>Lançamentos recentes</span>
        ${txs.length ? `<button class="fin-ver-todos" onclick="FinanceView.openSub('lancamentos')">ver todos</button>` : ''}
      </div>
      ${txs.length
        ? txs.map(entryHtml).join('')
        : `<div class="text-muted" style="margin:4px 0 8px">Nenhum lançamento neste mês</div>`}
    </div>`;
  }

  // ===== SUB-TELA (cabeçalho + componente da fase) =====

  function subviewHtml(name) {
    const sv = SUBVIEWS[name];
    return `<div class="fin-subhead">
      <button class="fin-back-btn" onclick="FinanceView.goHome()"><i class="ti ti-arrow-left"></i> Voltar</button>
      <div class="fin-subhead-title"><i class="ti ${sv.icon}"></i> ${sv.title}</div>
    </div>
    ${sv.render()}`;
  }

  /** Botões de teste — só em localhost, nunca em produção */
  function devButtonHtml() {
    if (window.location.hostname !== 'localhost') return '';
    return `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="FinanceView.seedTest()">🧪 Semear lançamentos de teste</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="FinanceView.resetData()">🗑️ Limpar dados de finanças</button>
    </div>`;
  }

  function seedTest() {
    FinanceService._seedTestData();
    render();
    if (window.DashboardView) DashboardView.render();
  }

  /** Apaga todos os dados de finanças (mantém só categorias e a conta padrão). Só em localhost. */
  function resetData() {
    if (!confirm('Apagar TODOS os dados de finanças (lançamentos, cartões, orçamentos, importações…)? Categorias e a conta padrão são recriadas. Isso sincroniza para a nuvem.')) return;
    FinanceService._resetFinanceData();
    render();
    if (window.DashboardView) DashboardView.render();
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

  return { enter, openSub, goHome, setMes, render, remove, seedTest, resetData };
})();
