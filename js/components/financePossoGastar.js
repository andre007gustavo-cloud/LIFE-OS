/**
 * ===================== FINANCE "POSSO GASTAR?" (Fase 7c) =====================
 * Simulador de compra: dado um valor + categoria + conta/cartão, mostra o impacto
 * no orçamento da categoria (competência) e na projeção de caixa de fim de mês,
 * com um veredito colorido. NADA é persistido até "Lançar assim mesmo".
 * Componente de UI: lê o FinanceService/CartaoService, nunca o Storage direto.
 */

const FinancePossoGastar = (() => {

  let _modo = 'conta';   // 'conta' | 'cartao'
  let _ultimaSim = null; // campos da última simulação, p/ "Lançar assim mesmo"

  const NIVEL = {
    ok:      { cor: 'var(--green)', icone: 'ti-circle-check' },
    atencao: { cor: 'var(--amber)', icone: 'ti-alert-triangle' },
    cuidado: { cor: 'var(--red)',   icone: 'ti-alert-octagon' }
  };

  // ===== Abrir / preencher =====

  function open() {
    _fillSelects();
    _modo = 'conta';
    _applyModo();
    document.getElementById('pg-valor').value = '';
    document.getElementById('pg-parcelas').value = '1';
    document.getElementById('pg-data').value = Utils.today();
    document.getElementById('pg-resultado').innerHTML = '';
    _ultimaSim = null;
    Modal.open('posso-gastar-modal');
    setTimeout(() => document.getElementById('pg-valor').focus(), 30);
  }

  function _fillSelects() {
    document.getElementById('pg-cat').innerHTML =
      `<option value="">— sem categoria —</option>` +
      FinanceService.listCategorias('despesa')
        .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`).join('');
    document.getElementById('pg-conta').innerHTML =
      FinanceService.listContas()
        .map(c => `<option value="${c.id}">${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`).join('');
    const cartoes = window.CartaoService ? CartaoService.listCartoes() : [];
    document.getElementById('pg-cartao').innerHTML =
      cartoes.map(c => `<option value="${c.id}">💳 ${Utils.escapeHtml(c.nome)}</option>`).join('');
    document.getElementById('pg-modo-cartao').style.display = cartoes.length ? '' : 'none';
  }

  function setModo(m) { _modo = m; _applyModo(); }

  function _applyModo() {
    const cartao = _modo === 'cartao';
    document.getElementById('pg-modo-conta').classList.toggle('active', !cartao);
    document.getElementById('pg-modo-cartao').classList.toggle('active', cartao);
    document.getElementById('pg-conta-group').style.display = cartao ? 'none' : '';
    document.getElementById('pg-cartao-group').style.display = cartao ? '' : 'none';
    document.getElementById('pg-parcelas-group').style.display = cartao ? '' : 'none';
  }

  // ===== Simular =====

  function _lerCampos() {
    const valorCentavos = Utils.brlToCentavos(document.getElementById('pg-valor').value);
    const categoriaId = document.getElementById('pg-cat').value || '';
    const data = document.getElementById('pg-data').value || Utils.today();
    if (_modo === 'cartao') {
      return {
        valorCentavos, categoriaId, cartaoId: document.getElementById('pg-cartao').value,
        parcelas: Math.max(1, parseInt(document.getElementById('pg-parcelas').value || '1', 10)), data
      };
    }
    return { valorCentavos, categoriaId, contaId: document.getElementById('pg-conta').value, data };
  }

  function simular() {
    const campos = _lerCampos();
    if (!campos.valorCentavos || campos.valorCentavos <= 0) return Modal.toast('Informe um valor');
    if (_modo === 'cartao' && !campos.cartaoId) return Modal.toast('Selecione um cartão');
    if (_modo !== 'cartao' && !campos.contaId) return Modal.toast('Selecione uma conta');
    const sim = FinanceService.simularGasto(campos);
    _ultimaSim = campos;
    document.getElementById('pg-resultado').innerHTML = _resultadoHtml(sim);
  }

  /** Cria a transação de verdade (à vista/parcelada, conta/cartão). */
  function lancar() {
    if (!_ultimaSim) return;
    const f = _ultimaSim;
    const cat = f.categoriaId && FinanceService.getCategoriaById(f.categoriaId);
    const descricao = cat ? cat.nome : 'Compra';
    if (f.cartaoId) {
      CartaoService.addCompraCartao({
        cartaoId: f.cartaoId, descricao, categoriaId: f.categoriaId,
        valorTotalCentavos: f.valorCentavos, parcelas: f.parcelas, dataCompra: f.data
      });
    } else {
      FinanceService.addTransaction({
        tipo: 'saida', valorCentavos: f.valorCentavos, descricao,
        categoriaId: f.categoriaId, contaId: f.contaId, data: f.data, fonte: 'manual'
      });
    }
    Modal.close('posso-gastar-modal');
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
    Modal.toast('Lançamento criado');
  }

  // ===== Render do resultado =====

  function _resultadoHtml(sim) {
    return `<div class="pg-result">
      ${_vereditoHtml(sim.veredito)}
      ${_orcamentoHtml(sim.orcamento)}
      ${_projecaoHtml(sim.projecao)}
      <button class="btn btn-ghost pg-lancar" onclick="FinancePossoGastar.lancar()">
        <i class="ti ti-plus"></i> Lançar assim mesmo</button>
    </div>`;
  }

  function _vereditoHtml(v) {
    const n = NIVEL[v.nivel] || NIVEL.ok;
    return `<div class="pg-veredito" style="--pg-cor:${n.cor}">
      <i class="ti ${n.icone}"></i>
      <span>${Utils.escapeHtml(v.mensagem)}</span>
    </div>`;
  }

  function _orcamentoHtml(o) {
    if (!o) {
      return `<div class="pg-bloco">
        <div class="pg-bloco-head">Orçamento</div>
        <div class="pg-muted">Sem categoria — sem controle de orçamento</div>
      </div>`;
    }
    if (!o.temOrcamento) {
      return `<div class="pg-bloco">
        <div class="pg-bloco-head">Orçamento · ${Utils.escapeHtml(o.categoriaNome)}</div>
        <div class="pg-muted">Sem orçamento definido para esta categoria</div>
      </div>`;
    }
    const corEstado = o.estadoDepois === 'estourado' ? 'var(--red)'
      : o.estadoDepois === 'alerta' ? 'var(--amber)' : 'var(--green)';
    const restanteCor = o.restanteDepoisCentavos < 0 ? 'var(--red)' : 'var(--text)';
    const pct = Math.min(100, Math.max(0, o.percentualDepois));
    return `<div class="pg-bloco">
      <div class="pg-bloco-head">Orçamento · ${Utils.escapeHtml(o.categoriaNome)}</div>
      <div class="pg-linha">
        <span>${Utils.formatBRL(o.gastoAtualCentavos)} → <strong>${Utils.formatBRL(o.gastoDepoisCentavos)}</strong> de ${Utils.formatBRL(o.limiteCentavos)}</span>
        <span style="color:${corEstado};font-weight:700">${o.percentualDepois}%</span>
      </div>
      <div class="pg-bar"><div class="pg-bar-fill" style="width:${pct}%;background:${corEstado}"></div></div>
      <div class="pg-linha">
        <span class="pg-muted">${o.restanteDepoisCentavos < 0 ? 'Excede o limite em' : 'Restaria'}</span>
        <span style="color:${restanteCor};font-weight:600">${Utils.formatBRL(Math.abs(o.restanteDepoisCentavos))}</span>
      </div>
    </div>`;
  }

  function _projecaoHtml(p) {
    const corDepois = p.saldoFimMesDepoisCentavos < 0 ? 'var(--red)' : 'var(--text)';
    const menor = p.menorSaldoDepois;
    const menorCor = menor.valorCentavos < 0 ? 'var(--red)' : 'var(--text)';
    return `<div class="pg-bloco">
      <div class="pg-bloco-head">Projeção de caixa (fim do mês)</div>
      <div class="pg-linha">
        <span>${Utils.formatBRL(p.saldoFimMesAntesCentavos)} → <strong style="color:${corDepois}">${Utils.formatBRL(p.saldoFimMesDepoisCentavos)}</strong></span>
      </div>
      <div class="pg-linha">
        <span class="pg-muted">Menor saldo no período</span>
        <span style="color:${menorCor};font-weight:600">${Utils.formatBRL(menor.valorCentavos)} · ${Utils.fmtDayMonth(menor.data)}</span>
      </div>
      ${p.ficaNegativoDepois ? `<div class="pg-neg"><i class="ti ti-alert-triangle"></i> Fica no vermelho dentro do mês</div>` : ''}
    </div>`;
  }

  // ===== Pontos de entrada =====

  /** Botão para a view de Finanças. */
  function buttonHtml() {
    if (!FinanceService.listContas().length) return '';
    return `<button class="btn btn-ghost fin-pg-btn" onclick="FinancePossoGastar.open()">
      <i class="ti ti-wallet"></i> Posso gastar isso?</button>`;
  }

  /** Conteúdo do card do Dashboard. */
  function dashHtml() {
    if (!FinanceService.listContas().length) return '';
    return `<button class="btn btn-primary fin-pg-dash-btn" onclick="FinancePossoGastar.open()">
      <i class="ti ti-wallet"></i> Simular um gasto</button>`;
  }

  return { open, setModo, simular, lancar, buttonHtml, dashHtml };
})();
