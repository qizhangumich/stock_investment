export interface Metrics {
  total_return?: number;
  cagr?: number;
  annualized_return?: number;
  volatility?: number;
  max_drawdown?: number;
  avg_drawdown?: number;
  downside_deviation?: number;
  sharpe?: number;
  sortino?: number;
  calmar?: number;
  num_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  loss_rate?: number;
  avg_win?: number;
  avg_loss?: number;
  largest_win?: number;
  largest_loss?: number;
  profit_factor?: number;
  payoff_ratio?: number;
  expectancy?: number;
  avg_holding_days?: number;
  turnover?: number;
  exposure?: number;
  cash_ratio?: number;
  avg_position?: number;
  num_days?: number;
}

export type Split = "train" | "validation" | "hidden_test";

/** One point of a normalized equity curve ($1 -> value). */
export interface EquityPoint {
  date: string;
  strategy: number;
  buyHold: number;
  split: Split;
}

export interface StrategyRow {
  strategy_id: string;
  name: string;
  generation: number;
  parent_ids: string; // json array
  creation_time: string | null;
  family: string;
  genome_json: string | null;
  source_code: string | null;
  mutation_type: string | null;
  mutation_description: string | null;
  complexity: number | null;
  fitness: number | null;
  status: string;
  genome_hash: string | null;
}

export interface GenerationRow {
  generation: number;
  started_at: string | null;
  finished_at: string | null;
  num_tested: number | null;
  num_survived: number | null;
  num_rejected: number | null;
  num_new_elites: number | null;
  best_fitness: number | null;
  best_strategy_id: string | null;
  population_size: number | null;
  num_families: number | null;
  notes: string | null;
}

export interface RegimeRow {
  date: string;
  trend: string;
  volatility: string;
  bubble: string;
  combined: string;
  confidence: number | null;
  regime_since: string | null;
  close: number;
}

export interface RegimeResultRow {
  strategy_id: string;
  period: string;
  regime_label: string;
  days: number | null;
  ann_return: number | null;
  sharpe: number | null;
  exposure: number | null;
}

export interface TradeRow {
  id: number;
  strategy_id: string;
  period: string;
  entry_date: string | null;
  exit_date: string | null;
  entry_price: number | null;
  exit_price: number | null;
  return_pct: number | null; // ALREADY percent
  holding_days: number | null;
  open: number;
}

export interface DailyEvolutionRow {
  date: string;
  generation: number | null;
  strategies_tested: number | null;
  survived: number | null;
  rejected: number | null;
  new_elites: number | null;
  total_tested: number | null;
  best_strategy_id: string | null;
  best_fitness: number | null;
  best_cagr: number | null;
  best_sharpe: number | null;
  best_max_dd: number | null;
  best_win_rate: number | null;
  best_profit_factor: number | null;
  best_expectancy: number | null;
  best_turnover: number | null;
  report_json: string | null;
}

export interface ReportRegimeTransition {
  date: string;
  trend: string;
  volatility: string;
  bubble: string;
}

export interface ReportBestMetrics {
  cagr?: number;
  sharpe?: number;
  sortino?: number;
  max_drawdown?: number;
  win_rate?: number;
  profit_factor?: number;
  expectancy?: number;
  turnover?: number;
}

export interface DailyReport {
  date?: string;
  ticker?: string;
  generation?: number;
  regime?: {
    trend?: string;
    volatility?: string;
    bubble?: string;
    since?: string;
    confidence?: number;
    transitions?: ReportRegimeTransition[];
  };
  evolution_summary?: {
    strategies_tested_today?: number;
    survived_today?: number;
    rejected_today?: number;
    new_elites_today?: number;
    total_strategies_ever?: number;
    total_elites?: number;
  };
  best_strategy?: {
    strategy_id?: string;
    name?: string;
    family?: string;
    generation?: number;
    mutation_description?: string;
    validation?: ReportBestMetrics;
    hidden_test?: ReportBestMetrics;
  };
  consensus?: {
    long_pct?: number;
    cash_pct?: number;
    short_pct?: number;
    n_strategies?: number;
  };
  decision_support?: {
    active_strategies?: number;
    regime_compatible?: number;
    top_families?: string[];
  };
  system_status?: {
    evolution_running?: boolean;
    data_updated?: boolean;
    backtests_completed?: boolean;
    overfitting_alert?: boolean;
  };
}

export interface ArchiveCell {
  family: string;
  holding_bucket: string;
  strategy_id: string;
  fitness: number | null;
  updated_at: string | null;
  name?: string | null;
  status?: string | null;
}
