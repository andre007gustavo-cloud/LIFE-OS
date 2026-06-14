/**
 * ===================== FINANCE RELATÓRIOS (Fase 7a) =====================
 * Seção "Relatórios" da view de Finanças: seletor de mês + donut de gastos por
 * categoria, barras da evolução (6 meses), maiores gastos, comparativo vs mês
 * anterior e taxa de poupança. Tudo computado no FinanceService (competência).
 * Componente de UI: lê o serviço e monta HTML/SVG; zero DOM direto (zero libs).
 */

const FinanceRelatorios = (() => {

  let _mes = null; // 'YYYY-MM'; inicializado no 1º render

  function _mesAtivo() {
    if (!_mes) _mes = FinanceService.currentMonthPrefix();
    return _mes;
  }

  /** Navega meses; não passa do mês corrente (sem dados futuros). */
  function setMes(delta) {
    const alvo = FinanceService.addMonths(_mesAtivo(), delta);
    if (alvo > FinanceService.currentMonthPrefix()) return;
    _mes = alvo;
    if (window.FinanceView) FinanceView.render();
  }

  // ===== Rótulos de mês =====

  /** "junho 2026" a partir de 'YYYY-MM'. */
  function _mesAnoLabel(mes) {
    return Utils.parseISO(`${mes}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  /** "jun" a partir de 'YYYY-MM'. */
  function _mesCurto(mes) {
    return Utils.parseISO(`${mes}-01`).toLocaleDateString('pt-BR', { month: 'short' });
  }

  // ===== Seção =====

  function sectionHtml() {
    if (!FinanceService.listContas().length) return '';
    const mes = _mesAtivo();
    const gastos = FinanceService.getGastosPorCategoria(mes);
    const totalSaidas = gastos.reduce((s, g) => s + g.totalCentavos, 0);
    return `<div class="card fin-rel-section">
      <div class="card-title fin-rel-title">
        <span><i class="ti ti-chart-pie"></i> Relatórios</span>
        ${seletorMesHtml(mes)}
      </div>
      ${taxaPoupancaHtml(mes)}
      ${donutHtml(gastos, totalSaidas)}
      ${evolucaoHtml()}
      ${maioresGastosHtml(mes)}
      ${comparativoHtml(mes)}
    </div>`;
  }

  function seletorMesHtml(mes) {
    const noAtual = mes >= FinanceService.currentMonthPrefix();
    return `<div class="fin-rel-mes">
      <button class="fin-rel-nav" onclick="FinanceRelatorios.setMes(-1)" title="Mês anterior"><i class="ti ti-chevron-left"></i></button>
      <span class="fin-rel-mes-label">${Utils.escapeHtml(_mesAnoLabel(mes))}</span>
      <button class="fin-rel-nav" onclick="FinanceRelatorios.setMes(1)" title="Próximo mês" ${noAtual ? 'disabled' : ''}><i class="ti ti-chevron-right"></i></button>
    </div>`;
  }

  // ===== Taxa de poupança (destaque) =====

  function taxaPoupancaHtml(mes) {
    const taxa = FinanceService.getTaxaPoupanca(mes);
    const pct = Math.round(taxa * 100);
    const cor = taxa > 0 ? 'var(--green)' : taxa < 0 ? 'var(--red)' : 'var(--text2)';
    return `<div class="fin-rel-poupanca">
      <span class="fin-rel-poupanca-label">Taxa de poupança</span>
      <span class="fin-rel-poupanca-val" style="color:${cor}">${pct}%</span>
    </div>`;
  }

  // ===== Donut: gastos por categoria =====

  function donutHtml(gastos, totalSaidas) {
    if (!gastos.length || totalSaidas <= 0) {
      return `<div class="fin-rel-empty">Sem despesas neste mês</div>`;
    }
    const CX = 70, CY = 70, R = 54, SW = 22, C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = gastos.map(g => {
      const len = g.totalCentavos / totalSaidas * C;
      const seg = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${g.cor}"
        stroke-width="${SW}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
        stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
      acc += len;
      return seg;
    }).join('');

    const legenda = gastos.map(g => `<div class="fin-rel-leg-row">
      <span class="fin-rel-leg-dot" style="background:${g.cor}"></span>
      <span class="fin-rel-leg-nome">${Utils.escapeHtml(g.nome)}</span>
      <span class="fin-rel-leg-pct">${Math.round(g.percentual)}%</span>
      <span class="fin-rel-leg-val">${Utils.formatBRL(g.totalCentavos)}</span>
    </div>`).join('');

    return `<div class="fin-rel-donut-wrap">
      <div class="fin-rel-donut">
        <svg viewBox="0 0 140 140" style="width:140px;height:140px;display:block">
          ${arcos}
          <text x="70" y="66" text-anchor="middle" class="fin-rel-donut-c1">Saídas</text>
          <text x="70" y="84" text-anchor="middle" class="fin-rel-donut-c2">${Utils.formatBRL(totalSaidas)}</text>
        </svg>
      </div>
      <div class="fin-rel-legenda">${legenda}</div>
    </div>`;
  }

  // ===== Barras: evolução (6 meses) =====

  function evolucaoHtml() {
    const evol = FinanceService.getEvolucaoMensal(6);
    const W = 320, H = 120, padT = 8, padB = 4;
    const plotH = H - padT - padB;
    const max = Math.max(1, ...evol.flatMap(m => [m.entradasCentavos, m.saidasCentavos]));
    const n = evol.length;
    const groupW = W / n;
    const barW = groupW * 0.28;
    const gap = groupW * 0.06;
    const base = padT + plotH;
    const y = v => padT + plotH * (1 - v / max);

    const rects = evol.map((m, i) => {
      const cx = groupW * i + groupW / 2;
      const xe = cx - barW - gap / 2, xs = cx + gap / 2;
      const ye = y(m.entradasCentavos), ys = y(m.saidasCentavos);
      return `<rect x="${xe.toFixed(1)}" y="${ye.toFixed(1)}" width="${barW.toFixed(1)}" height="${(base - ye).toFixed(1)}" rx="2" fill="var(--green)"/>
        <rect x="${xs.toFixed(1)}" y="${ys.toFixed(1)}" width="${barW.toFixed(1)}" height="${(base - ys).toFixed(1)}" rx="2" fill="var(--red)"/>`;
    }).join('');

    const cols = evol.map(m => {
      const cor = m.saldoMesCentavos >= 0 ? 'var(--green)' : 'var(--red)';
      return `<div class="fin-rel-evo-col">
        <span class="fin-rel-evo-mes">${Utils.escapeHtml(_mesCurto(m.mes))}</span>
        <span class="fin-rel-evo-saldo" style="color:${cor}">${_compactBRL(m.saldoMesCentavos)}</span>
      </div>`;
    }).join('');

    return `<div class="fin-rel-evo">
      <div class="fin-rel-sub-head">Evolução (6 meses)</div>
      <div class="fin-rel-evo-legend">
        <span><span class="fin-rel-leg-dot" style="background:var(--green)"></span>Entradas</span>
        <span><span class="fin-rel-leg-dot" style="background:var(--red)"></span>Saídas</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${rects}</svg>
      <div class="fin-rel-evo-cols">${cols}</div>
    </div>`;
  }

  /** "R$ 1,2k" / "R$ 85" — saldo curto para caber sob a barra. */
  function _compactBRL(centavos) {
    const reais = centavos / 100;
    const abs = Math.abs(reais);
    const sinal = reais < 0 ? '−' : '';
    if (abs >= 1000) return `${sinal}R$ ${(abs / 1000).toFixed(1).replace('.', ',')}k`;
    return `${sinal}R$ ${Math.round(abs)}`;
  }

  // ===== Maiores gastos =====

  function maioresGastosHtml(mes) {
    const gastos = FinanceService.getMaioresGastos(mes, 5);
    if (!gastos.length) return '';
    const linhas = gastos.map(g => `<div class="fin-rel-top-row">
      <div class="fin-rel-top-info">
        <span class="fin-rel-top-desc">${Utils.escapeHtml(g.descricao)}</span>
        <span class="fin-rel-top-cat">${Utils.escapeHtml(g.categoriaNome)} · ${Utils.fmtDayMonth(g.data)}</span>
      </div>
      <span class="fin-rel-top-val">${Utils.formatBRL(g.valorCentavos)}</span>
    </div>`).join('');
    return `<div class="fin-rel-top">
      <div class="fin-rel-sub-head">Maiores gastos do mês</div>
      ${linhas}
    </div>`;
  }

  // ===== Comparativo vs mês anterior =====

  function comparativoHtml(mes) {
    const comp = FinanceService.getComparativoMes(mes);
    const subiram = comp.porCategoria.filter(c => c.atualCentavos > c.anteriorCentavos).slice(0, 3);
    const cairam = comp.porCategoria
      .filter(c => c.atualCentavos < c.anteriorCentavos)
      .slice(-3).reverse();

    return `<div class="fin-rel-comp">
      <div class="fin-rel-sub-head">Comparativo com o mês anterior</div>
      <div class="fin-rel-comp-total">
        <span>Total de saídas</span>
        <span>${Utils.formatBRL(comp.totalSaidasCentavos)} ${_variacaoBadge(comp.variacaoPct)}</span>
      </div>
      ${subiram.length ? `<div class="fin-rel-comp-grp">
        <div class="fin-rel-comp-grp-head">Subiram</div>
        ${subiram.map(c => _comparativoRowHtml(c)).join('')}
      </div>` : ''}
      ${cairam.length ? `<div class="fin-rel-comp-grp">
        <div class="fin-rel-comp-grp-head">Caíram</div>
        ${cairam.map(c => _comparativoRowHtml(c)).join('')}
      </div>` : ''}
    </div>`;
  }

  function _comparativoRowHtml(c) {
    return `<div class="fin-rel-comp-row">
      <span class="fin-rel-comp-nome">${Utils.escapeHtml(c.nome)}</span>
      <span class="fin-rel-comp-vals">
        ${Utils.formatBRL(c.anteriorCentavos)} → ${Utils.formatBRL(c.atualCentavos)}
        ${_variacaoBadge(c.variacaoPct)}
      </span>
    </div>`;
  }

  /** Badge de variação %: ↑ vermelho (gastou mais), ↓ verde (gastou menos), "novo" se sem base. */
  function _variacaoBadge(pct) {
    if (pct === null) return `<span class="fin-rel-badge novo">novo</span>`;
    const arred = Math.round(pct);
    if (arred === 0) return `<span class="fin-rel-badge zero">0%</span>`;
    const subiu = arred > 0;
    return `<span class="fin-rel-badge ${subiu ? 'sobe' : 'desce'}">
      ${subiu ? '↑' : '↓'} ${Math.abs(arred)}%</span>`;
  }

  return { sectionHtml, setMes };
})();
