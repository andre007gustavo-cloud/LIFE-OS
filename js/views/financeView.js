/**
 * ===================== FINANCE VIEW =====================
 * Three tabs: Resumo (summary), Lançamentos (entries list), Categorias (per-category totals).
 */

const FinanceView = (() => {

  function render() {
    const tab = AppState.ui.finTab;
    if (tab === 'resumo') renderResumo();
    else if (tab === 'lancamentos') renderLancamentos();
    else if (tab === 'categorias') renderCategorias();
    syncTabButtons();
  }

  function setTab(tab) {
    AppState.ui.finTab = tab;
    render();
  }

  function syncTabButtons() {
    document.querySelectorAll('.fin-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === AppState.ui.finTab);
    });
  }

  // ===== Resumo =====

  function renderResumo() {
    const entries = FinanceService.forMonth(FinanceService.currentMonthPrefix());
    const { receitas, despesas, saldo, pctComprometido } = FinanceService.summarize(entries);

    document.getElementById('fin-content').innerHTML = `
      <div class="grid3" style="margin-bottom:16px">
        <div class="stat green">
          <div class="stat-val">${Utils.fmtMoney(receitas)}</div>
          <div class="stat-label">Receitas</div>
        </div>
        <div class="stat red">
          <div class="stat-val">${Utils.fmtMoney(despesas)}</div>
          <div class="stat-label">Despesas</div>
        </div>
        <div class="stat ${saldo >= 0 ? 'green' : 'red'}">
          <div class="stat-val">${Utils.fmtMoney(saldo)}</div>
          <div class="stat-label">Saldo</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Comprometimento da renda</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
          <span>${pctComprometido.toFixed(0)}% comprometido</span>
          <span style="color:var(--text3)">${Utils.fmtMoney(despesas)} / ${Utils.fmtMoney(receitas)}</span>
        </div>
        <div class="fin-bar">
          <div class="fin-bar-fill${pctComprometido > 100 ? ' over' : ''}"
               style="width:${Math.min(100, pctComprometido)}%"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Últimos lançamentos</div>
        ${entries.slice(-5).reverse().map(entryHtml).join('') || '<div class="text-muted">Sem lançamentos este mês</div>'}
      </div>
    `;
  }

  // ===== Lançamentos =====

  function renderLancamentos() {
    const entries = [...FinanceService.getAll()].reverse();
    document.getElementById('fin-content').innerHTML = `
      <div class="card">
        <div class="card-title">Todos os lançamentos</div>
        ${entries.length
          ? entries.map(entryHtml).join('')
          : '<div class="empty"><i class="ti ti-coin"></i><p>Nenhum lançamento ainda</p></div>'
        }
      </div>
    `;
  }

  // ===== Categorias =====

  function renderCategorias() {
    const entries = FinanceService.forMonth(FinanceService.currentMonthPrefix());
    const cats = FinanceService.byCategory(entries);

    document.getElementById('fin-content').innerHTML = `
      <div class="card">
        <div class="card-title">Categorias deste mês</div>
        ${cats.length ? cats.map(c => `
          <div class="cat-item">
            <div class="cat-dot" style="background:${c.color}"></div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${c.name}</div>
            </div>
            <div class="cat-val ${c.isRec ? 'rec' : 'desp'}">${Utils.fmtMoney(c.total)}</div>
          </div>
        `).join('') : '<div class="text-muted">Sem dados ainda</div>'}
      </div>
    `;
  }

  // ===== Internal =====

  function entryHtml(entry) {
    const cat = FinanceService.getCategoryById(entry.cat);
    const isRec = entry.type === 'receita';
    return `<div class="fin-entry">
      <div class="fin-dot" style="background:${cat?.color || 'var(--bg4)'}22;color:${cat?.color || 'var(--text3)'}">
        <i class="ti ti-${isRec ? 'trending-up' : 'trending-down'}"></i>
      </div>
      <div class="fin-info">
        <div class="fin-title">${entry.desc}</div>
        <div class="fin-sub">${cat?.name || ''} · ${Utils.fmtDate(entry.date)}</div>
      </div>
      <div class="fin-amount" style="color:${isRec ? 'var(--green)' : 'var(--red)'}">
        ${isRec ? '+' : '-'}${Utils.fmtMoney(entry.value)}
      </div>
      <button class="icon-btn" onclick="deleteFinEntry('${entry.id}')" style="color:var(--red)">
        <i class="ti ti-x"></i>
      </button>
    </div>`;
  }

  function deleteEntry(id) {
    if (!confirm('Excluir lançamento?')) return;
    FinanceService.remove(id);
    render();
    if (window.DashboardView) DashboardView.render();
  }

  return { render, setTab, deleteEntry };
})();
