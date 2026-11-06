/**
 * ===================== VEHICLE VIEW =====================
 * Abas do modelo de projeto Veículo. A Garagem mostra a ficha, os números e
 * as últimas manutenções; Manutenções e Peças ainda são estados vazios.
 * Só lê dos services; qualquer gravação vem de um clique do usuário.
 */

const VehicleView = (() => {

  const { RECENT_MAINTENANCES, TOP_ZONES, MIN_COST_PER_KM_CENTAVOS } = Constants.VEHICLE;
  const SHEET_ID_PREFIX = 'veh-f-';

  const SHEET_FIELDS = [
    { key: 'nickname', label: 'Apelido', type: 'text', placeholder: 'Ex: Saga Móvel' },
    { key: 'make', label: 'Marca', type: 'text', placeholder: 'Ex: Honda' },
    { key: 'model', label: 'Modelo', type: 'text', placeholder: 'Ex: Civic' },
    { key: 'trim', label: 'Versão', type: 'text', placeholder: 'Ex: EXS' },
    { key: 'color', label: 'Cor', type: 'text' },
    { key: 'plate', label: 'Placa', type: 'text' },
    { key: 'yearMade', label: 'Ano de fabricação', type: 'number' },
    { key: 'yearModel', label: 'Ano do modelo', type: 'number' },
    { key: 'purchaseDate', label: 'Data da compra', type: 'date' },
    { key: 'purchaseKm', label: 'Km na compra', type: 'number' }
  ];
  const NUMBER_FIELDS = SHEET_FIELDS.filter(f => f.type === 'number').map(f => f.key);

  // Silhueta provisória de sedan, até o carro 3D da fase 3.
  const CAR_SILHOUETTE = `
    <svg class="veh-car" viewBox="0 0 400 140" role="img" aria-label="Silhueta de um carro">
      <path d="M28 104V88q0-10 12-13l52-8 36-30q6-5 14-5h100q9 0 15 6l36 29 62 9q14 3 14 15v13z" fill="currentColor" opacity=".85"/>
      <circle cx="108" cy="104" r="23" fill="var(--bg)" stroke="var(--bg2)" stroke-width="4"/>
      <circle cx="108" cy="104" r="9" fill="var(--text3)"/>
      <circle cx="296" cy="104" r="23" fill="var(--bg)" stroke="var(--bg2)" stroke-width="4"/>
      <circle cx="296" cy="104" r="9" fill="var(--text3)"/>
    </svg>`;

  const esc = Utils.escapeHtml;
  const attr = Utils.escapeAttr;

  // ===== Ficha (formulário) =====

  function fieldHtml(field, value) {
    const id = SHEET_ID_PREFIX + field.key;
    const placeholder = field.placeholder ? ` placeholder="${attr(field.placeholder)}"` : '';
    return `<div class="form-group">
      <label class="form-label" for="${id}">${field.label}</label>
      <input class="form-input" id="${id}" type="${field.type}"${placeholder} value="${attr(value ?? '')}">
    </div>`;
  }

  function sheetFormHtml(vehicle, projectId) {
    const fields = SHEET_FIELDS.map(f => fieldHtml(f, vehicle?.[f.key])).join('');
    return `<div class="veh-sheet-grid">${fields}</div>
      <button class="btn btn-primary" onclick="VehicleView.saveSheet('${projectId}')">
        <i class="ti ti-device-floppy"></i> Salvar
      </button>`;
  }

  function readSheetForm() {
    return Object.fromEntries(SHEET_FIELDS.map(({ key }) => {
      const value = document.getElementById(SHEET_ID_PREFIX + key).value.trim();
      return [key, NUMBER_FIELDS.includes(key) && value !== '' ? Number(value) : value];
    }));
  }

  /** Reexibe a aba depois de uma gravação. */
  function refresh() {
    if (window.AreasView?.renderWorkspace) AreasView.renderWorkspace();
  }

  function saveResult(result) {
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast('Ficha salva', 'success');
    refresh();
  }

  function saveSheet(projectId) {
    saveResult(VehicleService.saveSheet(projectId, readSheetForm()));
  }

  function setFinanceCategory(projectId, categoryId) {
    saveResult(VehicleService.saveSheet(projectId, { financeCategoryId: categoryId }));
  }

  function updateKm(projectId) {
    const vehicle = VehicleService.getByProject(projectId);
    const input = document.getElementById('veh-km-input');
    if (!vehicle || input.value.trim() === '') return Feedback.toast('Informe o km atual', 'error');
    const result = VehicleService.addOdometer(vehicle.id, { date: Utils.today(), km: Number(input.value) });
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast('Km atualizado', 'success');
    refresh();
  }

  // ===== Garagem: topo =====

  const vehicleTitle = vehicle => vehicle.nickname || vehicle.model;

  function yearsText(vehicle) {
    const { yearMade, yearModel } = vehicle;
    if (yearMade && yearModel && yearMade !== yearModel) return `${yearMade}/${yearModel}`;
    return String(yearMade || yearModel || '');
  }

  function topZones(vehicle) {
    const counts = new Map();
    vehicle.maintenances.forEach(m => m.zones.forEach(z => counts.set(z, (counts.get(z) || 0) + 1)));
    return Constants.VEHICLE.ZONES
      .filter(z => counts.has(z.id))
      .map(z => ({ label: z.label, count: counts.get(z.id) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_ZONES);
  }

  function zoneChipsHtml(vehicle) {
    const zones = topZones(vehicle);
    if (!zones.length) return '<div class="text-muted">As zonas mais mexidas aparecem conforme você registra manutenções.</div>';
    return zones.map(z => `<span class="proj-meta-chip">${esc(z.label)} · ${z.count}</span>`).join('');
  }

  function garageHeaderHtml(vehicle) {
    const details = [vehicle.make, vehicle.model, vehicle.trim, yearsText(vehicle)].filter(Boolean).join(' · ');
    return `<div class="card veh-hero">
      <div class="veh-nickname">${esc(vehicleTitle(vehicle))}</div>
      <div class="veh-details">${esc(details)}</div>
      ${CAR_SILHOUETTE}
      <div class="veh-zone-chips">${zoneChipsHtml(vehicle)}</div>
    </div>`;
  }

  // ===== Garagem: números =====

  function costPerKmText(summary) {
    if (summary.costPerKmCentavos >= MIN_COST_PER_KM_CENTAVOS) {
      return { value: `${Utils.formatBRL(summary.costPerKmCentavos)}/km` };
    }
    if (summary.costPer1000KmCentavos) {
      return { value: `${Utils.formatBRL(summary.costPer1000KmCentavos)} a cada 1.000 km` };
    }
    return { value: '—', hint: 'registre o km da compra' };
  }

  function agoText(daysAgo, kmAgo) {
    const days = daysAgo === 0 ? 'hoje' : `há ${daysAgo} ${daysAgo === 1 ? 'dia' : 'dias'}`;
    return kmAgo == null ? days : `${days} · há ${kmAgo.toLocaleString('pt-BR')} km`;
  }

  function statCardHtml(label, value, hint) {
    return `<div class="proj-stat-card veh-stat">
      <div class="proj-stat-val veh-stat-val">${esc(value)}</div>
      <div class="proj-stat-label">${label}</div>
      ${hint ? `<div class="veh-stat-hint">${esc(hint)}</div>` : ''}
    </div>`;
  }

  function kmCardHtml(summary, projectId) {
    const km = summary.currentKm == null ? '—' : `${summary.currentKm.toLocaleString('pt-BR')} km`;
    return `<div class="proj-stat-card veh-stat">
      <div class="proj-stat-val veh-stat-val">${km}</div>
      <label class="proj-stat-label" for="veh-km-input">Atualizar km</label>
      <div class="veh-km-row">
        <input class="form-input" id="veh-km-input" type="number" min="0" inputmode="numeric" placeholder="Km de hoje">
        <button class="btn btn-ghost btn-sm" onclick="VehicleView.updateKm('${projectId}')">Salvar</button>
      </div>
    </div>`;
  }

  function garageStatsHtml(vehicle, projectId) {
    const summary = VehicleService.getSummary(vehicle.id);
    const cost = costPerKmText(summary);
    const last = summary.lastService;
    return `<div class="veh-stats">
      ${kmCardHtml(summary, projectId)}
      ${statCardHtml('Gasto total', Utils.formatBRL(summary.totalCentavos))}
      ${statCardHtml('Custo por km', cost.value, cost.hint)}
      ${statCardHtml('Gasto no ano', Utils.formatBRL(summary.yearCentavos))}
      ${statCardHtml('Último serviço', last ? agoText(last.daysAgo, last.kmAgo) : '—', last?.title)}
    </div>`;
  }

  // ===== Garagem: listas e ficha =====

  function recentItemHtml(vehicleId, maintenance) {
    const total = Utils.formatBRL(VehicleService.maintenanceTotal(maintenance));
    return `<button class="veh-recent-item" onclick="VehicleMaintenanceModal.open('${vehicleId}','${maintenance.id}')">
      <span class="veh-recent-date">${Utils.fmtDate(maintenance.date)}</span>
      <span class="veh-recent-title">${esc(maintenance.title)}</span>
      <span class="veh-recent-total">${total}</span>
    </button>`;
  }

  function garageRecentHtml(vehicle) {
    const recent = VehicleService.listMaintenances(vehicle.id).slice(0, RECENT_MAINTENANCES);
    return `<div class="card">
      <div class="card-title veh-recent-head">
        <span>Últimas manutenções</span>
        <button class="btn btn-primary btn-sm" onclick="VehicleMaintenanceModal.openNew('${vehicle.id}')">
          <i class="ti ti-plus"></i> Nova manutenção
        </button>
      </div>
      ${recent.length ? recent.map(m => recentItemHtml(vehicle.id, m)).join('') : '<div class="text-muted">Nenhuma manutenção registrada ainda.</div>'}
    </div>`;
  }

  function financeCategoryHtml(vehicle, projectId) {
    const options = FinanceService.listCategorias('despesa').map(c =>
      `<option value="${attr(c.id)}"${c.id === vehicle.financeCategoryId ? ' selected' : ''}>${esc(c.nome)}</option>`);
    const auto = `Automática (${Constants.VEHICLE.DEFAULT_FINANCE_CATEGORY})`;
    return `<div class="form-group">
      <label class="form-label" for="veh-fin-cat">Categoria em Finanças</label>
      <select class="form-select" id="veh-fin-cat" onchange="VehicleView.setFinanceCategory('${projectId}',this.value)">
        <option value="">${auto}</option>${options.join('')}
      </select>
    </div>`;
  }

  function garageSheetHtml(vehicle, projectId) {
    return `<details class="card veh-sheet">
      <summary class="card-title">Ficha do veículo</summary>
      ${sheetFormHtml(vehicle, projectId)}
      ${financeCategoryHtml(vehicle, projectId)}
    </details>`;
  }

  // ===== Abas =====

  function renderGarage(project) {
    const vehicle = VehicleService.getByProject(project.id);
    document.getElementById('proj-tab-content').innerHTML = vehicle
      ? garageHeaderHtml(vehicle) + garageStatsHtml(vehicle, project.id) + garageRecentHtml(vehicle) + garageSheetHtml(vehicle, project.id)
      : `<div class="card">
          <div class="card-title">Preencha a ficha do seu veículo</div>
          ${sheetFormHtml(null, project.id)}
        </div>`;
  }

  function renderEmptyTab(icon, message) {
    document.getElementById('proj-tab-content').innerHTML = `
      <div class="proj-empty-state">
        <i class="ti ti-${icon}" style="font-size:48px;color:var(--text3);display:block;margin-bottom:12px"></i>
        <div style="font-size:16px;font-weight:600;color:var(--text2)">${message}</div>
      </div>`;
  }

  function renderMaintenances() {
    renderEmptyTab(Constants.PROJECT_TABS.maintenances.icon, 'Em breve: o histórico de manutenções do seu veículo.');
  }

  function renderParts() {
    renderEmptyTab(Constants.PROJECT_TABS.parts.icon, 'Em breve: o caderno de peças e oficinas do seu veículo.');
  }

  return {
    renderGarage, renderMaintenances, renderParts,
    saveSheet, setFinanceCategory, updateKm
  };
})();
