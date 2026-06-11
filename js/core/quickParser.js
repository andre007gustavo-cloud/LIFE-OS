/**
 * ===================== QUICK PARSER =====================
 * Parser de linguagem natural (pt-BR) para o quick-add de tarefas.
 * Funções puras: sem DOM, sem estado, sem storage. Depende só de Utils.
 * As áreas vêm por parâmetro para o parser não depender de services.
 */

const QuickParser = (() => {

  const WEEKDAYS = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3,
    quinta: 4, sexta: 5, sabado: 6
  };

  const PRIORITY_BANGS = { '!': 'baixa', '!!': 'media', '!!!': 'alta' };

  // Hora exige sufixo "h" ou ":" para não confundir com número solto
  const TIME_ATOM = '(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))';

  /** lowercase + sem acentos, para comparações insensíveis */
  function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Procura o padrão no texto; o primeiro match cujo toValue devolve um
   * valor válido (não-null) é removido do texto e o valor retornado.
   * Os padrões começam com \s e terminam com (?=\s) — o texto é "acolchoado"
   * com espaços nas pontas, então todo token tem espaço em volta.
   */
  function extract(state, regex, toValue) {
    const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let m;
    while ((m = g.exec(state.text))) {
      const value = toValue(m);
      if (value !== null && value !== undefined) {
        state.text = state.text.slice(0, m.index) + ' ' + state.text.slice(m.index + m[0].length);
        return value;
      }
    }
    return null;
  }

  // ===== Prioridade =====

  function parsePriority(state) {
    const word = extract(state, /\s!(alta|m[eé]dia|baixa)(?=\s)/i,
      m => normalize(m[1]));
    if (word) return word;
    return extract(state, /\s(!{1,3})(?=\s)/, m => PRIORITY_BANGS[m[1]]) || '';
  }

  // ===== Área (#nome) =====

  function parseArea(state, areas) {
    let areaId = '';
    let token;
    // Remove todos os tokens #...; usa o primeiro que casa com uma área
    while ((token = extract(state, /\s#(\S+)(?=\s)/, m => m[1])) !== null) {
      if (areaId) continue;
      const t = normalize(token);
      const match = areas.find(a => {
        const name = normalize(a.name);
        return name === t || name.replace(/\s+/g, '') === t;
      });
      if (match) areaId = match.id;
    }
    return areaId;
  }

  // ===== Data =====

  function parseDate(state, todayISO) {
    if (extract(state, /\sdepois de amanh[aã](?=\s)/i, () => true)) return Utils.addDays(todayISO, 2);
    if (extract(state, /\samanh[aã](?=\s)/i, () => true)) return Utils.addDays(todayISO, 1);
    if (extract(state, /\shoje(?=\s)/i, () => true)) return todayISO;

    const absolute = extract(state, /\s(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s)/,
      m => absoluteDate(todayISO, +m[1], +m[2], m[3] ? +m[3] : null));
    if (absolute) return absolute;

    const dayOfMonth = extract(state, /\sdia (\d{1,2})(?=\s)/i,
      m => nextDayOfMonth(todayISO, +m[1]));
    if (dayOfMonth) return dayOfMonth;

    const weekday = extract(state,
      /\s(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(?:-feira)?(?=\s)/i,
      m => nextWeekday(todayISO, WEEKDAYS[normalize(m[1])]));
    return weekday || '';
  }

  /** Monta ISO validando que o dia existe no mês (ex.: rejeita 31/02) */
  function buildISO(year, month, day) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return Utils.toISO(d);
  }

  function absoluteDate(todayISO, day, month, year) {
    if (month < 1 || month > 12) return null;
    if (year) return buildISO(year, month, day);
    const y = Utils.parseISO(todayISO).getFullYear();
    const sameYear = buildISO(y, month, day);
    if (!sameYear) return null;
    // Sem ano explícito: assume a próxima ocorrência da data
    return sameYear >= todayISO ? sameYear : buildISO(y + 1, month, day);
  }

  function nextDayOfMonth(todayISO, day) {
    if (day < 1 || day > 31) return null;
    const base = Utils.parseISO(todayISO);
    let candidate = buildISO(base.getFullYear(), base.getMonth() + 1, day);
    // Já passou ou o dia não existe neste mês: avança até achar
    for (let i = 1; i <= 12 && (!candidate || candidate < todayISO); i++) {
      const m = new Date(base.getFullYear(), base.getMonth() + i, 1);
      candidate = buildISO(m.getFullYear(), m.getMonth() + 1, day);
    }
    return candidate;
  }

  function nextWeekday(todayISO, targetDow) {
    const diff = (targetDow - Utils.parseISO(todayISO).getDay() + 7) % 7;
    return Utils.addDays(todayISO, diff === 0 ? 7 : diff);
  }

  // ===== Horário =====

  function parseTime(state) {
    const range = extract(state,
      new RegExp('\\s' + TIME_ATOM + '\\s?-\\s?' + TIME_ATOM + '(?=\\s)'),
      m => {
        const time = toTime(m[1], m[2] || m[3]);
        const timeend = toTime(m[4], m[5] || m[6]);
        return (time && timeend) ? { time, timeend } : null;
      });
    if (range) return range;

    const single = extract(state, new RegExp('\\s' + TIME_ATOM + '(?=\\s)'),
      m => toTime(m[1], m[2] || m[3]));
    return { time: single || '', timeend: '' };
  }

  function toTime(h, min) {
    const hour = +h;
    const mins = +(min || 0);
    if (hour > 23 || mins > 59) return null;
    return String(hour).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }

  // ===== API =====

  /**
   * Interpreta o texto do quick-add.
   * @param {string} text     texto digitado pelo usuário
   * @param {Array}  areas    áreas existentes ({ id, name }) para casar "#nome"
   * @param {string} todayISO data de referência (default: hoje) — injetável p/ testes
   * @returns {{name, date, time, timeend, priority, areaId}} campos não
   *          reconhecidos voltam como string vazia
   */
  function parse(text, areas = [], todayISO = Utils.today()) {
    const state = { text: ' ' + String(text || '') + ' ' };
    const priority = parsePriority(state);
    const areaId = parseArea(state, areas);
    const date = parseDate(state, todayISO);
    const { time, timeend } = parseTime(state);
    const name = state.text.replace(/\s+/g, ' ').trim();
    return { name, date, time, timeend, priority, areaId };
  }

  return { parse };
})();
