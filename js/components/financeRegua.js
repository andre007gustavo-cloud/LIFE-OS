/**
 * ===================== RÉGUA 50/30/20 (Fase 7f) =====================
 * Seção dentro de Finanças: barra empilhada da proporção real (necessidades /
 * desejos / poupança / não alocado) com marcadores das faixas-alvo 50/30/20,
 * e a tela de classificação das categorias (necessidade/desejo).
 * Componente de UI: lê o FinanceService, formata aqui; nunca toca o Storage.
 */

const FinanceRegua = (() => {

  // Mês exibido na seção (independente do resto da view). 'YYYY-MM'.
  let _mes = null;
  function mes() { return _mes || (_mes = FinanceService.currentMonthPrefix()); }

  function setMes(delta) {
    _mes = FinanceService.addMonths(mes(), delta);
    _rerender();
  }

  function _rerender() {
    if (window.FinanceView) FinanceView.render();
  }

  // ===== Rótulos / estado =====

  function _mesLabel(m) {
    const d = Utils.parseISO(`${m}-01`);
    const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Gasto (necessidade/desejo): dentro do alvo é bom. */
  function _estadoGasto(pct, alvo) {
    if (pct <= alvo) return 'ok';
    if (pct <= alvo * 1.15) return 'alerta';
    return 'acima';
  }

  /** Poupança: alvo é piso — quanto mais, melhor. */
  function _estadoPoupanca(pct, alvo) {
    if (pct >= alvo) return 'ok';
    if (pct >= alvo * 0.6) return 'alerta';
    return 'acima';
  }

  // ===== Seção =====

  function sectionHtml() {
    const m = mes();
    const r = FinanceService.get503020(m);
    const neutro = r.rendaCentavos <= 0;
    return `<div class="card r503-section">
      <div class="r503-header">
        <div class="card-title" style="margin:0"><i class="ti ti-scale"></i> Régua 50/30/20</div>
        <div class="r503-month">
          <button class="icon-btn" title="Mês anterior" onclick="FinanceRegua.setMes(-1)"><i class="ti ti-chevron-left"></i></button>
          <span class="r503-month-label">${Utils.escapeHtml(_mesLabel(m))}</span>
          <button class="icon-btn" title="Próximo mês" onclick="FinanceRegua.setMes(1)"><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
      ${neutro ? _neutroHtml() : _conteudoHtml(r)}
      <button class="btn btn-ghost btn-sm r503-class-btn" onclick="FinanceRegua.openClassificar()">
        <i class="ti ti-tags"></i> Classificar categorias
      </button>
    </div>`;
  }

  function _neutroHtml() {
    return `<div class="r503-neutro">Sem renda registrada neste mês — a régua aparece quando houver entradas.</div>`;
  }

  function _conteudoHtml(r) {
    return `
      <div class="r503-renda">
        <span class="r503-renda-label">Renda do mês</span>
        <span class="r503-renda-val">${Utils.formatBRL(r.rendaCentavos)}</span>
      </div>
      ${stackedBarHtml(r)}
      ${rowHtml('Necessidades', r.necessidades, 'gastoCentavos', _estadoGasto(r.necessidades.pct, r.necessidades.alvoPct), 'nec')}
      ${rowHtml('Desejos', r.desejos, 'gastoCentavos', _estadoGasto(r.desejos.pct, r.desejos.alvoPct), 'des')}
      ${rowHtml('Poupança', r.poupanca, 'valorCentavos', _estadoPoupanca(r.poupanca.pct, r.poupanca.alvoPct), 'poup')}
      ${naoAlocadoHtml(r.naoAlocadoCentavos)}`;
  }

  /** Barra empilhada das proporções reais + marcadores em 50% e 80% (50+30). */
  function stackedBarHtml(r) {
    const nec = Math.max(0, r.necessidades.pct);
    const des = Math.max(0, r.desejos.pct);
    const poup = Math.max(0, r.poupanca.pct);
    const free = Math.max(0, 100 - nec - des - poup);
    const seg = (w, cls, label) => w > 0
      ? `<div class="r503-seg ${cls}" style="width:${w}%" title="${label}"></div>` : '';
    return `<div class="r503-bar">
      ${seg(nec, 'r503-seg-nec', 'Necessidades')}
      ${seg(des, 'r503-seg-des', 'Desejos')}
      ${seg(poup, 'r503-seg-poup', 'Poupança')}
      ${seg(free, 'r503-seg-free', 'Não alocado')}
      <div class="r503-marker" style="left:50%"></div>
      <div class="r503-marker" style="left:80%"></div>
    </div>
    <div class="r503-legend">
      <span><i class="r503-dot r503-seg-nec"></i>Necessidades</span>
      <span><i class="r503-dot r503-seg-des"></i>Desejos</span>
      <span><i class="r503-dot r503-seg-poup"></i>Poupança</span>
      <span><i class="r503-dot r503-seg-free"></i>Não alocado</span>
    </div>`;
  }

  /** Linha de um grupo: % real vs alvo, valor e barra colorida pelo estado. */
  function rowHtml(nome, grupo, valKey, estado, segCls) {
    const w = Math.min(100, Math.max(0, grupo.pct));
    return `<div class="r503-row">
      <div class="r503-row-head">
        <span class="r503-row-nome">${nome}</span>
        <span class="r503-row-pct r503-${estado}">${grupo.pct.toFixed(0)}% <span class="r503-row-alvo">/ meta ${grupo.alvoPct}%</span></span>
      </div>
      <div class="r503-row-bar"><div class="r503-row-fill r503-${estado}" style="width:${w}%"></div></div>
      <div class="r503-row-val">${Utils.formatBRL(grupo[valKey])}</div>
    </div>`;
  }

  function naoAlocadoHtml(centavos) {
    const negativo = centavos < 0;
    const txt = negativo
      ? `Gastou ${Utils.formatBRL(-centavos)} além da renda`
      : `${Utils.formatBRL(centavos)} sobraram sem destino`;
    return `<div class="r503-naoalocado ${negativo ? 'r503-acima' : ''}">
      <span class="r503-na-label">Não alocado</span>
      <span class="r503-na-val">${txt}</span>
    </div>`;
  }

  // ===== Classificação das categorias =====

  function openClassificar() {
    _renderClassBody();
    Modal.open('regua-class-modal');
  }

  function _renderClassBody() {
    const cats = FinanceService.listCategorias('despesa');
    const body = document.getElementById('regua-class-body');
    if (!body) return;
    body.innerHTML = cats.length
      ? cats.map(_classRowHtml).join('')
      : `<div class="text-muted">Nenhuma categoria de despesa ainda.</div>`;
  }

  function _classRowHtml(cat) {
    const g = cat.grupo503020 || 'desejo';
    const btn = (grupo, label) =>
      `<button class="r503-class-opt ${g === grupo ? 'active r503-' + grupo : ''}"
               onclick="FinanceRegua.setGrupo('${cat.id}','${grupo}')">${label}</button>`;
    return `<div class="r503-class-row">
      <span class="r503-class-cat">${Utils.escapeHtml(`${cat.icone || '📦'} ${cat.nome}`)}</span>
      <div class="r503-class-opts">
        ${btn('necessidade', 'Necessidade')}
        ${btn('desejo', 'Desejo')}
      </div>
    </div>`;
  }

  function setGrupo(catId, grupo) {
    FinanceService.setGrupoCategoria(catId, grupo);
    _renderClassBody();
    _rerender();
  }

  return { sectionHtml, setMes, openClassificar, setGrupo };
})();
