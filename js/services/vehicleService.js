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

  const { CARD_STATUS, CARD_TYPE } = Constants.VEHICLE;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const SHEET_TEXT_FIELDS = ['nickname', 'make', 'model', 'trim', 'color', 'plate', 'financeCategoryId'];
  const HEX_COLOR = /^#[0-9a-f]{6}$/;
  const VISUAL_KEYS = ['paint', 'wheels', 'tint', 'rideHeight'];

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
      _fail(`${label}: valor inválido, informe um número inteiro entre ${min} e ${max}`);
    }
    return value;
  }

  const _km = (value, label = 'Km') => _int(value, label, 0, Constants.VEHICLE.KM_MAX);
  const _centavos = (value, label) => _int(value, label, 0, Constants.VEHICLE.CENTAVOS_MAX) ?? 0;

  function _oneOf(value, list, label, adjective = 'inválida') {
    if (!list.some(item => item.id === value)) _fail(`${label} ${adjective}: ${value}`);
    return value;
  }

  /** Cor #rrggbb, sempre em minúsculas. */
  function _hex(value, label) {
    if (_isBlank(value)) return undefined;
    const hex = String(value).trim().toLowerCase();
    if (!HEX_COLOR.test(hex)) _fail(`${label} inválida: use o formato #rrggbb`);
    return hex;
  }

  /** Escurecimento da película: número de 0 a 1, com 2 casas. */
  function _tint(value) {
    if (_isBlank(value)) return undefined;
    if (typeof value !== 'number' || !(value >= 0 && value <= 1)) _fail('Película inválida: informe um número entre 0 e 1');
    return Math.round(value * 100) / 100;
  }

  const _compact = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  // ===== Normalização =====

  function _normalizeSheet(raw) {
    const { YEAR_MIN, YEAR_MAX } = Constants.VEHICLE;
    const texts = Object.fromEntries(SHEET_TEXT_FIELDS.map(f => [f, _text(raw[f])]));
    if (!texts.nickname && !texts.model) _fail('Informe o apelido ou o modelo do veículo');
    return _compact({
      ...texts,
      yearMade: _int(raw.yearMade, 'Ano de fabricação', YEAR_MIN, YEAR_MAX),
      yearModel: _int(raw.yearModel, 'Ano do modelo', YEAR_MIN, YEAR_MAX),
      purchaseDate: _date(raw.purchaseDate, 'Data da compra'),
      purchaseKm: _km(raw.purchaseKm, 'Km da compra'),
      paintHex: _hex(raw.paintHex, 'Cor da pintura')
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
      qty: _int(raw.qty, 'Quantidade', Constants.VEHICLE.QTY_MIN, Constants.VEHICLE.QTY_MAX) ?? 1,
      priceCentavos: _centavos(raw.priceCentavos, 'Preço da peça'),
      warrantyUntil: _date(raw.warrantyUntil, 'Garantia')
    });
  }

  function _normalizeZones(zones) {
    if (zones == null) return [];
    if (!Array.isArray(zones)) _fail('zonas deve ser uma lista');
    return [...new Set(zones.map(z => _oneOf(z, Constants.VEHICLE.ZONES, 'Zona')))];
  }

  function _normalizeParts(parts) {
    if (_isBlank(parts)) return [];
    if (!Array.isArray(parts)) _fail('pecas deve ser uma lista');
    return parts.map(_normalizePart);
  }

  /** Sem status o registro é 'done'; sem tipo, 'service'. Sintoma nasce (e fica) em 'todo' enquanto aberto. */
  function _normalizeKind(raw) {
    const type = _isBlank(raw.type) ? CARD_TYPE.SERVICE : _oneOf(raw.type, Constants.VEHICLE.CARD_TYPES, 'Tipo', 'inválido');
    if (_isBlank(raw.status)) return { type, status: type === CARD_TYPE.SYMPTOM ? CARD_STATUS.TODO : CARD_STATUS.DONE };
    const status = _oneOf(raw.status, Constants.VEHICLE.CARD_STATUSES, 'Coluna');
    const openSymptom = type === CARD_TYPE.SYMPTOM && status !== CARD_STATUS.DONE;
    if (openSymptom && status !== CARD_STATUS.TODO) _fail('Sintoma aberto fica sempre em A fazer: não use Ideias nem Fazendo');
    return { type, status };
  }

  function _normalizeZonesFor(raw, type) {
    const zones = _normalizeZones(raw.zones);
    if (type === CARD_TYPE.SYMPTOM && !zones.length) _fail('Sintoma precisa de ao menos uma zona');
    return zones;
  }

  /** Só sintoma concluído guarda a manutenção que o resolveu. */
  function _resolvedById({ resolvedById }, { type, status }) {
    if (type !== CARD_TYPE.SYMPTOM || status !== CARD_STATUS.DONE) return undefined;
    return _text(resolvedById) || _fail('Sintoma só é concluído indicando a manutenção que o resolveu');
  }

  /** Só modificação tem efeito visual; em outro tipo é erro (nunca descarta em silêncio). Vazio ou null = sem efeito. */
  function _normalizeVisualEffect(raw, type) {
    if (raw == null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) _fail('Efeito visual inválido');
    const unknown = Object.keys(raw).find(key => !VISUAL_KEYS.includes(key));
    if (unknown) _fail(`Efeito visual: campo desconhecido "${unknown}"`);
    const { RIDE_MIN_CM, RIDE_MAX_CM } = Constants.VEHICLE.VISUAL;
    const effect = _compact({
      paint: _hex(raw.paint, 'Cor da pintura'),
      wheels: _hex(raw.wheels, 'Cor das rodas'),
      tint: _tint(raw.tint),
      rideHeight: _int(raw.rideHeight, 'Altura', RIDE_MIN_CM, RIDE_MAX_CM)
    });
    if (!Object.keys(effect).length) return undefined;
    if (type !== CARD_TYPE.MOD) _fail('Efeito visual só vale em Modificação: mude o tipo para Modificação ou limpe o efeito (null)');
    return effect;
  }

  function _normalizeMaintenance(raw) {
    const title = _text(raw.title);
    if (!title) _fail('O título da manutenção é obrigatório');
    const category = _isBlank(raw.category) ? 'other' : _oneOf(raw.category, Constants.VEHICLE.CATEGORIES, 'Categoria');
    const kind = _normalizeKind(raw);
    const open = kind.status !== CARD_STATUS.DONE;
    return _compact({
      id: raw.id || Utils.uid(),
      date: open ? _date(raw.date, 'Data') : _requiredDate(raw.date, 'Data'),
      km: _km(raw.km),
      title,
      ...kind,
      category,
      zones: _normalizeZonesFor(raw, kind.type),
      shop: _text(raw.shop),
      parts: _normalizeParts(raw.parts),
      laborCentavos: _centavos(raw.laborCentavos, 'Mão de obra'),
      estimateCentavos: _int(raw.estimateCentavos, 'Estimativa', 0, Constants.VEHICLE.CENTAVOS_MAX),
      resolvedById: _resolvedById(raw, kind),
      visualEffect: _normalizeVisualEffect(raw.visualEffect, kind.type),
      notes: _text(raw.notes, Constants.VEHICLE.NOTES_MAX),
      transactionIds: open ? [] : [...(raw.transactionIds || [])]
    });
  }

  // ===== Acesso =====

  const _vehicles = () => AppState.getDB().vehicles;

  // Registro antigo não tem status nem tipo: vale 'done' e 'service' (sem migração).
  const statusOf = m => m.status || CARD_STATUS.DONE;
  const typeOf = m => m.type || CARD_TYPE.SERVICE;
  const isDone = m => statusOf(m) === CARD_STATUS.DONE;
  const isSymptom = m => typeOf(m) === CARD_TYPE.SYMPTOM;

  /** Conta como histórico (custos, km, caderno, oficinas): concluído e que não seja sintoma. */
  const isHistory = m => isDone(m) && !isSymptom(m);

  /** Manutenções que contam como histórico; todas as consultas de custo e km passam por aqui. */
  const _history = vehicle => vehicle.maintenances.filter(isHistory);

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

  const SHEET_KEYS = [...SHEET_TEXT_FIELDS, 'yearMade', 'yearModel', 'purchaseDate', 'purchaseKm', 'paintHex'];

  function _updateSheet(existing, fields) {
    SHEET_KEYS.forEach(k => delete existing[k]);
    Object.assign(existing, fields, { updatedAt: Date.now() });
  }

  /** O km da compra não pode passar de nenhum km registrado a partir da data da compra; só checa quando km ou data mudam. */
  function _assertPurchaseKm(vehicle, fields) {
    const { purchaseKm, purchaseDate } = fields;
    if (!Number.isInteger(purchaseKm) || !purchaseDate) return;
    if (purchaseKm === vehicle.purchaseKm && purchaseDate === vehicle.purchaseDate) return;
    const points = _kmPoints(vehicle, vehicle.odometer).filter(p => p.type !== 'purchase');
    _assertKmFits(points, { before: () => false, after: p => p.date >= purchaseDate }, purchaseKm, true);
  }

  /** Cria o veículo do projeto no primeiro save e atualiza nos seguintes. */
  function saveSheet(projectId, patch) {
    return _guard(() => {
      if (!projectId) _fail('Projeto não informado');
      const existing = getByProject(projectId);
      const current = existing ? Object.fromEntries(SHEET_KEYS.map(k => [k, existing[k]])) : {};
      const fields = _normalizeSheet({ ...current, ...patch });
      if (existing) _assertPurchaseKm(existing, fields);
      if (existing) _updateSheet(existing, fields);
      else _createVehicle(projectId, fields);
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

  const KM_HINTS = {
    maintenance: { plain: 'Corrija o km dessa manutenção.', blank: 'Corrija o km dessa manutenção ou deixe o km deste registro em branco.' },
    reading: {
      plain: 'Remova essa leitura na ficha (Leituras de km) se ela estiver errada.',
      blank: 'Remova essa leitura na ficha (Leituras de km) se ela estiver errada, ou deixe o km deste registro em branco.'
    },
    purchase: { plain: 'Corrija o km da compra na ficha.', blank: 'Corrija o km da compra na ficha.' }
  };
  const _fmtKm = km => km.toLocaleString('pt-BR');

  /** Todos os km conhecidos do veículo (leituras, manutenções com km, compra), com a descrição para a mensagem de erro. */
  function _kmPoints(vehicle, readings, exceptMaintenanceId) {
    const points = readings.map(r => ({ type: 'reading', km: r.km, date: r.date,
      text: `em ${Utils.fmtDateFull(r.date)} o odômetro marcava ${_fmtKm(r.km)} km` }));
    _history(vehicle).filter(m => Number.isInteger(m.km) && m.id !== exceptMaintenanceId).forEach(m => points.push({
      type: 'maintenance', km: m.km, date: m.date, text: `há uma manutenção de ${_fmtKm(m.km)} km em ${Utils.fmtDateFull(m.date)}` }));
    if (vehicle.purchaseDate && Number.isInteger(vehicle.purchaseKm)) {
      points.push({ type: 'purchase', km: vehicle.purchaseKm, date: vehicle.purchaseDate,
        text: `a compra registrou ${_fmtKm(vehicle.purchaseKm)} km em ${Utils.fmtDateFull(vehicle.purchaseDate)}` });
    }
    return points;
  }

  /**
   * `before` e `after` dizem quais pontos limitam o km por baixo e por cima; o violador mais próximo vira o erro.
   * `canBlank`: o registro que está sendo salvo aceita ficar sem km (a dica sugere isso).
   */
  function _assertKmFits(points, { before, after }, km, canBlank) {
    const tooHigh = points.filter(p => before(p) && p.km > km).sort((a, b) => b.km - a.km)[0];
    const tooLow = points.filter(p => after(p) && p.km < km).sort((a, b) => a.date.localeCompare(b.date))[0];
    const violated = tooHigh || tooLow;
    if (violated) _fail(`Km incoerente: ${violated.text}. ${KM_HINTS[violated.type][canBlank ? 'blank' : 'plain']}`);
  }

  function _assertOdometerOrder(vehicle, readings, date, km) {
    _assertKmFits(_kmPoints(vehicle, readings), {
      before: p => (p.type === 'reading' ? p.date < date : p.date <= date),
      after: p => p.type !== 'purchase' && p.date > date
    }, km, false);
  }

  /** Km da manutenção precisa caber entre o que veio antes e o que veio depois; no mesmo dia, manutenções não se restringem. */
  function _assertMaintenanceKm(vehicle, maintenance) {
    if (!Number.isInteger(maintenance.km)) return;
    const { date } = maintenance;
    _assertKmFits(_kmPoints(vehicle, vehicle.odometer, maintenance.id), {
      before: p => (p.type === 'purchase' ? p.date <= date : p.date < date),
      after: p => p.type !== 'purchase' && (p.type === 'reading' ? p.date >= date : p.date > date)
    }, maintenance.km, true);
  }

  /** Registra a leitura do odômetro; a mesma data substitui a anterior. */
  function addOdometer(vehicleId, { date, km } = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const reading = { id: Utils.uid(), date: _requiredDate(date, 'Data'), km: _km(km) ?? _fail('O km é obrigatório') };
      const others = vehicle.odometer.filter(r => r.date !== reading.date);
      _assertOdometerOrder(vehicle, others, reading.date, reading.km);
      vehicle.odometer = [...others, reading].sort((a, b) => a.date.localeCompare(b.date));
      vehicle.updatedAt = Date.now();
      AppState.persist();
      return reading;
    });
  }

  function removeOdometer(vehicleId, readingId) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      if (!vehicle.odometer.some(r => r.id === readingId)) _fail('Leitura não encontrada');
      vehicle.odometer = vehicle.odometer.filter(r => r.id !== readingId);
      _touch(vehicle);
      return true;
    });
  }

  /** Maior km conhecido entre leituras, manutenções e km da compra (null se nenhum). */
  function getCurrentKm(vehicle) {
    const kms = [
      ...vehicle.odometer.map(r => r.km),
      ..._history(vehicle).map(m => m.km),
      vehicle.purchaseKm
    ].filter(Number.isInteger);
    return kms.length ? Math.max(...kms) : null;
  }

  // ===== Manutenções =====

  function _touch(vehicle) {
    vehicle.updatedAt = Date.now();
    AppState.persist();
  }

  /** O sintoma guarda quando começou. Fora do histórico, essa data não entra em custo nem na regra de km. */
  const _withStartDate = m => (isSymptom(m) && !m.date ? { ...m, date: Utils.today() } : m);

  function addMaintenance(vehicleId, dto = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const now = Date.now();
      const maintenance = _withStartDate({ ..._normalizeMaintenance(dto), createdAt: now, updatedAt: now });
      if (isSymptom(maintenance) && isDone(maintenance)) _fail('Um sintoma novo nasce aberto');
      if (isHistory(maintenance)) _assertMaintenanceKm(vehicle, maintenance);
      vehicle.maintenances.push(maintenance);
      _touch(vehicle);
      return maintenance;
    });
  }

  function _findMaintenance(vehicle, id) {
    return vehicle.maintenances.find(m => m.id === id) || _fail('Manutenção não encontrada');
  }

  /** No patch, `null` em peças/zonas significa "não mexer" (diferente de `[]`, que limpa). */
  function _withoutNullLists(patch) {
    const kept = { ...patch };
    ['parts', 'zones'].forEach(k => { if (kept[k] === null) delete kept[k]; });
    return kept;
  }

  /** Checado antes da normalização, para a mensagem certa (senão apareceria a de resolução). */
  function _assertNotBecomingSymptom(current, patch) {
    if (patch.type === CARD_TYPE.SYMPTOM && isDone(current) && !isSymptom(current)) _fail('Registro concluído não pode virar sintoma');
  }

  function _assertTransition(current, next) {
    if (isDone(current) && !isDone(next)) _fail('Registro concluído não volta para o quadro: edite ou exclua');
    const switchesSymptom = isSymptom(current) !== isSymptom(next);
    if (switchesSymptom && (isDone(current) || isDone(next))) _fail('Só dá para trocar o tipo de/para Sintoma enquanto o card está aberto');
  }

  /** O sintoma concluído aponta para uma manutenção do histórico do mesmo veículo. */
  function _assertResolution(vehicle, next) {
    if (!isSymptom(next) || !isDone(next)) return;
    const target = vehicle.maintenances.find(m => m.id === next.resolvedById);
    if (!target) _fail('A manutenção que resolveu o sintoma não foi encontrada neste veículo');
    if (!isHistory(target)) _fail('Só uma manutenção concluída (Feito) resolve um sintoma');
  }

  /** A regra de km vale para quem é histórico: ao concluir (sempre) e, depois, quando km ou data mudam. */
  function _needsKmCheck(current, next) {
    if (!isHistory(next)) return false;
    return !isDone(current) || next.km !== current.km || next.date !== current.date;
  }

  function updateMaintenance(vehicleId, id, patch = {}) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      const current = _findMaintenance(vehicle, id);
      _assertNotBecomingSymptom(current, patch);
      const next = _normalizeMaintenance({ ...current, ..._withoutNullLists(patch), id: current.id });
      _assertTransition(current, next);
      _assertResolution(vehicle, next);
      if (_needsKmCheck(current, next)) _assertMaintenanceKm(vehicle, next);
      const { createdAt } = current;
      Object.keys(current).forEach(k => delete current[k]);
      Object.assign(current, next, { createdAt, updatedAt: Date.now() });
      _touch(vehicle);
      return current;
    });
  }

  /** Sintomas que a manutenção removida resolvia voltam para 'A fazer'. */
  function _reopenSymptomsResolvedBy(vehicle, maintenanceId) {
    vehicle.maintenances.filter(m => isSymptom(m) && m.resolvedById === maintenanceId).forEach(symptom => {
      delete symptom.resolvedById;
      Object.assign(symptom, { status: CARD_STATUS.TODO, updatedAt: Date.now() });
    });
  }

  function removeMaintenance(vehicleId, id) {
    return _guard(() => {
      const vehicle = _requireVehicle(vehicleId);
      _findMaintenance(vehicle, id);
      _reopenSymptomsResolvedBy(vehicle, id);
      vehicle.maintenances = vehicle.maintenances.filter(m => m.id !== id);
      _touch(vehicle);
      return true;
    });
  }

  /** Qualquer registro do veículo (aberto, concluído ou sintoma). */
  function getMaintenance(vehicleId, id) {
    return _guard(() => _findMaintenance(_requireVehicle(vehicleId), id));
  }

  const _recentlyUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

  /** Todos os registros do veículo, inclusive cards abertos e sintomas, do mais recentemente alterado ao mais antigo. */
  function listCards(vehicleId, { status, type, zone } = {}) {
    return _guard(() => _requireVehicle(vehicleId).maintenances
      .filter(m => (!status || statusOf(m) === status) && (!type || typeOf(m) === type) && (!zone || m.zones.includes(zone)))
      .sort(_recentlyUpdated));
  }

  // ===== Consultas derivadas (nada é guardado) =====

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

  /** Custo por km e por 1.000 km (centavos inteiros); nulos sem km rodados. */
  function _costPerKm(vehicle, totalCentavos, currentKm) {
    const startKm = _startKm(vehicle);
    const driven = startKm == null || currentKm == null ? 0 : currentKm - startKm;
    if (driven <= 0) return { costPerKmCentavos: null, costPer1000KmCentavos: null };
    return {
      costPerKmCentavos: Math.round(totalCentavos / driven),
      costPer1000KmCentavos: Math.round(totalCentavos * Constants.VEHICLE.KM_PER_COST_BASE / driven)
    };
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
        ..._costPerKm(vehicle, totalCentavos, currentKm)
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
  const _hasPrice = use => use.part.priceCentavos > 0;

  function _lastUse({ part, maintenance }, currentKm) {
    return { maintenanceId: maintenance.id, date: maintenance.date, km: maintenance.km ?? null,
      daysAgo: _daysSince(maintenance.date), kmAgo: _kmSince(maintenance.km, currentKm),
      store: part.store, brand: part.brand, qty: part.qty,
      unitPriceCentavos: part.priceCentavos > 0 ? _unitPrice(part) : null };
  }

  function _notebookItem(key, uses, currentKm) {
    const last = uses[uses.length - 1];
    return {
      key,
      name: last.part.name,
      code: last.part.code,
      lastUse: _lastUse(last, currentKm),
      priceHistory: uses.filter(_hasPrice).map(u => ({ date: u.maintenance.date, unitPriceCentavos: _unitPrice(u.part), store: u.part.store })),
      timesReplaced: uses.length,
      warranty: _warranty(last, currentKm),
      _haystack: Utils.normalizeText(uses.flatMap(u => [u.part.name, u.part.brand, u.part.code, u.part.store]).filter(Boolean).join(' '))
    };
  }

  function getPartsNotebook(vehicleId, { text, zone } = {}) {
    return _query(vehicleId, vehicle => {
      const currentKm = getCurrentKm(vehicle);
      const matchesText = _textMatcher(text);
      const inZone = _history(vehicle).filter(m => !zone || m.zones.includes(zone));
      return [..._groupPartUses(inZone)]
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
    removeOdometer,
    getCurrentKm,
    statusOf,
    typeOf,
    isDone,
    isHistory,
    getMaintenance,
    listCards,
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
