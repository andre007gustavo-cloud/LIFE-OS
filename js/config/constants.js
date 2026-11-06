/**
 * ===================== CONSTANTS =====================
 * Single source of truth for all magic values.
 * No business logic here — only static configuration.
 */

const Constants = (() => {

  /** Color palette available for area/project customization */
  const COLORS = [
    '#7c6fff', '#f87171', '#4ade80', '#fbbf24',
    '#60a5fa', '#f472b6', '#34d399', '#a78bfa', '#fb923c'
  ];

  /** Priority emoji icons */
  const PRI_ICONS = {
    alta: '🔴',
    media: '🟡',
    baixa: '🟢',
    nenhuma: '⚪'
  };

  /** Priority sort order (lower = higher priority) */
  const PRI_ORDER = {
    alta: 0,
    media: 1,
    baixa: 2,
    nenhuma: 3
  };

  /** Ordem do ciclo rápido de prioridade (clique no ícone de bandeira) */
  const PRI_CYCLE = ['nenhuma', 'alta', 'media', 'baixa'];

  /** Priority CSS color variables */
  const PRI_COLORS = {
    alta: 'var(--red)',
    media: 'var(--amber)',
    baixa: 'var(--green)',
    nenhuma: 'var(--text3)'
  };

  /** Pomodoro mode durations in seconds */
  const POMO_TIMES = {
    work: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
  };

  /** Time-blocking grid sizing */
  const TIME_GRID = {
    PX_PER_MIN: 1,
    HOUR_HEIGHT: 60,
    MIN_BLOCK_HEIGHT_MIN: 30
  };

  /** Calendar config */
  const CALENDAR = {
    MAX_MONTH_ROWS: 3,
    WEEK_DAY_NAMES_FULL: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    WEEK_DAY_NAMES_SHORT: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  };

  /** Hábitos: regras de escudo (proteção de sequência) */
  const HABITS = {
    SHIELD_EVERY: 7,   // cumprimentos consecutivos para ganhar 1 escudo
    SHIELD_MAX: 3      // máximo de escudos acumulados
  };

  /** Modo dia difícil */
  const HARD_MODE = {
    TASK_LIMIT: 3      // máximo de tarefas visíveis nas listas de hoje
  };

  /** Sequência global do app (ActivityService): escudos derivados da atividade real */
  const ACTIVITY = {
    SHIELD_EVERY: 7,   // dias ativos consecutivos para ganhar 1 escudo
    SHIELD_MAX: 3      // máximo de escudos acumulados
  };

  /** Contador "próximo compromisso" + limiares de cor */
  const NEXTUP = {
    REFRESH_MS: 30000,      // recálculo da faixa a cada 30s
    OVERDUE_GRACE_MIN: 60,  // janela em que uma tarefa recém-passada vira "atrasado"
    SOON_MIN: 30,           // ≤30min ainda não começado → indigo
    IMMINENT_MIN: 5         // ≤5min ainda não começado → âmbar
  };

  /** Revisão semanal + recomeço sem culpa */
  const REVIEW = {
    STALLED_DAYS: 14,        // projeto sem tarefa concluída há N dias = parado
    NUDGE_DAYS: 7,           // dias desde a última revisão para sugerir uma nova
    COMEBACK_DAYS: 5,        // dias de ausência para a tela de recomeço aparecer
    REVIEW_OVERDUE_KEEP: 5,  // recomeço "revisar as mais importantes": nº de vencidas mantidas
    COMEBACK_RECENT_DAYS: 7, // janela em que um recomeço ainda é mencionado na revisão
    GOALS_MAX: 3             // "as 3 grandes da semana"
  };

  /** Micro-recompensas e polish sensorial (Fase 8) */
  const FEEDBACK = {
    PREFS_KEY: 'lifeos_feedback_prefs',           // localStorage, por dispositivo (nunca sincroniza)
    DEFAULT_PREFS: { animations: true, sounds: false, confetti: true },
    VOLUME: 0.15,
    PULSE_MS: 180,           // pulso visual e atraso máximo de re-render pós-conclusão
    TOAST_MS: 2500,
    NUMBER_TICK_MS: 300,
    STREAK_MILESTONES: [7, 14, 30, 60, 100],
    CONFETTI: { MAX_PARTICLES: 60, DURATION_MS: 1200 },
    /** Sequências de tons (Web Audio): [freqHz, duraçãoMs] */
    TONES: {
      small:  [[523, 80]],
      medium: [[659, 120]],
      large:  [[783, 90], [988, 90], [1175, 140]]
    }
  };

  /**
   * Finanças (Fase 1). Seeds criados por FinanceService._seedDefaults no
   * primeiro uso — não ficam no SEED_DATA pra não recriar ao apagar tudo.
   */
  const FINANCE = {
    ACCOUNT_TYPES: ['corrente', 'poupanca', 'dinheiro'],
    // Orçamento (Fase 2): limiar de % (sobre a base) a partir do qual entra em "alerta"
    ORCAMENTO: { ALERTA_PCT: 80 },
    // Alertas proativos (Fase 7d): limiares dos disparos
    ALERTAS: {
      FATURA_DIAS: 7,          // fatura não paga vencendo em <= N dias
      ASSINATURA_DIAS: 90,     // assinatura não confirmada há >= N dias
      META_SEM_APORTE_MESES: 2 // meta sem aporte há >= N meses
    },
    // Lançamento automático da Carteira (Apple Pay): limites de validação e de duplicidade
    AUTO_LANCAMENTO: {
      DEDUP_MINUTOS: 10,
      VALOR_MAX_CENTAVOS: 5000000, // R$ 50.000
      TEXTO_MAX: 80,
      NOME_MIN: 3 // tamanho mínimo do nome contido no outro para casar por parcial
    },
    // Régua 50/30/20 (Fase 7f): proporções-alvo sobre a renda do mês
    R503020: { NECESSIDADE: 50, DESEJO: 30, POUPANCA: 20 },
    SEED_CONTA: {
      nome: 'Carteira', tipo: 'dinheiro',
      saldoInicialCentavos: 0, cor: '#34d399', icone: '💵'
    },
    SEED_CATEGORIAS: [
      { nome: 'Alimentação', tipo: 'despesa', icone: '🍔', cor: '#f87171', grupo503020: 'necessidade' },
      { nome: 'Mercado/casa', tipo: 'despesa', icone: '🛒', cor: '#fb923c', grupo503020: 'necessidade' },
      { nome: 'Transporte', tipo: 'despesa', icone: '🚌', cor: '#fbbf24', grupo503020: 'necessidade' },
      { nome: 'Moradia', tipo: 'despesa', icone: '🏠', cor: '#60a5fa', grupo503020: 'necessidade' },
      { nome: 'Saúde', tipo: 'despesa', icone: '❤️', cor: '#4ade80', grupo503020: 'necessidade' },
      { nome: 'Diversão', tipo: 'despesa', icone: '🎮', cor: '#7c6fff', grupo503020: 'desejo' },
      { nome: 'Outros', tipo: 'despesa', icone: '📦', cor: '#a78bfa', grupo503020: 'desejo' },
      { nome: 'Salário', tipo: 'receita', icone: '💰', cor: '#34d399' },
      { nome: 'Vendas', tipo: 'receita', icone: '🏷️', cor: '#4ade80' },
      { nome: 'Outros', tipo: 'receita', icone: '➕', cor: '#60a5fa' }
    ]
  };

  /** Modelos de projeto: definem quais abas o projeto mostra. */
  const PROJECT_TEMPLATES = {
    generic: { label: 'Genérico', icon: '📁', tabs: ['overview', 'tasks', 'notes', 'files'] },
    vehicle: { label: 'Veículo', icon: '🚗', tabs: ['garage', 'board', 'maintenances', 'parts', 'tasks', 'notes', 'files'] }
  };

  /** Rótulo (pt-BR) e ícone Tabler de cada aba de projeto. */
  const PROJECT_TABS = {
    overview: { label: 'Visão Geral', icon: 'layout-dashboard' },
    tasks: { label: 'Tarefas', icon: 'checklist' },
    notes: { label: 'Notas', icon: 'notes' },
    files: { label: 'Arquivos', icon: 'file' },
    garage: { label: 'Garagem', icon: 'car' },
    board: { label: 'Quadro', icon: 'layout-kanban' },
    maintenances: { label: 'Manutenções', icon: 'tool' },
    parts: { label: 'Peças e oficinas', icon: 'package' }
  };

  /** Modelo Veículo: categorias de manutenção, zonas do carro e vínculo com Finanças. */
  const VEHICLE = {
    CATEGORIES: [
      { id: 'oil-filters', label: 'Óleo e filtros' },
      { id: 'brakes', label: 'Freios' },
      { id: 'suspension-steering', label: 'Suspensão e direção' },
      { id: 'tires-wheels', label: 'Pneus e rodas' },
      { id: 'engine', label: 'Motor' },
      { id: 'timing-belt', label: 'Correia e sincronismo' },
      { id: 'cooling', label: 'Arrefecimento' },
      { id: 'transmission', label: 'Transmissão' },
      { id: 'electrical-battery', label: 'Elétrica e bateria' },
      { id: 'air-conditioning', label: 'Ar-condicionado' },
      { id: 'body-paint', label: 'Funilaria e pintura' },
      { id: 'cosmetic', label: 'Estética' },
      { id: 'accessories-mods', label: 'Acessórios e modificações' },
      { id: 'service', label: 'Revisão' },
      { id: 'other', label: 'Outros' }
    ],
    ZONES: [
      { id: 'engine', label: 'Motor' },
      { id: 'front', label: 'Dianteira' },
      { id: 'rear', label: 'Traseira' },
      { id: 'front-axle', label: 'Eixo dianteiro' },
      { id: 'rear-axle', label: 'Eixo traseiro' },
      { id: 'left-side', label: 'Lateral esquerda' },
      { id: 'right-side', label: 'Lateral direita' },
      { id: 'roof-glass', label: 'Teto e vidros' },
      { id: 'interior', label: 'Interior' },
      { id: 'underbody', label: 'Embaixo' }
    ],
    KM_MAX: 2000000,
    TEXT_MAX: 120,
    NOTES_MAX: 2000,
    YEAR_MIN: 1900,
    YEAR_MAX: 2100,
    QTY_MIN: 1,
    QTY_MAX: Number.MAX_SAFE_INTEGER,
    CENTAVOS_MAX: Number.MAX_SAFE_INTEGER,
    KM_PER_COST_BASE: 1000,
    DEFAULT_FINANCE_CATEGORY: 'Transporte',
    RECENT_MAINTENANCES: 3,
    TOP_ZONES: 5,
    FULL_BAR_PERCENT: 100,
    SEARCH_DEBOUNCE_MS: 250,
    MIN_COST_PER_KM_CENTAVOS: 1,
    CARD_STATUSES: [
      { id: 'idea', label: 'Ideias', aliases: ['ideia'] },
      { id: 'todo', label: 'A fazer' },
      { id: 'doing', label: 'Fazendo' },
      { id: 'done', label: 'Feito' }
    ],
    CARD_STATUS: { IDEA: 'idea', TODO: 'todo', DOING: 'doing', DONE: 'done' },
    CARD_TYPES: [
      { id: 'service', label: 'Serviço' },
      { id: 'mod', label: 'Modificação' },
      { id: 'symptom', label: 'Sintoma' }
    ],
    CARD_TYPE: { SERVICE: 'service', MOD: 'mod', SYMPTOM: 'symptom' },
    BOARD_DONE_LIMIT: 5,
    BOARD_SYMPTOMS_LABEL: 'Sintomas',
    BOARD_MOVE_DONE_LABEL: 'Feito (concluir)',
    DIAGNOSIS_TEMPLATE: 'Jarvis, meu carro {nickname} (veículo {vehicleId}) está com um sintoma: {description} — zona {zone}. Card {cardId}. Consulte get_zone_context dessa zona, cruze com o histórico, as peças, o km e a garantia, me diga as causas prováveis e atualize o card.',
    CARD_PREFIX: 'card:',
    LINK: { WINDOW_DAYS: 10, WIDE_WINDOW_DAYS: 45, MAX_SUGGESTIONS: 5 }
  };

  /** Default storage key */
  const STORAGE_KEY = 'lifeos';
  const THEME_KEY = 'lifeos-theme';

  /** Default seed data for first-time users */
  const SEED_DATA = {
    tasks: [],
    inbox: [],
    habits: [],
    habitLogs: [],
    hardModeDates: [],
    weeklyGoals: [],
    reviewLogs: [],
    events: [],
    activityShields: { available: 0, history: [] },
    activityRecord: { max: 0, achievedAt: '' },
    meta: {},
    areas: [
      { id: 'a1', name: 'Trabalho', icon: '💼', color: '#7c6fff',
        projects: [{ id: 'p1', name: 'Geral', status: 'ativo', desc: '' }] },
      { id: 'a2', name: 'Pessoal', icon: '🏠', color: '#4ade80', projects: [] },
      { id: 'a3', name: 'Saúde', icon: '❤️', color: '#f87171', projects: [] },
      { id: 'a4', name: 'Financeiro', icon: '💰', color: '#fbbf24', projects: [] },
      { id: 'a5', name: 'Espiritual', icon: '🙏', color: '#60a5fa', projects: [] }
    ],
    // Projetos top-level (migrados de area.projects pelo projectService)
    projects: [],
    finance: [],
    finCats: [
      { id: 'fc1', name: 'Alimentação', color: '#f87171' },
      { id: 'fc2', name: 'Transporte', color: '#fbbf24' },
      { id: 'fc3', name: 'Saúde', color: '#4ade80' },
      { id: 'fc4', name: 'Lazer', color: '#7c6fff' },
      { id: 'fc5', name: 'Moradia', color: '#60a5fa' },
      { id: 'fc6', name: 'Receita', color: '#34d399' }
    ],
    // Finanças Fase 1 (modelo em centavos) — populadas por _seedDefaults
    contas: [],
    categorias: [],
    transacoes: [],
    // Finanças Fase 2: orçamentos por categoria
    orcamentos: [],
    // Finanças Fase 3: recorrências (despesas/receitas fixas que geram transações)
    recorrencias: [],
    // Finanças Fase 4: cartões de crédito e pagamentos de fatura
    cartoes: [],
    faturaPagamentos: [],
    // Finanças Fase 7e: histórico das revisões financeiras mensais
    revisoesFinanceiras: [],
    // Modelo Veículo: fichas, odômetro e manutenções (um item por projeto Veículo)
    vehicles: []
  };

  /**
   * Página privada do Jarvis (assistente pessoal no PC do André), pelo Tailscale.
   * Substitui o assistente pago (proxy /api/chat + ElevenLabs) desde 19/10/2026.
   * Só abre em aparelho com o Tailscale ligado na mesma conta.
   */
  const JARVIS_URL = 'https://desktop-2t7j9hm.taild9b255.ts.net/';

  return Object.freeze({
    COLORS,
    PRI_ICONS,
    PRI_ORDER,
    PRI_CYCLE,
    PRI_COLORS,
    POMO_TIMES,
    TIME_GRID,
    CALENDAR,
    HABITS,
    HARD_MODE,
    ACTIVITY,
    NEXTUP,
    REVIEW,
    FEEDBACK,
    FINANCE,
    PROJECT_TEMPLATES,
    PROJECT_TABS,
    VEHICLE,
    STORAGE_KEY,
    THEME_KEY,
    JARVIS_URL,
    SEED_DATA
  });
})();
