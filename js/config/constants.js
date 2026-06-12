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
    meta: {},
    areas: [
      { id: 'a1', name: 'Trabalho', icon: '💼', color: '#7c6fff',
        projects: [{ id: 'p1', name: 'Geral', status: 'ativo', desc: '' }] },
      { id: 'a2', name: 'Pessoal', icon: '🏠', color: '#4ade80', projects: [] },
      { id: 'a3', name: 'Saúde', icon: '❤️', color: '#f87171', projects: [] },
      { id: 'a4', name: 'Financeiro', icon: '💰', color: '#fbbf24', projects: [] },
      { id: 'a5', name: 'Espiritual', icon: '🙏', color: '#60a5fa', projects: [] }
    ],
    finance: [],
    finCats: [
      { id: 'fc1', name: 'Alimentação', color: '#f87171' },
      { id: 'fc2', name: 'Transporte', color: '#fbbf24' },
      { id: 'fc3', name: 'Saúde', color: '#4ade80' },
      { id: 'fc4', name: 'Lazer', color: '#7c6fff' },
      { id: 'fc5', name: 'Moradia', color: '#60a5fa' },
      { id: 'fc6', name: 'Receita', color: '#34d399' }
    ]
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
    NEXTUP,
    REVIEW,
    STORAGE_KEY,
    THEME_KEY,
    SEED_DATA
  });
})();
