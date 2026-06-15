/**
 * ===================== FINANCE IMPORT (Fase 8) =====================
 * Componente "Importar OFX": fluxo único reusado pela central de Finanças e
 * pelos atalhos contextuais (detalhe do cartão). Etapas:
 *   upload → detecta tipo → escolhe alvo → revisa → confirma → resumo.
 * Histórico de lotes com "Desfazer" na tela de upload.
 *
 * UI: lê OFXService / ImportService / FinanceService / CartaoService.
 * Zero DOM no service; aqui o DOM é só leitura de inputs + innerHTML escapado.
 */

const FinanceImport = (() => {

  let _s = _estadoInicial();

  function _estadoInicial() {
    return {
      step: 'upload',
      tipo: null,                 // 'conta' | 'cartao'
      fixedTipo: null,            // alvo travado por atalho contextual
      arquivo: '',
      periodo: { de: '', ate: '' },
      alvo: { contaId: '', cartaoId: '', competencia: '' },
      linhas: [],
      resumo: null,
      erro: ''
    };
  }

  // ===== Abertura =====

  function openCentral() {
    _s = _estadoInicial();
    Modal.open('import-modal');
    _render();
  }

  /** Atalho do detalhe do cartão: já entra com o cartão pré-selecionado. */
  function openForCartao(cartaoId) {
    _s = _estadoInicial();
    _s.fixedTipo = 'cartao';
    _s.alvo.cartaoId = cartaoId || '';
    Modal.open('import-modal');
    _render();
  }

  function close() {
    Modal.close('import-modal');
  }

  // ===== Upload + parse =====

  function onFile(input) {
    const file = input && input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => _processarArquivo(file.name, ev.target.result);
    reader.onerror = () => { _s.erro = 'Não consegui ler o arquivo.'; _render(); };
    reader.readAsArrayBuffer(file);
  }

  function _processarArquivo(nome, buffer) {
    const texto = OFXService.decodeBuffer(buffer);
    const parsed = OFXService.parseOFX(texto);
    if (!parsed.tipo) {
      _s.erro = 'Arquivo OFX não reconhecido (sem extrato nem fatura).';
      _render();
      return;
    }
    _s.erro = '';
    _s.arquivo = nome;
    _s.tipo = parsed.tipo;
    _s.periodo = parsed.periodo;
    _s.linhas = parsed.linhas.map(_prepararLinha.bind(null, parsed.tipo));
    _s.step = 'target';
    _resolverSugestaoCompetencia();
    _render();
  }

  /** Detecta pagamento de fatura no extrato (fora do orçamento, sem categoria). */
  function _ehPagamentoFatura(descricao) {
    const t = Utils.normalizeText(descricao);
    return /pagamento/.test(t) && /(fatura|cartao)/.test(t);
  }

  /** Enriquece a linha parseada com decisões da revisão (incluir, categoria sugerida). */
  function _prepararLinha(tipoArquivo, l) {
    const isCredit = l.tipoMov === 'CREDIT';
    const tipoMov = isCredit ? 'entrada' : 'saida';
    const jaImportado = ImportService.fitidExiste(l.fitid);
    const pagamentoFatura = tipoArquivo === 'conta' && _ehPagamentoFatura(l.descricaoBase);

    let categoriaId = '';
    if (!pagamentoFatura) {
      const sug = FinanceService.sugerirCategoria(l.descricaoBase, tipoMov);
      categoriaId = sug ? sug.categoriaId : '';
    }

    // Padrão: fatura desmarca créditos; conta inclui tudo. Já importado nunca vem marcado.
    let incluir;
    if (jaImportado) incluir = false;
    else if (tipoArquivo === 'cartao') incluir = !isCredit;
    else incluir = true;

    return { ...l, categoriaId, incluir, jaImportado, pagamentoFatura };
  }

  function _resolverSugestaoCompetencia() {
    if (_s.tipo !== 'cartao') return;
    if (!_s.alvo.cartaoId) _s.alvo.cartaoId = (CartaoService.listCartoes()[0] || {}).id || '';
    const cartao = CartaoService.getCartaoById(_s.alvo.cartaoId);
    const refData = _s.periodo.ate || _s.periodo.de || Utils.today();
    _s.alvo.competencia = cartao
      ? CartaoService.competenciaDaCompra(cartao, refData)
      : refData.slice(0, 7);
  }

  // ===== Setters da revisão / alvo =====

  function setConta(v) { _s.alvo.contaId = v; }
  function setCartao(v) { _s.alvo.cartaoId = v; _resolverSugestaoCompetencia(); _render(); }
  function setCompetencia(v) { _s.alvo.competencia = v; }
  function toggleLinha(i) { if (_s.linhas[i] && !_s.linhas[i].jaImportado) _s.linhas[i].incluir = !_s.linhas[i].incluir; }
  function setLinhaCategoria(i, v) { if (_s.linhas[i]) _s.linhas[i].categoriaId = v; }

  function irParaRevisao() {
    if (_s.tipo === 'conta' && !_s.alvo.contaId) { alert('Escolha a conta de destino.'); return; }
    if (_s.tipo === 'cartao') {
      if (!_s.alvo.cartaoId) { alert('Escolha o cartão.'); return; }
      if (!/^\d{4}-\d{2}$/.test(_s.alvo.competencia)) { alert('Informe a competência (mês).'); return; }
    }
    _s.step = 'review';
    _render();
  }

  function voltar(step) { _s.step = step; _render(); }

  // ===== Confirmar =====

  function confirmar() {
    const linhas = _s.linhas.map(l => ({
      data: l.data, descricaoBase: l.descricaoBase, valorCentavos: l.valorCentavos,
      tipoMov: l.tipoMov, fitid: l.fitid, parcela: l.parcela,
      categoriaId: l.categoriaId, incluir: l.incluir && !l.jaImportado,
      pagamentoFatura: l.pagamentoFatura
    }));
    _s.resumo = _s.tipo === 'cartao'
      ? ImportService.importarFaturaOFX({ cartaoId: _s.alvo.cartaoId, competencia: _s.alvo.competencia, linhas, arquivo: _s.arquivo })
      : ImportService.importarExtrato({ contaId: _s.alvo.contaId, linhas, arquivo: _s.arquivo });
    _s.step = 'resumo';
    _render();
    _rerender();
  }

  function desfazer(loteId) {
    if (!confirm('Desfazer esta importação? Os lançamentos criados serão removidos.')) return;
    ImportService.desfazerImportacao(loteId);
    _render();
    _rerender();
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
    if (window.DashboardView) DashboardView.render();
  }

  // ===== Render =====

  function _render() {
    const el = document.getElementById('import-content');
    if (!el) return;
    if (_s.step === 'resumo') el.innerHTML = _resumoHtml();
    else if (_s.step === 'review') el.innerHTML = _reviewHtml();
    else if (_s.step === 'target') el.innerHTML = _targetHtml();
    else el.innerHTML = _uploadHtml();
  }

  function _erroHtml() {
    return _s.erro ? `<div class="import-erro">${Utils.escapeHtml(_s.erro)}</div>` : '';
  }

  function _uploadHtml() {
    return `
      ${_erroHtml()}
      <p class="import-hint">Envie o arquivo <strong>.ofx</strong> do Nubank. O app detecta sozinho se é extrato (conta) ou fatura (cartão).</p>
      <label class="import-drop">
        <input type="file" accept=".ofx" onchange="FinanceImport.onFile(this)" style="display:none">
        <i class="ti ti-upload"></i>
        <span>Escolher arquivo .ofx</span>
      </label>
      ${_historicoHtml()}`;
  }

  function _historicoHtml() {
    const lotes = ImportService.listImportacoes();
    if (!lotes.length) return '';
    const rows = lotes.map(l => {
      const alvo = l.tipo === 'cartao'
        ? (CartaoService.getCartaoById(l.alvoId) || {}).nome
        : (FinanceService.getContaById(l.alvoId) || {}).nome;
      const tipoLabel = l.tipo === 'cartao' ? '💳 Fatura' : '🏦 Extrato';
      const data = (l.criadoEm || '').slice(0, 10);
      return `<div class="import-hist-row">
        <div class="import-hist-info">
          <div class="import-hist-titulo">${tipoLabel} · ${Utils.escapeHtml(alvo || '—')}${l.competencia ? ' · ' + Utils.escapeHtml(l.competencia) : ''}</div>
          <div class="import-hist-sub">${Utils.escapeHtml(l.arquivo || '')} · ${l.criados} criado${l.criados !== 1 ? 's' : ''} · ${Utils.escapeHtml(data)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="FinanceImport.desfazer('${l.id}')">
          <i class="ti ti-arrow-back-up"></i> Desfazer
        </button>
      </div>`;
    }).join('');
    return `<div class="import-hist">
      <div class="import-hist-head">Importações recentes</div>
      ${rows}
    </div>`;
  }

  function _targetHtml() {
    const erroTipo = _s.fixedTipo && _s.tipo !== _s.fixedTipo
      ? `<div class="import-erro">Este arquivo é um ${_s.tipo === 'cartao' ? 'fatura de cartão' : 'extrato de conta'}, mas você abriu a importação de ${_s.fixedTipo === 'cartao' ? 'cartão' : 'conta'}.</div>`
      : '';
    const tipoLabel = _s.tipo === 'cartao' ? 'Fatura de cartão' : 'Extrato de conta';
    const periodo = _s.periodo.de || _s.periodo.ate
      ? `<div class="import-meta">Período: ${Utils.escapeHtml(_s.periodo.de || '?')} a ${Utils.escapeHtml(_s.periodo.ate || '?')} · ${_s.linhas.length} lançamentos</div>`
      : `<div class="import-meta">${_s.linhas.length} lançamentos</div>`;

    let campos;
    if (_s.tipo === 'cartao') {
      const cartoes = CartaoService.listCartoes();
      campos = `
        <div class="form-group">
          <label class="form-label">Cartão</label>
          <select class="form-select" onchange="FinanceImport.setCartao(this.value)">
            ${cartoes.map(c => `<option value="${c.id}" ${c.id === _s.alvo.cartaoId ? 'selected' : ''}>${Utils.escapeHtml(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Competência (mês da fatura)</label>
          <input class="form-input" type="month" value="${Utils.escapeAttr(_s.alvo.competencia)}" onchange="FinanceImport.setCompetencia(this.value)">
        </div>`;
    } else {
      const contas = FinanceService.listContas();
      if (!_s.alvo.contaId) _s.alvo.contaId = (contas[0] || {}).id || '';
      campos = `
        <div class="form-group">
          <label class="form-label">Conta de destino</label>
          <select class="form-select" onchange="FinanceImport.setConta(this.value)">
            ${contas.map(c => `<option value="${c.id}" ${c.id === _s.alvo.contaId ? 'selected' : ''}>${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`).join('')}
          </select>
        </div>`;
    }

    return `
      ${erroTipo}
      <div class="import-detected"><span class="import-badge">${tipoLabel}</span> ${Utils.escapeHtml(_s.arquivo)}</div>
      ${periodo}
      ${campos}
      <div class="import-actions">
        <button class="btn btn-ghost" onclick="FinanceImport.voltar('upload')">← Voltar</button>
        <button class="btn btn-primary" onclick="FinanceImport.irParaRevisao()">Revisar lançamentos →</button>
      </div>`;
  }

  function _catOptions(tipoMov, selectedId) {
    const cats = FinanceService.listCategorias(tipoMov === 'entrada' ? 'receita' : 'despesa');
    return `<option value="">— sem categoria —</option>` +
      cats.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(c.icone)} ${Utils.escapeHtml(c.nome)}</option>`).join('');
  }

  function _reviewRow(l, i) {
    const isCredit = l.tipoMov === 'CREDIT';
    const cor = isCredit ? 'var(--green)' : 'var(--red)';
    const sinal = isCredit ? '+' : '−';
    const parcBadge = l.parcela ? `<span class="fatura-item-parcela">${l.parcela.num}/${l.parcela.total}</span>` : '';

    let catCell;
    if (l.jaImportado) catCell = `<span class="import-tag-dup">já importado</span>`;
    else if (l.pagamentoFatura) catCell = `<span class="import-tag-pag">pagamento fatura</span>`;
    else catCell = `<select class="form-select import-cat-sel" onchange="FinanceImport.setLinhaCategoria(${i}, this.value)">${_catOptions(l.tipoMov, l.categoriaId)}</select>`;

    return `<div class="import-row ${l.incluir ? '' : 'import-row-off'}">
      <input type="checkbox" ${l.incluir ? 'checked' : ''} ${l.jaImportado ? 'disabled' : ''}
             onchange="FinanceImport.toggleLinha(${i});this.closest('.import-row').classList.toggle('import-row-off',!this.checked)">
      <div class="import-row-main">
        <div class="import-row-desc">${Utils.escapeHtml(l.descricaoBase || 'Lançamento')} ${parcBadge}</div>
        <div class="import-row-sub">${Utils.escapeHtml(Utils.fmtDate(l.data))}</div>
      </div>
      <div class="import-row-cat">${catCell}</div>
      <div class="import-row-val" style="color:${cor}">${sinal}${Utils.formatBRL(l.valorCentavos)}</div>
    </div>`;
  }

  function _reviewHtml() {
    const alvoNome = _s.tipo === 'cartao'
      ? `${(CartaoService.getCartaoById(_s.alvo.cartaoId) || {}).nome || ''} · ${_s.alvo.competencia}`
      : (FinanceService.getContaById(_s.alvo.contaId) || {}).nome || '';
    const marcados = _s.linhas.filter(l => l.incluir).length;
    return `
      <div class="import-detected"><span class="import-badge">${_s.tipo === 'cartao' ? 'Fatura' : 'Extrato'}</span> ${Utils.escapeHtml(alvoNome)}</div>
      <div class="import-review-list">
        ${_s.linhas.map(_reviewRow).join('') || '<div class="text-muted">Nenhum lançamento no arquivo.</div>'}
      </div>
      <div class="import-actions">
        <button class="btn btn-ghost" onclick="FinanceImport.voltar('target')">← Voltar</button>
        <button class="btn btn-primary" onclick="FinanceImport.confirmar()">Importar ${marcados} lançamento${marcados !== 1 ? 's' : ''}</button>
      </div>`;
  }

  function _resumoHtml() {
    const r = _s.resumo || {};
    const linhas = [
      `<strong>${r.criados || 0}</strong> lançamento${r.criados !== 1 ? 's' : ''} criado${r.criados !== 1 ? 's' : ''}`,
      r.futurasCriadas ? `<strong>${r.futurasCriadas}</strong> parcela${r.futurasCriadas !== 1 ? 's' : ''} futura${r.futurasCriadas !== 1 ? 's' : ''} prevista${r.futurasCriadas !== 1 ? 's' : ''}` : '',
      r.duplicadosPulados ? `<strong>${r.duplicadosPulados}</strong> já existia${r.duplicadosPulados !== 1 ? 'm' : ''} (pulado${r.duplicadosPulados !== 1 ? 's' : ''})` : '',
      r.ignorados ? `<strong>${r.ignorados}</strong> ignorado${r.ignorados !== 1 ? 's' : ''}` : ''
    ].filter(Boolean);
    return `
      <div class="import-resumo">
        <i class="ti ti-circle-check"></i>
        <div class="import-resumo-titulo">Importação concluída</div>
        <ul>${linhas.map(t => `<li>${t}</li>`).join('')}</ul>
      </div>
      <div class="import-actions">
        <button class="btn btn-ghost" onclick="FinanceImport.voltar('upload')">Importar outro</button>
        <button class="btn btn-primary" onclick="FinanceImport.close()">Concluir</button>
      </div>`;
  }

  return {
    openCentral, openForCartao, close, onFile,
    setConta, setCartao, setCompetencia, toggleLinha, setLinhaCategoria,
    irParaRevisao, voltar, confirmar, desfazer
  };
})();
