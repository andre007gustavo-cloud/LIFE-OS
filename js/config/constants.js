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
    SEED_CONTA: {
      nome: 'Carteira', tipo: 'dinheiro',
      saldoInicialCentavos: 0, cor: '#34d399', icone: '💵'
    },
    SEED_CATEGORIAS: [
      { nome: 'Alimentação', tipo: 'despesa', icone: '🍔', cor: '#f87171' },
      { nome: 'Mercado/casa', tipo: 'despesa', icone: '🛒', cor: '#fb923c' },
      { nome: 'Transporte', tipo: 'despesa', icone: '🚌', cor: '#fbbf24' },
      { nome: 'Moradia', tipo: 'despesa', icone: '🏠', cor: '#60a5fa' },
      { nome: 'Saúde', tipo: 'despesa', icone: '❤️', cor: '#4ade80' },
      { nome: 'Diversão', tipo: 'despesa', icone: '🎮', cor: '#7c6fff' },
      { nome: 'Outros', tipo: 'despesa', icone: '📦', cor: '#a78bfa' },
      { nome: 'Salário', tipo: 'receita', icone: '💰', cor: '#34d399' },
      { nome: 'Vendas', tipo: 'receita', icone: '🏷️', cor: '#4ade80' },
      { nome: 'Outros', tipo: 'receita', icone: '➕', cor: '#60a5fa' }
    ]
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
    revisoesFinanceiras: []
  };

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
    STORAGE_KEY,
    THEME_KEY,
    SEED_DATA
  });
})();
