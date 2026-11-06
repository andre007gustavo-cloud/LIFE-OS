/**
 * ===================== VEHICLE VIEW =====================
 * Abas do modelo de projeto Veículo (Garagem, Manutenções, Peças e oficinas).
 * Por enquanto só o estado vazio; o conteúdo chega nos próximos blocos.
 */

const VehicleView = (() => {

  function renderEmptyTab(icon, message) {
    document.getElementById('proj-tab-content').innerHTML = `
      <div class="proj-empty-state">
        <i class="ti ti-${icon}" style="font-size:48px;color:var(--text3);display:block;margin-bottom:12px"></i>
        <div style="font-size:16px;font-weight:600;color:var(--text2)">${message}</div>
      </div>`;
  }

  function renderGarage() {
    renderEmptyTab(Constants.PROJECT_TABS.garage.icon, 'Em breve: a Garagem do seu veículo.');
  }

  function renderMaintenances() {
    renderEmptyTab(Constants.PROJECT_TABS.maintenances.icon, 'Em breve: o histórico de manutenções do seu veículo.');
  }

  function renderParts() {
    renderEmptyTab(Constants.PROJECT_TABS.parts.icon, 'Em breve: o caderno de peças e oficinas do seu veículo.');
  }

  return { renderGarage, renderMaintenances, renderParts };
})();
