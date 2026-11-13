/**
 * ===================== VEHICLE HEALTH SERVICE =====================
 * Saúde do veículo: o plano preventivo (o que fazer a cada tantos km ou meses),
 * a situação de cada item (atrasado, em breve, em dia, sem registro), a previsão
 * pela média de km rodados e os alertas (plano e garantias de peças).
 * O plano fica em vehicle.plan; a situação é sempre calculada do histórico:
 * um item conta como feito quando existe manutenção concluída que combina com
 * a categoria e as palavras dele, ou quando a "última vez" foi informada à mão.
 *
 * Camada de serviço: ZERO DOM e nada de window/document no topo (o arquivo
 * também roda no vm do conector MCP). Erros de negócio voltam como { erro }.
 * Leitura nunca grava.
 */

const VehicleHealthService = (() => {

  const { HEALTH, CATEGORIES, NOTES_MAX } = Constants.VEHICLE;
  const { STATUS } = HEALTH;
  const { fail, guard, isBlank, compact, text, date, int, km, oneOf, zones, requireVehicle, touch } = VehicleService.rules;
  const STATUS_ORDER = [STATUS.OVERDUE, STATUS.SOON, STATUS.UNKNOWN, STATUS.OK];

  /** Leitura nunca grava: o primeiro item é que cria a chave `plan`. */
  const _plan = vehicle => vehicle.plan || [];
  const _fmtKm = value => value.toLocaleString('pt-BR');
  const _plural = (count, one, many) => `${_fmtKm(count)} ${count === 1 ? one : many}`;

  /** Minúsculas, sem acento e sem pontuação: "Ar-condicionado" e "ar condicionado" ficam iguais. */
  const _plain = value => Utils.normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();

  // ===== Normalização =====

  function _normalizeKeywords(value) {
    if (isBlank(value)) return [];
    const list = Array.isArray(value) ? value : String(value).split(',');
    return [...new Set(list.map(_plain).filter(Boolean))].slice(0, HEALTH.KEYWORDS_MAX);
  }

  /** "Última vez" informada à mão: data (nunca futura) e km, cada um opcional. */
  function _normalizeBase(raw) {
    const baseDate = date(raw.baseDate, 'Data da última vez');
    if (baseDate && baseDate > Utils.today()) fail('A data da última vez não pode ser no futuro');
    return { baseDate, baseKm: km(raw.baseKm, 'Km da última vez') };
  }

  function _normalizeIntervals(raw) {
    const intervalKm = int(raw.intervalKm, 'Intervalo em km', 1, HEALTH.INTERVAL_KM_MAX);
    const intervalMonths = int(raw.intervalMonths, 'Intervalo em meses', 1, HEALTH.INTERVAL_MONTHS_MAX);
    if (!intervalKm && !intervalMonths) fail('Informe o intervalo em km, em meses ou os dois');
    return { intervalKm, intervalMonths };
  }

  function _normalizeItem(raw) {
    return compact({
      id: raw.id || Utils.uid(),
      title: text(raw.title) || fail('O título do item do plano é obrigatório'),
      category: isBlank(raw.category) ? undefined : oneOf(raw.category, CATEGORIES, 'Categoria'),
      keywords: _normalizeKeywords(raw.keywords),
      ..._normalizeIntervals(raw),
      zones: zones(raw.zones),
      highlight: raw.highlight ? true : undefined,
      ..._normalizeBase(raw),
      notes: text(raw.notes, NOTES_MAX)
    });
  }

  // ===== Plano: escrita =====

  function _findItem(vehicle, itemId) {
    return _plan(vehicle).find(item => item.id === itemId) || fail('Item do plano não encontrado');
  }

  function _assertUniqueTitle(vehicle, item) {
    const taken = _plan(vehicle).some(other => other.id !== item.id && _plain(other.title) === _plain(item.title));
    if (taken) fail(`Já existe um item "${item.title}" no plano`);
  }

  function addItem(vehicleId, dto = {}) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const now = Date.now();
      const item = { ..._normalizeItem({ ...dto, id: undefined }), createdAt: now, updatedAt: now };
      _assertUniqueTitle(vehicle, item);
      vehicle.plan = [..._plan(vehicle), item];
      touch(vehicle);
      return item;
    });
  }

  function updateItem(vehicleId, itemId, patch = {}) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const current = _findItem(vehicle, itemId);
      const next = _normalizeItem({ ...current, ...patch, id: current.id });
      _assertUniqueTitle(vehicle, next);
      const { createdAt } = current;
      Object.keys(current).forEach(key => delete current[key]);
      Object.assign(current, next, { createdAt, updatedAt: Date.now() });
      touch(vehicle);
      return current;
    });
  }

  function removeItem(vehicleId, itemId) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const item = _findItem(vehicle, itemId);
      vehicle.plan = vehicle.plan.filter(other => other.id !== itemId);
      touch(vehicle);
      return item;
    });
  }

  /** Itens do plano sugerido que o veículo ainda não tem (pelo título). */
  function listMissingSuggestions(vehicleId) {
    return guard(() => {
      const taken = new Set(_plan(requireVehicle(vehicleId)).map(item => _plain(item.title)));
      return HEALTH.SUGGESTED_PLAN.filter(suggestion => !taken.has(_plain(suggestion.title)));
    });
  }

  /** Acrescenta ao plano os itens sugeridos que faltam; o que já existe não é tocado. */
  function useSuggestedPlan(vehicleId) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const now = Date.now();
      const added = listMissingSuggestions(vehicleId).map(s => ({ ..._normalizeItem(s), createdAt: now, updatedAt: now }));
      if (!added.length) return { added: 0 };
      vehicle.plan = [..._plan(vehicle), ...added];
      touch(vehicle);
      return { added: added.length };
    });
  }

  /** Registra à mão a última vez em que o item foi feito (padrão: hoje, no km atual). */
  function markDone(vehicleId, itemId, { date: doneDate, km: doneKm } = {}) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      _findItem(vehicle, itemId);
      const baseKm = isBlank(doneKm) ? VehicleService.getCurrentKm(vehicle) ?? undefined : doneKm;
      return updateItem(vehicleId, itemId, { baseDate: doneDate || Utils.today(), baseKm });
    });
  }

  // ===== Última vez =====

  /** A palavra precisa começar uma palavra do texto: "vela" casa com "velas", não com "nivelamento". */
  const _hasKeyword = (haystack, keyword) => ` ${haystack}`.includes(` ${keyword}`);

  function _matches(item, maintenance) {
    if (!item.category && !item.keywords.length) return false;
    if (item.category && maintenance.category !== item.category) return false;
    if (!item.keywords.length) return true;
    const haystack = _plain([maintenance.title, ...maintenance.parts.map(part => part.name)].join(' '));
    return item.keywords.some(keyword => _hasKeyword(haystack, keyword));
  }

  function _fromHistory(item, history) {
    const match = history.find(maintenance => _matches(item, maintenance));
    return match ? { date: match.date, km: match.km ?? null, source: 'history', maintenanceId: match.id, title: match.title } : null;
  }

  function _fromBase(item) {
    if (!item.baseDate && !Number.isInteger(item.baseKm)) return null;
    return { date: item.baseDate || null, km: item.baseKm ?? null, source: 'manual' };
  }

  /** Vale o mais recente: pela data; sem data na base, pelo km; na dúvida, o histórico. */
  function _latest(recorded, manual) {
    if (!recorded || !manual) return recorded || manual;
    if (manual.date) return manual.date > recorded.date ? manual : recorded;
    const manualIsLater = Number.isInteger(recorded.km) && manual.km > recorded.km;
    return manualIsLater ? manual : recorded;
  }

  // ===== Vencimento =====

  function _addMonths(isoDate, months) {
    const day = Utils.parseISO(isoDate);
    const dayOfMonth = day.getDate();
    day.setDate(1);
    day.setMonth(day.getMonth() + months);
    const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    day.setDate(Math.min(dayOfMonth, lastDay));
    return Utils.toISO(day);
  }

  /** Quando o item vence por km e por tempo, e quanto falta (negativo = passou). */
  function _due(item, last, currentKm) {
    const dueKm = last && Number.isInteger(last.km) && item.intervalKm ? last.km + item.intervalKm : null;
    const dueDate = last && last.date && item.intervalMonths ? _addMonths(last.date, item.intervalMonths) : null;
    return {
      dueKm,
      dueDate,
      remainingKm: dueKm != null && currentKm != null ? dueKm - currentKm : null,
      remainingDays: dueDate ? Utils.diffDays(Utils.today(), dueDate) : null
    };
  }

  /** Data em que o km de vencimento deve chegar, pelo ritmo de km rodados; null sem ritmo ou já vencido. */
  function _forecastDate(remainingKm, pace) {
    if (remainingKm == null || remainingKm <= 0 || !pace) return null;
    return Utils.addDays(Utils.today(), Math.ceil(remainingKm / pace.kmPerDay));
  }

  function _statusOf(last, { remainingKm, remainingDays }) {
    const known = [remainingKm, remainingDays].filter(value => value != null);
    if (!last || !known.length) return STATUS.UNKNOWN;
    if (known.some(value => value < 0)) return STATUS.OVERDUE;
    const soon = (remainingKm != null && remainingKm <= HEALTH.SOON_KM) || (remainingDays != null && remainingDays <= HEALTH.SOON_DAYS);
    return soon ? STATUS.SOON : STATUS.OK;
  }

  // ===== Texto da situação =====

  function _unknownText(item, last) {
    if (!last) return 'Sem registro da última vez: informe quando foi feito ou registre a manutenção';
    return item.intervalKm ? 'Falta o km da última vez (ou o km atual do carro) para calcular' : 'Falta a data da última vez para calcular';
  }

  function _overdueText({ remainingKm, remainingDays }) {
    const parts = [];
    if (remainingKm != null && remainingKm < 0) parts.push(`passou ${_fmtKm(-remainingKm)} km`);
    if (remainingDays != null && remainingDays < 0) parts.push(`venceu há ${_plural(-remainingDays, 'dia', 'dias')}`);
    return `Atrasado: ${parts.join(' e ')}`;
  }

  function _remainingText({ remainingKm, remainingDays, dueDate, forecastDate }) {
    const limits = [];
    if (remainingKm != null) limits.push(`${_fmtKm(remainingKm)} km`);
    if (remainingDays != null) limits.push(`${_plural(remainingDays, 'dia', 'dias')} (até ${Utils.fmtDateFull(dueDate)})`);
    const remaining = `Faltam ${limits.join(' ou ')}`;
    return forecastDate ? `${remaining} · pelo seu ritmo, o km chega por volta de ${Utils.fmtDateFull(forecastDate)}` : remaining;
  }

  function _textOf(entry) {
    if (entry.status === STATUS.UNKNOWN) return _unknownText(entry.item, entry.last);
    return entry.status === STATUS.OVERDUE ? _overdueText(entry) : _remainingText(entry);
  }

  // ===== Ritmo de km =====

  /** Km por dia entre o primeiro e o último ponto; null com menos de PACE_MIN_DAYS entre eles ou sem km rodado. */
  function _paceBetween(points) {
    if (points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const days = Utils.diffDays(first.date, last.date);
    if (days < HEALTH.PACE_MIN_DAYS || last.km <= first.km) return null;
    return { kmPerDay: (last.km - first.km) / days };
  }

  /** Ritmo recente (últimos PACE_WINDOW_DAYS); se não der para medir, o de todo o período conhecido. */
  function _pace(vehicleId) {
    const points = VehicleService.listKmPoints(vehicleId);
    const windowStart = Utils.addDays(Utils.today(), -HEALTH.PACE_WINDOW_DAYS);
    return _paceBetween(points.filter(point => point.date >= windowStart)) || _paceBetween(points);
  }

  // ===== Situação =====

  function _entry(item, history, currentKm, pace) {
    const last = _latest(_fromHistory(item, history), _fromBase(item));
    const due = _due(item, last, currentKm);
    const entry = { item, last, ...due, forecastDate: _forecastDate(due.remainingKm, pace), status: _statusOf(last, due) };
    return { ...entry, text: _textOf(entry) };
  }

  /** Dias até vencer, pelo que chegar primeiro (data marcada ou previsão do km); sem prazo conhecido vai para o fim. */
  function _daysLeft(entry) {
    const candidates = [entry.remainingDays, entry.forecastDate ? Utils.diffDays(Utils.today(), entry.forecastDate) : null];
    if (entry.remainingKm != null && entry.remainingKm <= 0) candidates.push(entry.remainingKm);
    const known = candidates.filter(value => value != null);
    return known.length ? Math.min(...known) : Infinity;
  }

  /** Mais urgente primeiro: atrasado, em breve, sem registro (destaques antes), em dia; em cada grupo, o que vence antes. */
  function _byUrgency(a, b) {
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      || Number(Boolean(b.item.highlight)) - Number(Boolean(a.item.highlight))
      || _daysLeft(a) - _daysLeft(b);
  }

  function _counts(entries) {
    return Object.fromEntries(STATUS_ORDER.map(status => [status, entries.filter(entry => entry.status === status).length]));
  }

  // ===== Alertas =====

  /** Pede atenção: atrasado, em breve, ou item de destaque sem registro (a correia dentada). */
  const _needsAttention = entry => entry.status === STATUS.OVERDUE || entry.status === STATUS.SOON
    || (entry.status === STATUS.UNKNOWN && Boolean(entry.item.highlight));

  const _planAlert = entry => ({
    kind: 'plan', severity: entry.status, itemId: entry.item.id, zones: entry.item.zones,
    title: entry.item.title, text: entry.text
  });

  function _warrantyAlerts(vehicleId) {
    const today = Utils.today();
    return VehicleService.getPartsNotebook(vehicleId)
      .filter(part => part.warranty && part.warranty.active)
      .map(part => ({ part, daysLeft: Utils.diffDays(today, part.warranty.until) }))
      .filter(({ daysLeft }) => daysLeft <= HEALTH.WARRANTY_SOON_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .map(({ part, daysLeft }) => ({
        kind: 'warranty', severity: STATUS.SOON, maintenanceId: part.lastUse.maintenanceId, zones: [],
        title: `Garantia de ${part.name}`,
        text: daysLeft === 0 ? 'A garantia vence hoje' : `A garantia vence em ${_plural(daysLeft, 'dia', 'dias')} (${Utils.fmtDateFull(part.warranty.until)})`
      }));
  }

  /**
   * Situação do plano: cada item com a última vez, o vencimento, a previsão e o texto pronto;
   * os alertas (plano + garantias vencendo), a contagem por situação e a média de km por mês.
   */
  function getHealth(vehicleId) {
    return guard(() => {
      const vehicle = requireVehicle(vehicleId);
      const history = VehicleService.listMaintenances(vehicleId);
      const currentKm = VehicleService.getCurrentKm(vehicle);
      const pace = _pace(vehicleId);
      const items = _plan(vehicle).map(item => _entry(item, history, currentKm, pace)).sort(_byUrgency);
      return {
        currentKm,
        kmPerMonth: pace ? Math.round(pace.kmPerDay * HEALTH.DAYS_PER_MONTH) : null,
        items,
        counts: _counts(items),
        alerts: [...items.filter(_needsAttention).map(_planAlert), ..._warrantyAlerts(vehicleId)]
      };
    });
  }

  /** Zonas do carro com alguma revisão pedindo atenção. */
  function getAlertZones(vehicleId) {
    const health = getHealth(vehicleId);
    return health.erro ? [] : [...new Set(health.alerts.flatMap(alert => alert.zones))];
  }

  /** Alertas de todos os veículos (para o painel); só entram veículos com algo pedindo atenção. */
  function listAlerts() {
    return VehicleService.list()
      .map(vehicle => ({ vehicleId: vehicle.id, projectId: vehicle.projectId, name: vehicle.nickname || vehicle.model, alerts: getHealth(vehicle.id).alerts }))
      .filter(group => group.alerts.length);
  }

  return {
    addItem, updateItem, removeItem, markDone,
    listMissingSuggestions, useSuggestedPlan,
    getHealth, getAlertZones, listAlerts
  };
})();
