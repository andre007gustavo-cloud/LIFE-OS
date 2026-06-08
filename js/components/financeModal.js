/**
 * ===================== FINANCE MODAL =====================
 * Create a new finance entry (receita/despesa).
 */

const FinanceModal = (() => {

  function open() {
    setType('despesa');
    document.getElementById('f-desc').value = '';
    document.getElementById('f-value').value = '';
    document.getElementById('f-date').value = Utils.today();
    document.getElementById('f-cat').innerHTML = FinanceService.getCategories()
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join('');
    Modal.open('fin-modal');
  }

  function save() {
    const desc = document.getElementById('f-desc').value.trim();
    const value = parseFloat(document.getElementById('f-value').value);
    const date = document.getElementById('f-date').value;
    const cat = document.getElementById('f-cat').value;

    if (!desc || !value || !date) return alert('Preencha todos os campos');

    FinanceService.create({
      type: AppState.ui.finType,
      desc, value, date, cat
    });

    Modal.close('fin-modal');
    if (window.FinanceView?.render) FinanceView.render();
    if (window.DashboardView?.render) DashboardView.render();
  }

  function setType(type) {
    AppState.ui.finType = type;
    const recBtn = document.getElementById('fin-type-rec');
    const despBtn = document.getElementById('fin-type-desp');
    if (recBtn) {
      recBtn.style.borderColor = type === 'receita' ? 'var(--green)' : 'var(--border)';
      recBtn.style.color = type === 'receita' ? 'var(--green)' : 'var(--text2)';
    }
    if (despBtn) {
      despBtn.style.borderColor = type === 'despesa' ? 'var(--red)' : 'var(--border)';
      despBtn.style.color = type === 'despesa' ? 'var(--red)' : 'var(--text2)';
    }
  }

  return { open, save, setType };
})();
