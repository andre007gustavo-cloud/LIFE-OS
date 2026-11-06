/**
 * ===================== VEHICLE SERVICE =====================
 * Ficha do veículo, odômetro e manutenções (modelo de projeto "Veículo").
 * Dados em AppState.getDB().vehicles; um veículo por projeto.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Erros de negócio voltam como { erro }.
 * Leitura nunca cria nem grava nada.
 */

const VehicleService = (() => {

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const SHEET_TEXT_FIELDS = ['nickname', 'make', 'model', 'trim', 'color', 'plate', 'financeCategoryId'];

  // ===== Erros e validação =====

  function _fail(message) {
    const error = new Error(message);
    error.businessError = true;
    throw error;
  }

  /** Executa fn e converte erro de negócio em { erro }; o resto sobe. */
  function _guard(fn) {
    try {
      return fn();
    } catch (e) {
      if (e && e.businessError) return { erro: e.message };
      throw e;
    }
  }

  const _isBlank = value => value == null || value === '';

  function _text(value, max = Constants.VEHICLE.TEXT_MAX) {
    return _isBlank(value) ? undefined : String(value).trim().slice(0, max) || undefined;
  }

  function _date(value, label) {
    if (_isBlank(value)) return undefined;
    const valid = typeof value === 'string' && ISO_DATE.test(value) && Utils.toISO(Utils.parseISO(value)) === value;
    if (!valid) _fail(`${label} inválida: use o formato AAAA-MM-DD`);
    return value;
  }

  function _requiredDate(value, label) {
    return _date(value, label) || _fail(`${label} é obrigatória`);
  }

  function _int(value, label, min, max) {
    if (_isBlank(value)) return undefined;
    if (!Number.isInteger(value) || value < min || value > max) {
      _fail(`${label} inválido: informe um número inteiro entre ${min} e ${max}`);
    }
    return value;
  }

  const _km = (value, label = 'Km') => _int(value, label, 0, Constants.VEHICLE.KM_MAX);
  const _centavos = (value, label) => _int(value, label, 0, Number.MAX_SAFE_INTEGER) ?? 0;

  function _oneOf(value, list, label) {
    if (!list.some(item => item.id === value)) _fail(`${label} inválida: ${value}`);
    return value;
  }

  const _compact = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  // ===== Normalização =====

  function _normalizeSheet(raw) {
    const { YEAR_MIN, YEAR_MAX } = Constants.VEHICLE;
    const texts = Object.fromEntries(SHEET_TEXT_FIELDS.map(f => [f, _text(raw[f])]));
    if (!texts.nickname) _fail('O apelido do veículo é obrigatório');
    return _compact({
      ...texts,
      yearMade: _int(raw.yearMade, 'Ano de fabricação', YEAR_MIN, YEAR_MAX),
      yearModel: _int(raw.yearModel, 'Ano do modelo', YEAR_MIN, YEAR_MAX),
      purchaseDate: _date(raw.purchaseDate, 'Data da compra'),
      purchaseKm: _km(raw.purchaseKm, 'Km da compra')
    });
  }

  function _normalizePart(raw) {
    const name = _text(raw?.name);
    if (!name) _fail('Toda peça precisa de um nome');
    return _compact({
      id: raw.id || Utils.uid(),
      name,
      brand: _text(raw.brand),
      code: _text(raw.code),
      store: _text(raw.store),
      qty: _int(raw.qty, 'Quantidade', 1, Number.MAX_SAFE_INTEGER) ?? 1,
      priceCentavos: _centavos(raw.priceCentavos, 'Preço da peça'),
      warrantyUntil: _date(raw.warrantyUntil, 'Garantia')
    });
  }

  function _normalizeZones(zones) {
    if (_isBlank(zones)) return [];
    if (!Array.isArray(zones)) _fail('As zonas devem ser uma lista');
    return [...new Set(zones.map(z => _oneOf(z, Constants.VEHICLE.ZONES, 'Zona')))];
  }

  function _normalizeMaintenance(raw) {
    const title = _text(raw.title);
    if (!title) _fail('O título da manutenção é obrigatório');
    const category = _isBlank(raw.category) ? 'other' : _oneOf(raw.category, Constants.VEHICLE.CATEGORIES, 'Categoria');
    return _compact({
      id: raw.id || Utils.uid(),
      date: _requiredDate(raw.date, 'Data'),
      km: _km(raw.km),
      title,
      category,
      zones: _normalizeZones(raw.zones),
      shop: _text(raw.shop),
      parts: (raw.parts || []).map(_normalizePart),
      laborCentavos: _centavos(raw.laborCentavos, 'Mão de obra'),
      notes: _text(raw.notes, Constants.VEHICLE.NOTES_MAX),
      transactionIds: [...(raw.transactionIds || [])]
    });
  }

  // ===== Acesso =====

  const _vehicles = () => AppState.getDB().vehicles;

  function list() {
    return _vehicles();
  }

  function getById(id) {
    return _vehicles().find(v => v.id === id) || null;
  }

  function getByProject(projectId) {
    return _vehicles().find(v => v.projectId === projectId) || null;
  }

  function _requireVehicle(vehicleId) {
    return getById(vehicleId) || _fail('Veículo não encontrado');
  }

  // ===== Ficha =====

  function _createVehicle(projectId, fields) {
    const now = Date.now();
    const vehicle = { id: Utils.uid(), projectId, ...fields, odometer: [], maintenances: [], createdAt: now, updatedAt: now };
    _vehicles().push(vehicle);
    return vehicle;
  }

  /** Cria o veículo do projeto no primeiro save e atualiza nos seguintes. */
  function saveSheet(projectId, patch) {
    return _guard(() => {
      if (!projectId) _fail('Projeto não informado');
      const existing = getByProject(projectId);
      const sheetKeys = [...SHEET_TEXT_FIELDS, 'yearMade', 'yearModel', 'purchaseDate', 'purchaseKm'];
      const current = existing ? Object.fromEntries(sheetKeys.map(k => [k, existing[k]])) : {};
      const fields = _normalizeSheet({ ...current, ...patch });
      if (!existing) _createVehicle(projectId, fields);
      else {
        sheetKeys.forEach(k => delete existing[k]);
        Object.assign(existing, fields, { updatedAt: Date.now() });
      }
      AppState.persist();
      return getByProject(projectId);
    });
  }

  function removeByProject(projectId) {
    const db = AppState.getDB();
    const before = db.vehicles.length;
    db.vehicles = db.vehicles.filter(v => v.projectId !== projectId);
    if (db.vehicles.length !== before) AppState.persist();
  }

  // ===== Odômetro =====

  function _assertOdometerOrder(readings, date, km) {
    const conflict = readings.find(r => (r.date < date && r.km > km) || (r.date > date && r.km < km));
    if (conflict) _fail(`Km incoerente: em ${conflict.date} o odômetro marcava ${conflict.km} km`);
  }

  /** Registra a leitura do odômetro; a mesma data substitui a anterior. */
  function addOdometer(vehicleId, { date, km } = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const reading = { id: Utils.uid(), date: _requiredDate(date, 'Data'), km: _km(km) ?? _fail('O km é obrigatório') };
      const others = vehicle.odometer.filter(r => r.date !== reading.date);
      _assertOdometerOrder(others, reading.date, reading.km);
      vehicle.odometer = [...others, reading].sort((a, b) => a.date.localeCompare(b.date));
      vehicle.updatedAt = Date.now();
      AppState.persist();
      return reading;
    });
  }

  /** Maior km conhecido entre leituras, manutenções e km da compra (null se nenhum). */
  function getCurrentKm(vehicle) {
    const kms = [
      ...vehicle.odometer.map(r => r.km),
      ...vehicle.maintenances.map(m => m.km),
      vehicle.purchaseKm
    ].filter(Number.isInteger);
    return kms.length ? Math.max(...kms) : null;
  }

  // ===== Manutenções =====

  function _touch(vehicle) {
    vehicle.updatedAt = Date.now();
    AppState.persist();
  }

  function addMaintenance(vehicleId, dto = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const now = Date.now();
      const maintenance = { ..._normalizeMaintenance(dto), createdAt: now, updatedAt: now };
      vehicle.maintenances.push(maintenance);
      _touch(vehicle);
      return maintenance;
    });
  }

  function _findMaintenance(vehicle, id) {
    return vehicle.maintenances.find(m => m.id === id) || _fail('Manutenção não encontrada');
  }

  function updateMaintenance(vehicleId, id, patch = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const current = _findMaintenance(vehicle, id);
      const next = _normalizeMaintenance({ ...current, ...patch, id: current.id });
      const { createdAt } = current;
      Object.keys(current).forEach(k => delete current[k]);
      Object.assign(current, next, { createdAt, updatedAt: Date.now() });
      _touch(vehicle);
      return current;
    });
  }

  function removeMaintenance(vehicleId, id) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      _findMaintenance(vehicle, id);
      vehicle.maintenances = vehicle.maintenances.filter(m => m.id !== id);
      _touch(vehicle);
      return true;
    });
  }

  return {
    list,
    getById,
    getByProject,
    saveSheet,
    removeByProject,
    addOdometer,
    getCurrentKm,
    addMaintenance,
    updateMaintenance,
    removeMaintenance
  };
})();
