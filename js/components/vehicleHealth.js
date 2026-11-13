/**
 * ===================== VEHICLE HEALTH =====================
 * Saúde do veículo na tela: a aba Saúde (plano preventivo com a situação de
 * cada item e as garantias vencendo), o card "Próximas revisões" da Garagem e
 * o card de alertas do painel. Só lê do VehicleHealthService; as gravações
 * (usar o plano sugerido, marcar como feito) vêm de um clique do usuário.
 */

const VehicleHealth = (() => {

  const { HEALTH, FULL_BAR_PERCENT } = Constants.VEHICLE;
  const { STATUS, STATUS_LABELS } = HEALTH;
  const ROOT_ID = 'proj-tab-content';
  const STATUS_ICONS = { overdue: 'alert-octagon', soon: 'clock-exclamation', unknown: 'help-circle', ok: 'circle-check' };
  const DASH_ALERTS_PER_VEHICLE = 2;
  const PLAN_INTRO = 'Monte o plano preventivo e o app avisa o que está para vencer por km e por tempo: óleo, filtros, velas, correia dentada, fluidos.';
  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;
  const fmtKm = value => value.toLocaleString('pt-BR');

  // ===== Textos =====

  function intervalText(item) {
    const parts = [];
    if (item.intervalKm) parts.push(`${fmtKm(item.intervalKm)} km`);
    if (item.intervalMonths) parts.push(`${item.intervalMonths} ${item.intervalMonths === 1 ? 'mês' : 'meses'}`);
    return `A cada ${parts.join(' ou ')}`;
  }

  function lastText(last) {
    if (!last) return '';
    const when = [last.date ? Utils.fmtDateFull(last.date) : '', Number.isInteger(last.km) ? `${fmtKm(last.km)} km` : ''].filter(Boolean).join(' · ');
    return `Última vez: ${when}`;
  }

  /** Quanto do intervalo já foi usado (0 a 100), pelo que estiver mais perto de vencer; null sem como medir. */
  function usedPercent(entry) {
    const { item } = entry;
    const used = [];
    if (entry.remainingKm != null) used.push(1 - entry.remainingKm / item.intervalKm);
    if (entry.remainingDays != null) used.push(1 - entry.remainingDays / (item.intervalMonths * HEALTH.DAYS_PER_MONTH));
    return used.length ? Math.round(Utils.clamp(Math.max(...used), 0, 1) * FULL_BAR_PERCENT) : null;
  }

  // ===== Item do plano =====

  function badgeHtml(status) {
    return `<span class="veh-health-badge"><i class="ti ti-${STATUS_ICONS[status]}" aria-hidden="true"></i> ${STATUS_LABELS[status]}</span>`;
  }

  function barHtml(entry) {
    const percent = usedPercent(entry);
    if (percent == null) return '';
    return `<div class="orc-bar" role="img" aria-label="${percent}% do intervalo usado"><div class="orc-bar-fill veh-health-fill" style="width:${percent}%"></div></div>`;
  }

  /** De onde veio a "última vez": a manutenção que contou (abre ao tocar) ou a informação dada à mão. */
  function lastHtml(vehicleId, last) {
    if (!last) return '';
    const source = last.maintenanceId
      ? `<button type="button" class="veh-health-link" onclick="VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(last.maintenanceId)}')">${esc(last.title)}</button>`
      : '<span>informada à mão</span>';
    return `<div class="veh-health-last">${esc(lastText(last))} · ${source}</div>`;
  }

  function itemActionsHtml(vehicleId, itemId) {
    const args = `'${attr(vehicleId)}','${attr(itemId)}'`;
    return `<div class="veh-health-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleHealth.register(${args})"><i class="ti ti-tool" aria-hidden="true"></i> Registrar manutenção</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleHealth.markDone(${args})"><i class="ti ti-check" aria-hidden="true"></i> Já foi feito</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="VehiclePlanModal.open(${args})"><i class="ti ti-edit" aria-hidden="true"></i> Editar</button>
    </div>`;
  }

  function itemHtml(vehicleId, entry) {
    const { item } = entry;
    const star = item.highlight ? '<i class="ti ti-star veh-health-star" aria-label="Item crítico" role="img"></i> ' : '';
    const notes = item.notes ? `<div class="veh-health-notes">${esc(item.notes)}</div>` : '';
    return `<div class="card veh-health-item veh-health-${entry.status}">
      <div class="veh-health-head"><span class="veh-health-title">${star}${esc(item.title)}</span>${badgeHtml(entry.status)}</div>
      <div class="veh-health-interval">${esc(intervalText(item))}</div>
      ${barHtml(entry)}
      <div class="veh-health-text">${esc(entry.text)}</div>
      ${lastHtml(vehicleId, entry.last)}${notes}
      ${itemActionsHtml(vehicleId, item.id)}
    </div>`;
  }

  // ===== Aba Saúde =====

  function countsHtml(counts) {
    return [STATUS.OVERDUE, STATUS.SOON, STATUS.OK, STATUS.UNKNOWN].filter(status => counts[status])
      .map(status => `<span class="veh-health-count veh-health-${status}">${badgeHtml(status)} ${counts[status]}</span>`).join('');
  }

  function paceText(health) {
    if (health.kmPerMonth == null) return 'Atualize o km de vez em quando: com ele o app calcula sua média por mês e prevê as datas.';
    return `Você roda em média ${fmtKm(health.kmPerMonth)} km por mês.`;
  }

  function suggestButtonHtml(vehicleId, missing, primary) {
    if (!missing) return '';
    const label = primary ? 'Usar plano sugerido' : `Adicionar sugeridos que faltam (${missing})`;
    return `<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="VehicleHealth.useSuggested('${attr(vehicleId)}')">
      <i class="ti ti-list-check" aria-hidden="true"></i> ${label}</button>`;
  }

  function headHtml(vehicleId, health, missing) {
    return `<div class="card veh-health-summary">
      <div class="veh-hist-head">
        <div class="card-title">Plano preventivo</div>
        <button type="button" class="btn btn-primary btn-sm" onclick="VehiclePlanModal.openNew('${attr(vehicleId)}')"><i class="ti ti-plus" aria-hidden="true"></i> Novo item</button>
      </div>
      <div class="veh-health-counts">${countsHtml(health.counts)}</div>
      <p class="veh-health-pace">${esc(paceText(health))}</p>
      ${suggestButtonHtml(vehicleId, missing, false)}
    </div>`;
  }

  function emptyHtml(vehicleId, missing) {
    return `<div class="card veh-health-empty">
      <div class="card-title">Plano preventivo</div>
      <p class="veh-health-pace">${PLAN_INTRO} Os intervalos sugeridos são um ponto de partida: confira no manual do seu carro e ajuste.</p>
      <div class="veh-health-actions">
        ${suggestButtonHtml(vehicleId, missing, true)}
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehiclePlanModal.openNew('${attr(vehicleId)}')"><i class="ti ti-plus" aria-hidden="true"></i> Criar item</button>
      </div>
    </div>`;
  }

  function warrantyRowHtml(vehicleId, alert) {
    return `<button type="button" class="veh-zone-item veh-health-row" onclick="VehicleMaintenanceModal.open('${attr(vehicleId)}','${attr(alert.maintenanceId)}')">
      <span class="veh-zone-item-title">${esc(alert.title)}</span><span class="veh-zone-item-meta">${esc(alert.text)}</span></button>`;
  }

  function warrantiesHtml(vehicleId, alerts) {
    const warranties = alerts.filter(alert => alert.kind === 'warranty');
    if (!warranties.length) return '';
    return `<div class="card"><div class="card-title">Garantias vencendo</div>${warranties.map(alert => warrantyRowHtml(vehicleId, alert)).join('')}</div>`;
  }

  function render(vehicle) {
    const health = VehicleHealthService.getHealth(vehicle.id);
    const missing = VehicleHealthService.listMissingSuggestions(vehicle.id).length;
    const body = health.items.length
      ? headHtml(vehicle.id, health, missing) + health.items.map(entry => itemHtml(vehicle.id, entry)).join('')
      : emptyHtml(vehicle.id, missing);
    document.getElementById(ROOT_ID).innerHTML = body + warrantiesHtml(vehicle.id, health.alerts);
  }

  // ===== Garagem: próximas revisões =====

  /** O que pede atenção (tudo) e, se sobrar espaço, os próximos itens em dia. */
  function garageEntries(health) {
    const needy = health.items.filter(entry => health.alerts.some(alert => alert.itemId === entry.item.id));
    const upcoming = health.items.filter(entry => entry.status === STATUS.OK).slice(0, Math.max(0, HEALTH.GARAGE_UPCOMING - needy.length));
    return [...needy, ...upcoming];
  }

  function garageRowHtml(entry) {
    return `<button type="button" class="veh-zone-item veh-health-row veh-health-${entry.status}" onclick="setProjTab('health')">
      <span class="veh-zone-item-title"><i class="ti ti-${STATUS_ICONS[entry.status]}" aria-hidden="true"></i> ${esc(entry.item.title)}</span>
      <span class="veh-zone-item-meta">${esc(entry.text)}</span></button>`;
  }

  function garageEmptyHtml(vehicleId) {
    return `<div class="card veh-health-card">
      <div class="card-title">Próximas revisões</div>
      <p class="veh-health-pace">${PLAN_INTRO}</p>
      <button type="button" class="btn btn-primary btn-sm" onclick="VehicleHealth.useSuggested('${attr(vehicleId)}')"><i class="ti ti-list-check" aria-hidden="true"></i> Usar plano sugerido</button>
    </div>`;
  }

  /** Card da Garagem: alertas e próximas revisões; sem plano, o convite para usar o plano sugerido. */
  function garageHtml(vehicle) {
    const health = VehicleHealthService.getHealth(vehicle.id);
    if (!health.items.length) return garageEmptyHtml(vehicle.id) + warrantiesHtml(vehicle.id, health.alerts);
    const rows = garageEntries(health).map(garageRowHtml).join('') || '<div class="text-muted">Nada vencendo por enquanto.</div>';
    return `<div class="card veh-health-card">
      <div class="card-title veh-recent-head">
        <span>Próximas revisões</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="setProjTab('health')">Ver plano</button>
      </div>${rows}
    </div>${warrantiesHtml(vehicle.id, health.alerts)}`;
  }

  // ===== Painel =====

  function dashGroupHtml(group) {
    const shown = group.alerts.slice(0, DASH_ALERTS_PER_VEHICLE);
    const more = group.alerts.length - shown.length;
    const lines = shown.map(alert => `<span class="veh-dash-line"><strong>${esc(alert.title)}</strong> ${esc(alert.text)}</span>`).join('');
    return `<button type="button" class="veh-dash-item" onclick="VehicleHealth.openFromDash('${attr(group.projectId)}')">
      <span class="veh-dash-name">${esc(group.name)}</span>${lines}
      ${more > 0 ? `<span class="veh-dash-more">+${more} ${more === 1 ? 'aviso' : 'avisos'}</span>` : ''}
    </button>`;
  }

  /** Alertas de todos os veículos; vazio (o card some) quando nada pede atenção. */
  function dashHtml() {
    return VehicleHealthService.listAlerts().map(dashGroupHtml).join('');
  }

  function openFromDash(projectId) {
    Navigation.showView('areas');
    AreasView.openProject(projectId);
    AreasView.setProjTab('health');
  }

  // ===== Ações =====

  function useSuggested(vehicleId) {
    const result = VehicleHealthService.useSuggestedPlan(vehicleId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast(`${result.added} ${result.added === 1 ? 'item adicionado' : 'itens adicionados'} ao plano. Confira os intervalos no manual.`, 'success');
    VehicleView.refresh();
  }

  const findItem = (vehicleId, itemId) => VehicleHealthService.getHealth(vehicleId).items?.find(entry => entry.item.id === itemId)?.item;

  /** Abre uma manutenção nova já com o título, a categoria e as zonas do item: ao salvar, ela conta para o plano. */
  function register(vehicleId, itemId) {
    const item = findItem(vehicleId, itemId);
    if (!item) return Feedback.toast('Item do plano não encontrado', 'error');
    VehicleMaintenanceModal.openNew(vehicleId, { title: item.title, category: item.category, zones: item.zones });
  }

  function markDone(vehicleId, itemId) {
    const item = findItem(vehicleId, itemId);
    if (!item || !confirm(`Marcar "${item.title}" como feito hoje, no km atual? Nenhuma manutenção é criada.`)) return;
    const result = VehicleHealthService.markDone(vehicleId, itemId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast('Marcado como feito', 'success');
    VehicleView.refresh();
  }

  return { render, garageHtml, dashHtml, openFromDash, useSuggested, register, markDone, STATUS_ICONS };
})();
