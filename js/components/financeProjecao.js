/**
 * ===================== FINANCE PROJEÇÃO (Fase 6) =====================
 * Seção "Projeção" da view de Finanças: saldo de hoje → saldo projetado no fim
 * do horizonte, gráfico de linha em SVG montado à mão (zero libs), aviso de
 * saldo negativo e a lista cronológica dos eventos de caixa futuros.
 * Componente de UI: lê FinanceService, zero DOM direto (só monta HTML/SVG).
 */

const FinanceProjecao = (() => {

  let _horizonte = 'mes'; // 'mes' | '30' | '60' | '90'

  const OPCOES = [
    { key: 'mes', label: 'Fim do mês' },
    { key: '30', label: '30 dias' },
    { key: '60', label: '60 dias' },
    { key: '90', label: '90 dias' }
  ];

  const ICONES = {
    entrada: '🟢', saida: '🔴', recorrencia: '🔁', fatura: '💳', planejado: '📌'
  };

  function _opcoesProjecao() {
    return _horizonte === 'mes' ? {} : { dias: parseInt(_horizonte, 10) };
  }

  function setHorizonte(key) {
    _horizonte = key;
    if (window.FinanceView) FinanceView.render();
  }

  // ===== Seção da view de Finanças =====

  function sectionHtml() {
    if (!FinanceService.listContas().length) return '';
    const proj = FinanceService.getProjecaoSaldo(_opcoesProjecao());
    return `<div class="card fin-proj-section">
      <div class="card-title fin-proj-title">
        <span><i class="ti ti-chart-line"></i> Projeção</span>
        ${seletorHtml()}
      </div>
      ${topoHtml(proj)}
      ${avisoHtml(proj)}
      ${chartHtml(proj)}
      ${eventosHtml(proj)}
    </div>`;
  }

  function seletorHtml() {
    return `<div class="fin-proj-seletor">${OPCOES.map(o =>
      `<button class="fin-proj-opt${o.key === _horizonte ? ' active' : ''}"
        onclick="FinanceProjecao.setHorizonte('${o.key}')">${o.label}</button>`).join('')}</div>`;
  }

  function topoHtml(proj) {
    const cor = proj.saldoFinalCentavos >= 0 ? 'var(--green)' : 'var(--red)';
    const fim = proj.pontos.length ? proj.pontos[proj.pontos.length - 1].data : Utils.today();
    return `<div class="fin-proj-topo">
      <div class="fin-proj-num">
        <div class="fin-proj-num-label">Saldo hoje</div>
        <div class="fin-proj-num-val">${Utils.formatBRL(proj.saldoInicialCentavos)}</div>
      </div>
      <i class="ti ti-arrow-right fin-proj-arrow"></i>
      <div class="fin-proj-num right">
        <div class="fin-proj-num-label">Projeção · ${Utils.fmtDayMonth(fim)}</div>
        <div class="fin-proj-num-val" style="color:${cor}">${Utils.formatBRL(proj.saldoFinalCentavos)}</div>
      </div>
    </div>`;
  }

  function avisoHtml(proj) {
    if (!proj.ficaNegativo && proj.menorSaldo.valorCentavos >= 0) return '';
    return `<div class="fin-proj-aviso">
      <i class="ti ti-alert-triangle"></i>
      <span>Seu saldo chega a <strong>${Utils.formatBRL(proj.menorSaldo.valorCentavos)}</strong>
        em ${Utils.fmtDayMonth(proj.menorSaldo.data)}</span>
    </div>`;
  }

  // ===== Gráfico de linha (SVG puro) =====

  function chartHtml(proj) {
    const pts = proj.pontos;
    if (pts.length < 2) return '';
    const W = 320, H = 130, padX = 6, padT = 10, padB = 10;
    const vals = pts.map(p => p.saldoCentavos);
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    if (min === max) max = min + 1;
    const n = pts.length;
    const x = i => padX + (W - 2 * padX) * (i / (n - 1));
    const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
    const yZero = y(0);

    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.saldoCentavos).toFixed(1)}`).join(' ');
    const yBase = y(min).toFixed(1);
    const area = `${x(0).toFixed(1)},${yBase} ${line} ${x(n - 1).toFixed(1)},${yBase}`;

    const minIdx = pts.findIndex(p => p.data === proj.menorSaldo.data);
    const mx = x(minIdx < 0 ? n - 1 : minIdx);
    const my = y(proj.menorSaldo.valorCentavos);
    const minColor = proj.menorSaldo.valorCentavos < 0 ? 'var(--red)' : 'var(--accent)';
    const z = yZero.toFixed(1);

    return `<div class="fin-proj-chart">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        <defs>
          <clipPath id="finProjPos"><rect x="0" y="0" width="${W}" height="${z}"/></clipPath>
          <clipPath id="finProjNeg"><rect x="0" y="${z}" width="${W}" height="${(H - yZero).toFixed(1)}"/></clipPath>
        </defs>
        <polygon points="${area}" fill="var(--accent)" opacity="0.10" clip-path="url(#finProjPos)"/>
        <polygon points="${area}" fill="var(--red)" opacity="0.12" clip-path="url(#finProjNeg)"/>
        <line x1="0" y1="${z}" x2="${W}" y2="${z}" stroke="var(--text3)" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>
        <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#finProjPos)"/>
        <polyline points="${line}" fill="none" stroke="var(--red)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#finProjNeg)"/>
        <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3.5" fill="${minColor}"/>
      </svg>
      <div class="fin-proj-chart-x">
        <span>${Utils.fmtDayMonth(pts[0].data)}</span>
        <span>${Utils.fmtDayMonth(pts[n - 1].data)}</span>
      </div>
    </div>`;
  }

  // ===== Lista de eventos futuros =====

  function eventosHtml(proj) {
    if (!proj.eventos.length) {
      return `<div class="text-muted" style="margin-top:8px">Nenhum evento de caixa no horizonte</div>`;
    }
    return `<div class="fin-proj-eventos">
      <div class="fin-proj-eventos-head">Eventos futuros</div>
      ${proj.eventos.map(eventoRowHtml).join('')}
    </div>`;
  }

  function eventoRowHtml(e) {
    const positivo = e.valorCentavos >= 0;
    const cor = positivo ? 'var(--green)' : 'var(--red)';
    const icone = ICONES[e.tipo] || (positivo ? '🟢' : '🔴');
    const prev = e.previstoCentavos > 0
      ? `<span class="fin-proj-tag previsto">inclui ${Utils.formatBRL(e.previstoCentavos)} previsto</span>`
      : '';
    return `<div class="fin-proj-evento${e.tipo === 'fatura' ? ' is-fatura' : ''}">
      <span class="fin-proj-ev-date">${Utils.fmtDayMonth(e.data)}</span>
      <span class="fin-proj-ev-icon">${icone}</span>
      <span class="fin-proj-ev-desc">${Utils.escapeHtml(e.descricao)}${prev}</span>
      <span class="fin-proj-ev-val" style="color:${cor}">${positivo ? '+' : '−'}${Utils.formatBRL(Math.abs(e.valorCentavos))}</span>
    </div>`;
  }

  // ===== Card do Dashboard (saldo projetado + mini sparkline) =====

  function dashHtml() {
    if (!FinanceService.listContas().length) return '';
    const proj = FinanceService.getProjecaoSaldo({});
    if (!proj.eventos.length) return '';
    const cor = proj.saldoFinalCentavos >= 0 ? 'var(--green)' : 'var(--red)';
    const aviso = (proj.ficaNegativo || proj.menorSaldo.valorCentavos < 0)
      ? `<div class="fin-proj-dash-aviso"><i class="ti ti-alert-triangle"></i>
           Chega a ${Utils.formatBRL(proj.menorSaldo.valorCentavos)} em ${Utils.fmtDayMonth(proj.menorSaldo.data)}</div>`
      : '';
    return `<div class="fin-proj-dash">
      <div class="fin-proj-dash-row">
        <div>
          <div class="fin-proj-dash-label">Saldo no fim do mês</div>
          <div class="fin-proj-dash-val" style="color:${cor}">${Utils.formatBRL(proj.saldoFinalCentavos)}</div>
        </div>
        ${sparklineSvg(proj)}
      </div>
      ${aviso}
    </div>`;
  }

  function sparklineSvg(proj) {
    const pts = proj.pontos;
    if (pts.length < 2) return '';
    const W = 120, H = 36;
    const vals = pts.map(p => p.saldoCentavos);
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    if (min === max) max = min + 1;
    const n = pts.length;
    const x = i => W * (i / (n - 1));
    const y = v => 3 + (H - 6) * (1 - (v - min) / (max - min));
    const z = y(0).toFixed(1);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.saldoCentavos).toFixed(1)}`).join(' ');
    return `<svg class="fin-proj-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <clipPath id="finSparkPos"><rect x="0" y="0" width="${W}" height="${z}"/></clipPath>
        <clipPath id="finSparkNeg"><rect x="0" y="${z}" width="${W}" height="${(H - y(0)).toFixed(1)}"/></clipPath>
      </defs>
      <line x1="0" y1="${z}" x2="${W}" y2="${z}" stroke="var(--text3)" stroke-dasharray="2 2" opacity="0.5"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5" clip-path="url(#finSparkPos)"/>
      <polyline points="${line}" fill="none" stroke="var(--red)" stroke-width="1.5" clip-path="url(#finSparkNeg)"/>
    </svg>`;
  }

  return { sectionHtml, dashHtml, setHorizonte };
})();
