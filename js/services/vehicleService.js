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

  // ===== Consultas derivadas (nada é guardado) =====

  /** Manutenções que contam como histórico; todas as consultas passam por aqui. */
  const _history = vehicle => vehicle.maintenances;

  const _newestFirst = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
  const _oldestFirst = (a, b) => -_newestFirst(a, b);
  const _sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

  function _query(vehicleId, fn) {
    return _guard(() => fn(_requireVehicle(vehicleId)));
  }

  function maintenanceTotal(maintenance) {
    return _sum(maintenance.parts, p => p.priceCentavos) + maintenance.laborCentavos;
  }

  /** Todas as palavras buscadas precisam aparecer (sem acento nem caixa). */
  function _textMatcher(text) {
    const words = Utils.normalizeText(text).split(' ').filter(Boolean);
    return haystack => words.every(w => haystack.includes(w));
  }

  function _searchHaystack(m) {
    const partTexts = m.parts.flatMap(p => [p.name, p.brand, p.code, p.store]);
    return Utils.normalizeText([m.title, m.notes, m.shop, ...partTexts].filter(Boolean).join(' '));
  }

  function _maintenanceFilter({ text, category, zone, from, to } = {}) {
    const matchesText = _textMatcher(text);
    const start = _date(from, 'Data inicial');
    const end = _date(to, 'Data final');
    return m => (!category || m.category === category)
      && (!zone || m.zones.includes(zone))
      && (!start || m.date >= start)
      && (!end || m.date <= end)
      && matchesText(_searchHaystack(m));
  }

  function listMaintenances(vehicleId, filters) {
    return _query(vehicleId, vehicle => _history(vehicle)
      .filter(_maintenanceFilter(filters))
      .sort(_newestFirst));
  }

  function _sumBy(maintenances, keyOf) {
    const totals = {};
    maintenances.forEach(m => { totals[keyOf(m)] = (totals[keyOf(m)] || 0) + maintenanceTotal(m); });
    return totals;
  }

  const _daysSince = date => Math.max(0, Utils.diffDays(date, Utils.today()));
  const _kmSince = (km, currentKm) => (Number.isInteger(km) && currentKm != null ? Math.max(0, currentKm - km) : null);

  function _lastService(history, currentKm) {
    const last = [...history].sort(_newestFirst)[0];
    if (!last) return null;
    return { id: last.id, title: last.title, date: last.date, km: last.km ?? null,
      daysAgo: _daysSince(last.date), kmAgo: _kmSince(last.km, currentKm) };
  }

  /** Km de partida do custo por km: km da compra ou a leitura mais antiga do odômetro. */
  function _startKm(vehicle) {
    if (Number.isInteger(vehicle.purchaseKm)) return vehicle.purchaseKm;
    const first = [...vehicle.odometer].sort((a, b) => a.date.localeCompare(b.date))[0];
    return first ? first.km : null;
  }

  /** Centavos por km rodado, arredondado ao centavo mais próximo; null sem km rodados. */
  function _costPerKm(vehicle, totalCentavos, currentKm) {
    const startKm = _startKm(vehicle);
    const driven = startKm == null || currentKm == null ? 0 : currentKm - startKm;
    return driven > 0 ? Math.round(totalCentavos / driven) : null;
  }

  function getSummary(vehicleId) {
    return _query(vehicleId, vehicle => {
      const history = _history(vehicle);
      const currentKm = getCurrentKm(vehicle);
      const byYear = _sumBy(history, m => m.date.slice(0, 4));
      const totalCentavos = _sum(history, maintenanceTotal);
      return {
        totalCentavos,
        yearCentavos: byYear[Utils.today().slice(0, 4)] || 0,
        byCategory: _sumBy(history, m => m.category),
        byYear,
        count: history.length,
        lastService: _lastService(history, currentKm),
        currentKm,
        costPerKmCentavos: _costPerKm(vehicle, totalCentavos, currentKm)
      };
    });
  }

  // ----- Caderno de peças -----

  const _partKey = part => {
    const code = Utils.normalizeText(part.code);
    return code ? `code:${code}` : `name:${Utils.normalizeText(part.name)}`;
  };

  function _groupPartUses(history) {
    const groups = new Map();
    [...history].sort(_oldestFirst).forEach(m => m.parts.forEach(part => {
      const key = _partKey(part);
      groups.set(key, [...(groups.get(key) || []), { part, maintenance: m }]);
    }));
    return groups;
  }

  function _warranty({ part, maintenance }, currentKm) {
    if (!part.warrantyUntil) return null;
    return { until: part.warrantyUntil, active: part.warrantyUntil >= Utils.today(),
      daysAgo: _daysSince(maintenance.date), kmAgo: _kmSince(maintenance.km, currentKm) };
  }

  const _unitPrice = part => Math.round(part.priceCentavos / part.qty);

  function _notebookItem(key, uses, currentKm) {
    const last = uses[uses.length - 1];
    return {
      key,
      name: last.part.name,
      code: last.part.code,
      lastUse: { maintenanceId: last.maintenance.id, date: last.maintenance.date, km: last.maintenance.km ?? null,
        store: last.part.store, brand: last.part.brand, qty: last.part.qty, unitPriceCentavos: _unitPrice(last.part) },
      priceHistory: uses.map(u => ({ date: u.maintenance.date, unitPriceCentavos: _unitPrice(u.part), store: u.part.store })),
      timesReplaced: uses.length,
      warranty: _warranty(last, currentKm),
      _haystack: Utils.normalizeText(uses.flatMap(u => [u.part.name, u.part.brand, u.part.code, u.part.store]).filter(Boolean).join(' '))
    };
  }

  function getPartsNotebook(vehicleId, { text } = {}) {
    return _query(vehicleId, vehicle => {
      const currentKm = getCurrentKm(vehicle);
      const matchesText = _textMatcher(text);
      return [..._groupPartUses(_history(vehicle))]
        .map(([key, uses]) => _notebookItem(key, uses, currentKm))
        .filter(item => matchesText(item._haystack))
        .map(({ _haystack, ...item }) => item)
        .sort((a, b) => b.lastUse.date.localeCompare(a.lastUse.date));
    });
  }

  // ----- Oficinas -----

  function getShops(vehicleId) {
    return _query(vehicleId, vehicle => {
      const shops = new Map();
      [..._history(vehicle)].filter(m => m.shop).sort(_oldestFirst).forEach(m => {
        const key = Utils.normalizeText(m.shop);
        const prev = shops.get(key) || { visits: 0, totalCentavos: 0 };
        shops.set(key, { key, name: m.shop, visits: prev.visits + 1, lastVisit: m.date,
          totalCentavos: prev.totalCentavos + maintenanceTotal(m) });
      });
      return [...shops.values()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
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
    removeMaintenance,
    listMaintenances,
    maintenanceTotal,
    getSummary,
    getPartsNotebook,
    getShops
  };
})();
