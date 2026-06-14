/**
 * ===================== FINANCE RECORRÊNCIAS (Fase 3) =====================
 * UI das despesas/receitas fixas: a seção dentro de Finanças (custo fixo,
 * lista, próximos lançamentos do mês, assinaturas) e o modal de cadastro/edição.
 * Componente de UI: lê o FinanceService, nunca o Storage direto.
 */

const FinanceRecorrencias = (() => {

  let _editId = null;
  let _tipo = 'saida';

  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // ===== Seção da view de Finanças =====

  function sectionHtml(mes) {
    const recs = FinanceService.listRecorrencias();
    return `<div class="card rec-section">
      <div class="card-title"><i class="ti ti-repeat"></i> Recorrências
        <button class="btn btn-ghost btn-sm" style="margin-left:auto"
                onclick="FinanceRecorrencias.openNew()"><i class="ti ti-plus"></i> Nova</button>
      </div>
      ${custoFixoHtml(FinanceService.getCustoFixo())}
      ${listHtml(recs)}
      ${proximosHtml(mes)}
      ${assinaturasHtml()}
    </div>`;
  }

  function custoFixoHtml(c) {
    const liq = c.fixoMensalLiquidoCentavos;
    return `<div class="orc-resumo">
      <div class="stat red"><div class="stat-val">${Utils.formatBRL(c.fixoMensalSaidaCentavos)}</div><div class="stat-label">Saída fixa/mês</div></div>
      <div class="stat green"><div class="stat-val">${Utils.formatBRL(c.fixoMensalEntradaCentavos)}</div><div class="stat-label">Entrada fixa/mês</div></div>
      <div class="stat ${liq >= 0 ? 'green' : 'red'}"><div class="stat-val">${Utils.formatBRL(liq)}</div><div class="stat-label">Líquido/mês</div></div>
    </div>`;
  }

  function listHtml(recs) {
    if (!recs.length) {
      return `<div class="text-muted" style="margin:4px 0 8px">Nenhuma recorrência cadastrada</div>`;
    }
    return recs.map(rowHtml).join('');
  }

  function rowHtml(r) {
    const cat = FinanceService.getCategoriaById(r.categoriaId);
    const conta = FinanceService.getContaById(r.contaId);
    const isEntrada = r.tipo === 'entrada';
    const cor = isEntrada ? 'var(--green)' : 'var(--red)';
    const prox = FinanceService.proximaData(r, Utils.today());
    const sub = [cat?.nome, conta?.nome].filter(Boolean).join(' · ');
    const proxTxt = prox ? `próxima ${Utils.fmtDayMonth(prox)}` : 'sem próxima';
    const tag = r.ehAssinatura ? `<span class="rec-tag">assinatura</span>` : '';
    return `<div class="rec-row ${r.ativa ? '' : 'rec-paused'}" onclick="FinanceRecorrencias.openEdit('${r.id}')">
      <div class="rec-info">
        <div class="rec-title">${Utils.escapeHtml(r.descricao || cat?.nome || 'Recorrência')} ${tag}</div>
        <div class="rec-meta">${Utils.escapeHtml(periodoTxt(r))} · ${Utils.escapeHtml(sub)}</div>
        <div class="rec-meta">${proxTxt}</div>
      </div>
      <div class="rec-amount" style="color:${cor}">${isEntrada ? '+' : '−'}${Utils.formatBRL(r.valorCentavos)}</div>
      <div class="rec-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" title="${r.ativa ? 'Pausar' : 'Ativar'}"
                onclick="FinanceRecorrencias.toggle('${r.id}')">
          <i class="ti ${r.ativa ? 'ti-player-pause' : 'ti-player-play'}"></i>
        </button>
        <button class="icon-btn" title="Excluir" onclick="FinanceRecorrencias.remove('${r.id}')">
          <i class="ti ti-x"></i>
        </button>
      </div>
    </div>`;
  }

  /** "todo dia 5" (mensal) ou "anual em 05/03" (anual). */
  function periodoTxt(r) {
    if (r.frequencia === 'anual') {
      const dia = String(r.diaDoMes).padStart(2, '0');
      const mes = String(r.mesDoAno || 1).padStart(2, '0');
      return `anual em ${dia}/${mes}`;
    }
    return `todo dia ${r.diaDoMes}`;
  }

  // ===== Subseção: próximos lançamentos do mês =====

  function proximosHtml(mes) {
    const items = FinanceService.getProximasOcorrencias(mes);
    if (!items.length) return '';
    const rows = items.map(o => {
      const isEntrada = o.tipo === 'entrada';
      const cor = isEntrada ? 'var(--green)' : 'var(--red)';
      return `<div class="rec-prox-row">
        <span class="rec-prox-date">${Utils.fmtDayMonth(o.data)}</span>
        <span class="rec-prox-desc">${Utils.escapeHtml(o.descricao || 'Lançamento')}</span>
        <span class="rec-prox-val" style="color:${cor}">${isEntrada ? '+' : '−'}${Utils.formatBRL(o.valorCentavos)}</span>
      </div>`;
    }).join('');
    return `<div class="rec-sub-head">Próximos lançamentos do mês</div>${rows}`;
  }

  // ===== Subseção: assinaturas =====

  function assinaturasHtml() {
    const assin = FinanceService.listAssinaturas();
    if (!assin.length) return '';
    const total = assin.reduce((s, r) =>
      s + (r.frequencia === 'anual' ? Math.round(r.valorCentavos / 12) : r.valorCentavos), 0);
    const rows = assin.map(r => {
      const conta = FinanceService.getContaById(r.contaId);
      return `<div class="rec-prox-row">
        <span class="rec-prox-desc">${Utils.escapeHtml(r.descricao || 'Assinatura')}</span>
        <span class="rec-prox-sub">${Utils.escapeHtml(conta?.nome || '')}</span>
        <span class="rec-prox-val" style="color:var(--red)">${Utils.formatBRL(r.valorCentavos)}</span>
      </div>`;
    }).join('');
    return `<div class="rec-sub-head">Assinaturas
      <span class="rec-sub-total">${Utils.formatBRL(total)}/mês</span>
    </div>${rows}`;
  }

  // ===== Modal =====

  function openNew() {
    _start({ tipo: 'saida', frequencia: 'mensal', diaDoMes: Utils.parseISO(Utils.today()).getDate(),
             dataInicio: Utils.today() }, null, 'Nova recorrência');
  }

  function openEdit(id) {
    const r = FinanceService.getRecorrenciaById(id);
    if (!r) return;
    _start(r, id, 'Editar recorrência');
  }

  function _start(r, editId, title) {
    _editId = editId;
    document.getElementById('rec-modal-title').textContent = title;
    document.getElementById('rec-value').value = r.valorCentavos ? centsToInput(r.valorCentavos) : '';
    document.getElementById('rec-desc').value = r.descricao || '';
    document.getElementById('rec-dia').value = r.diaDoMes || 1;
    document.getElementById('rec-inicio').value = r.dataInicio || Utils.today();
    document.getElementById('rec-fim').value = r.dataFim || '';
    document.getElementById('rec-assinatura').checked = !!r.ehAssinatura;
    document.getElementById('rec-freq').value = r.frequencia || 'mensal';
    _fillMeses(r.mesDoAno);
    _fillContas(r.contaId);
    setTipo(r.tipo || 'saida', r.categoriaId);
    onFreqChange();
    document.getElementById('rec-remove-btn').style.display = editId ? '' : 'none';
    Modal.open('rec-modal');
  }

  function centsToInput(c) {
    return ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  }

  function setTipo(tipo, selectedCat) {
    _tipo = tipo;
    document.getElementById('rec-type-saida').classList.toggle('active', tipo === 'saida');
    document.getElementById('rec-type-entrada').classList.toggle('active', tipo === 'entrada');
    _fillCats(tipo, selectedCat);
  }

  function onFreqChange() {
    const anual = document.getElementById('rec-freq').value === 'anual';
    document.getElementById('rec-mes-group').style.display = anual ? '' : 'none';
  }

  function _fillCats(tipo, selectedId) {
    const sel = document.getElementById('rec-cat');
    sel.innerHTML = FinanceService.listCategorias(tipo === 'entrada' ? 'receita' : 'despesa')
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    if (selectedId) sel.value = selectedId;
  }

  function _fillContas(contaId) {
    const sel = document.getElementById('rec-conta');
    sel.innerHTML = FinanceService.listContas()
      .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`)
      .join('');
    if (contaId) sel.value = contaId;
  }

  function _fillMeses(selected) {
    const sel = document.getElementById('rec-mes');
    sel.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    if (selected) sel.value = selected;
  }

  function save() {
    const valorCentavos = Utils.brlToCentavos(document.getElementById('rec-value').value);
    if (!valorCentavos || valorCentavos <= 0) return alert('Informe um valor válido maior que zero');
    const contaId = document.getElementById('rec-conta').value;
    if (!contaId) return alert('Selecione uma conta');

    const dto = {
      tipo: _tipo, valorCentavos,
      descricao: document.getElementById('rec-desc').value.trim(),
      categoriaId: document.getElementById('rec-cat').value,
      contaId,
      frequencia: document.getElementById('rec-freq').value,
      diaDoMes: document.getElementById('rec-dia').value,
      mesDoAno: document.getElementById('rec-mes').value,
      dataInicio: document.getElementById('rec-inicio').value || Utils.today(),
      dataFim: document.getElementById('rec-fim').value || null,
      ehAssinatura: document.getElementById('rec-assinatura').checked
    };

    if (_editId) FinanceService.updateRecorrencia(_editId, dto);
    else FinanceService.addRecorrencia(dto);
    FinanceService.processarRecorrencias();

    Modal.close('rec-modal');
    _rerender();
  }

  function removeCurrent() {
    if (!_editId || !confirm('Excluir esta recorrência? Os lançamentos já gerados permanecem.')) return;
    FinanceService.removeRecorrencia(_editId);
    Modal.close('rec-modal');
    _rerender();
  }

  function remove(id) {
    if (!confirm('Excluir esta recorrência? Os lançamentos já gerados permanecem.')) return;
    FinanceService.removeRecorrencia(id);
    _rerender();
  }

  function toggle(id) {
    FinanceService.toggleAtiva(id);
    FinanceService.processarRecorrencias();
    _rerender();
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  return {
    sectionHtml, openNew, openEdit, save, removeCurrent, remove, toggle,
    setTipo, onFreqChange
  };
})();
