/**
 * ===================== VEHICLE VIEW =====================
 * Abas do modelo de projeto Veículo. A Garagem mostra a ficha, os números e
 * as últimas manutenções; Quadro, Manutenções e Peças delegam a VehicleBoard,
 * VehicleHistory e VehicleParts.
 * Só lê dos services; qualquer gravação vem de um clique do usuário.
 */

const VehicleView = (() => {

  const { RECENT_MAINTENANCES, MIN_COST_PER_KM_CENTAVOS, ZONE_STATE } = Constants.VEHICLE;
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
    { key: 'purchaseKm', label: 'Km na compra', type: 'number' },
    { key: 'paintHex', label: 'Cor da pintura no carro 3D', type: 'color' }
  ];
  const NUMBER_FIELDS = SHEET_FIELDS.filter(f => f.type === 'number').map(f => f.key);

  // Aparece enquanto o 3D sobe e fica de vez quando o 3D não está disponível.
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
    if (field.type === 'color') return colorFieldHtml(field, id, value);
    return `<div class="form-group">
      <label class="form-label" for="${id}">${field.label}</label>
      <input class="form-input" id="${id}" type="${field.type}"${placeholder} value="${attr(value ?? '')}">
    </div>`;
  }

  /** Cor sem escolha (data-set 0) = original do modelo: o seletor só mostra a cor que o carro tem na tela. */
  function colorFieldHtml(field, id, value) {
    const shown = value || originalPaint();
    return `<div class="form-group">
      <label class="form-label" for="${id}">${field.label}</label>
      <div class="veh-visual-color">
        <input id="${id}" type="color" value="${attr(shown)}" data-set="${value ? 1 : 0}" oninput="this.dataset.set='1'">
        <button type="button" class="btn btn-ghost btn-sm" onclick="VehicleView.clearSheetColor('${id}')">Original</button>
      </div>
    </div>`;
  }

  const originalPaint = () => Vehicle3D.originalColors()?.paint || Constants.VEHICLE.VISUAL.DEFAULT_PAINT;

  function clearSheetColor(id) {
    const input = document.getElementById(id);
    input.value = originalPaint();
    input.dataset.set = '0';
  }

  /** O 3D subiu depois da ficha ser desenhada: a cor sem escolha passa a mostrar a original do modelo. */
  function showSheetOriginal() {
    const input = document.getElementById(`${SHEET_ID_PREFIX}paintHex`);
    if (input?.dataset.set === '0') input.value = originalPaint();
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
      const input = document.getElementById(SHEET_ID_PREFIX + key);
      const value = input.value.trim();
      if (key === 'paintHex') return [key, input.dataset.set === '1' ? value : ''];
      return [key, NUMBER_FIELDS.includes(key) && value !== '' ? Number(value) : value];
    }));
  }

  /** Reexibe a aba depois de uma gravação. */
  function refresh() {
    AreasView.renderWorkspace();
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
    const result = VehicleService.saveSheet(projectId, { financeCategoryId: categoryId });
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast('Categoria salva', 'success');
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

  /** Estado só de tela: a ficha continua aberta no redesenho que vem depois de remover uma leitura. */
  let keepSheetOpen = false;

  function removeReading(projectId, readingId) {
    const vehicle = VehicleService.getByProject(projectId);
    if (!vehicle || !confirm('Remover esta leitura de km?')) return;
    const result = VehicleService.removeOdometer(vehicle.id, readingId);
    if (result.erro) return Feedback.toast(result.erro, 'error');
    Feedback.toast('Leitura removida', 'success');
    keepSheetOpen = true;
    refresh();
  }

  // ===== Garagem: topo =====

  const vehicleTitle = vehicle => vehicle.nickname || vehicle.model;

  function yearsText(vehicle) {
    const { yearMade, yearModel } = vehicle;
    if (yearMade && yearModel && yearMade !== yearModel) return `${yearMade}/${yearModel}`;
    return String(yearMade || yearModel || '');
  }

  function historyCounts(vehicle) {
    const counts = new Map();
    VehicleService.listMaintenances(vehicle.id).forEach(m => m.zones.forEach(z => counts.set(z, (counts.get(z) || 0) + 1)));
    return counts;
  }

  function openSymptomCounts(vehicle) {
    const counts = new Map();
    VehicleBoardService.listOpenCards(vehicle.id, { type: Constants.VEHICLE.CARD_TYPE.SYMPTOM })
      .forEach(s => s.zones.forEach(z => counts.set(z, (counts.get(z) || 0) + 1)));
    return counts;
  }

  /** Uma entrada por zona (todas ficam alcançáveis pelo teclado e pelo toque), com o mesmo estado de cor do 3D. */
  function zoneChipData(vehicle) {
    const history = historyCounts(vehicle);
    const symptoms = openSymptomCounts(vehicle);
    const states = VehicleSceneService.getZoneStates(vehicle.id);
    return Constants.VEHICLE.ZONES.map(z => ({
      id: z.id, label: z.label, count: history.get(z.id) || 0, symptoms: symptoms.get(z.id) || 0, state: states[z.id]
    }));
  }

  /** Sintoma primeiro, depois planejadas, depois com histórico, depois o resto; em cada grupo, as mais mexidas antes (a ordem das zonas desempata). */
  function zoneChipRank(zone) {
    if (zone.state === ZONE_STATE.SYMPTOM) return 0;
    if (zone.state === ZONE_STATE.PLANNED) return 1;
    return zone.count ? 2 : 3;
  }

  function sortZoneChips(zones) {
    return [...zones].sort((a, b) => zoneChipRank(a) - zoneChipRank(b) || b.count - a.count);
  }

  function zoneChipLabel(zone) {
    const history = zone.count ? ` · ${zone.count}` : '';
    if (zone.symptoms) {
      const noun = zone.symptoms === 1 ? 'sintoma aberto' : 'sintomas abertos';
      return `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(zone.label)}${history} · ${zone.symptoms} ${noun}`;
    }
    return `${esc(zone.label)}${history}${zone.state === ZONE_STATE.PLANNED ? ' · planejada' : ''}`;
  }

  const ZONE_CHIP_CLASS = { [ZONE_STATE.SYMPTOM]: ' veh-chip-alert', [ZONE_STATE.PLANNED]: ' veh-chip-planned', [ZONE_STATE.NEUTRAL]: '' };

  function zoneChipHtml(vehicle, zone, selectedZone) {
    return `<button type="button" class="proj-meta-chip${ZONE_CHIP_CLASS[zone.state]}" data-zone="${attr(zone.id)}"
      aria-pressed="${zone.id === selectedZone}" onclick="VehicleView.selectZone('${attr(vehicle.id)}','${attr(zone.id)}')">${zoneChipLabel(zone)}</button>`;
  }

  function zoneChipsHtml(vehicle, selectedZone) {
    return sortZoneChips(zoneChipData(vehicle)).map(z => zoneChipHtml(vehicle, z, selectedZone)).join('');
  }

  // ===== Garagem: zona escolhida e carro 3D =====

  /** A zona aberta (AppState.ui.vehicleZone) sobrevive ao redesenho da Garagem (salvar, snapshot remoto). */
  const selectedZoneOf = vehicle => (AppState.ui.vehicleZone.vehicleId === vehicle.id ? AppState.ui.vehicleZone.zoneId : null);

  function selectZone(vehicleId, zoneId) {
    AppState.ui.vehicleZone = { vehicleId, zoneId };
    const panel = document.getElementById('veh-zone-panel');
    if (panel) panel.innerHTML = zoneId ? VehicleZonePanel.html(vehicleId, zoneId) : '';
    document.querySelectorAll('.veh-zone-chips [data-zone]').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.zone === zoneId));
    });
    Vehicle3D.focusZone(zoneId);
  }

  const clearZone = vehicleId => selectZone(vehicleId, null);

  /** Crédito da licença do modelo real: nasce escondido e só aparece quando o carro real está na tela. */
  function modelCreditHtml() {
    const { before, linkLabel, linkUrl, after } = Constants.VEHICLE.MODEL_CREDIT;
    return `<p class="veh-3d-credit" id="veh-3d-credit" hidden>${esc(before)}<a href="${attr(linkUrl)}" target="_blank" rel="noopener"
      aria-label="${attr(linkLabel)}, abre em nova aba">${esc(linkLabel)}</a>${esc(after)}</p>`;
  }

  function showModelCredit() {
    const credit = document.getElementById('veh-3d-credit');
    if (credit) credit.hidden = !Vehicle3D.usesRealModel();
  }

  /** Põe o carro 3D no host que acabou de ser desenhado; sem 3D, a silhueta fica e o simulador explica. */
  function mountCar(vehicle) {
    VehicleSimulator.setup(vehicle.id);
    Vehicle3D.mount(document.getElementById('veh-3d-host'), {
      zoneStates: VehicleSceneService.getZoneStates(vehicle.id),
      selectedZone: selectedZoneOf(vehicle),
      look: VehicleSimulator.lookFor(vehicle.id),
      onZoneSelect: zoneId => selectZone(vehicle.id, zoneId)
    }).then(mounted => {
      if (mounted) {
        VehicleSimulator.showOriginals();
        showSheetOriginal();
      }
      else VehicleSimulator.showUnavailable();
      showModelCredit();
    });
  }

  function garageHeaderHtml(vehicle) {
    const details = [vehicle.make, vehicle.model, vehicle.trim, yearsText(vehicle)].filter(Boolean).join(' · ');
    const selectedZone = selectedZoneOf(vehicle);
    return `<div class="card veh-hero">
      <div class="veh-nickname">${esc(vehicleTitle(vehicle))}</div>
      <div class="veh-details">${esc(details)}</div>
      <div class="veh-3d-host${Vehicle3D.isSupported() ? ' is-3d' : ''}" id="veh-3d-host">${CAR_SILHOUETTE}</div>
      ${modelCreditHtml()}
      <div class="veh-sim-root" id="veh-sim-root">${VehicleSimulator.html(vehicle.id)}</div>
      <div class="veh-zone-chips">${zoneChipsHtml(vehicle, selectedZone)}</div>
      <div id="veh-zone-panel" aria-live="polite">${selectedZone ? VehicleZonePanel.html(vehicle.id, selectedZone) : ''}</div>
      <button class="btn btn-ghost btn-sm veh-symptom-btn" onclick="VehicleCardModal.openNewSymptom('${vehicle.id}')">
        <i class="ti ti-alert-triangle"></i> Descrever um sintoma
      </button>
    </div>`;
  }

  // ===== Garagem: números =====

  function costPerKmText(summary) {
    if (summary.costPerKmCentavos >= MIN_COST_PER_KM_CENTAVOS) {
      return { value: `${Utils.formatBRL(summary.costPerKmCentavos)}/km` };
    }
    if (summary.costPer1000KmCentavos) {
      const base = Constants.VEHICLE.KM_PER_COST_BASE.toLocaleString('pt-BR');
      return { value: `${Utils.formatBRL(summary.costPer1000KmCentavos)} a cada ${base} km` };
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

  function readingRowHtml(reading, projectId) {
    return `<li class="veh-reading">
      <span>${esc(Utils.fmtDateFull(reading.date))} · <strong>${esc(reading.km.toLocaleString('pt-BR'))} km</strong></span>
      <button class="btn btn-sm" onclick="VehicleView.removeReading('${attr(projectId)}','${attr(reading.id)}')" aria-label="Remover leitura de ${esc(Utils.fmtDateFull(reading.date))}">Remover</button>
    </li>`;
  }

  function readingsHtml(vehicle, projectId) {
    if (!vehicle.odometer.length) return '';
    const rows = [...vehicle.odometer].reverse().map(r => readingRowHtml(r, projectId)).join('');
    return `<div class="form-group"><div class="form-label">Leituras de km</div><ul class="veh-readings">${rows}</ul></div>`;
  }

  function garageSheetHtml(vehicle, projectId) {
    const open = keepSheetOpen ? ' open' : '';
    keepSheetOpen = false;
    return `<details class="card veh-sheet"${open}>
      <summary class="card-title">Ficha do veículo</summary>
      ${sheetFormHtml(vehicle, projectId)}
      ${financeCategoryHtml(vehicle, projectId)}
      ${readingsHtml(vehicle, projectId)}
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
    if (vehicle) mountCar(vehicle);
  }

  function renderEmptyTab(icon, message) {
    document.getElementById('proj-tab-content').innerHTML = `
      <div class="proj-empty-state">
        <i class="ti ti-${icon}" style="font-size:48px;color:var(--text3);display:block;margin-bottom:12px"></i>
        <div style="font-size:16px;font-weight:600;color:var(--text2)">${esc(message)}</div>
      </div>`;
  }

  const NO_SHEET_MESSAGE = 'Preencha a ficha na aba Garagem para começar.';

  function renderBoard(project) {
    const vehicle = VehicleService.getByProject(project.id);
    if (vehicle) VehicleBoard.render(vehicle);
    else renderEmptyTab(Constants.PROJECT_TABS.board.icon, NO_SHEET_MESSAGE);
  }

  function renderMaintenances(project) {
    const vehicle = VehicleService.getByProject(project.id);
    if (vehicle) VehicleHistory.render(vehicle);
    else renderEmptyTab(Constants.PROJECT_TABS.maintenances.icon, NO_SHEET_MESSAGE);
  }

  function renderParts(project) {
    const vehicle = VehicleService.getByProject(project.id);
    if (vehicle) VehicleParts.render(vehicle);
    else renderEmptyTab(Constants.PROJECT_TABS.parts.icon, NO_SHEET_MESSAGE);
  }

  return {
    renderGarage, renderBoard, renderMaintenances, renderParts, refresh,
    saveSheet, clearSheetColor, setFinanceCategory, updateKm, removeReading, selectZone, clearZone
  };
})();
