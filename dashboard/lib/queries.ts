import { one, q } from "./db";
import type {
  ArchiveCell,
  DailyEvolutionRow,
  DailyReport,
  EquityPoint,
  GenerationRow,
  Metrics,
  RegimeResultRow,
  RegimeRow,
  Split,
  StrategyRow,
  TradeRow,
} from "./types";

export const BENCHMARK_IDS = ["BENCH_BH", "BENCH_SMA200"];

export function parseMetrics(json: string | null | undefined): Metrics | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Metrics;
  } catch {
    return null;
  }
}

export function parseEquity(json: string | null | undefined): EquityPoint[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as [string, number, number, Split][];
    return raw.map(([date, strategy, buyHold, split]) => ({
      date,
      strategy,
      buyHold,
      split,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- regimes

export function getLatestRegime(): RegimeRow | null {
  return one<RegimeRow>(
    "SELECT * FROM market_regimes ORDER BY date DESC LIMIT 1"
  );
}

/** Rows where the combined regime changed vs the previous day. */
export function getRegimeTransitions(limit = 15): RegimeRow[] {
  return q<RegimeRow>(
    `SELECT * FROM (
       SELECT *, LAG(combined) OVER (ORDER BY date) AS prev_combined
       FROM market_regimes
     ) WHERE prev_combined IS NOT NULL AND combined != prev_combined
     ORDER BY date DESC LIMIT ?`,
    limit
  );
}

export interface PricePoint {
  date: string;
  close: number;
  trend: string;
}

export interface TrendBand {
  x1: string;
  x2: string;
  trend: string;
}

/** Full price history, downsampled to <= ~maxPoints, plus trend bands. */
export function getPriceSeries(maxPoints = 1200): {
  points: PricePoint[];
  bands: TrendBand[];
} {
  const rows = q<{ date: string; close: number; trend: string }>(
    "SELECT date, close, trend FROM market_regimes ORDER BY date ASC"
  );
  const step = rows.length > maxPoints ? Math.ceil(rows.length / maxPoints) : 1;
  // NOTE: node:sqlite rows have a null prototype and cannot be passed to
  // client components — copy into plain objects.
  const plain = (r: { date: string; close: number; trend: string }): PricePoint => ({
    date: r.date,
    close: r.close,
    trend: r.trend,
  });
  const points: PricePoint[] = [];
  for (let i = 0; i < rows.length; i += step) points.push(plain(rows[i]));
  const last = rows[rows.length - 1];
  if (last && points[points.length - 1]?.date !== last.date)
    points.push(plain(last));

  const bands: TrendBand[] = [];
  for (const p of points) {
    const cur = bands[bands.length - 1];
    if (cur && cur.trend === p.trend) {
      cur.x2 = p.date;
    } else {
      bands.push({ x1: p.date, x2: p.date, trend: p.trend });
    }
  }
  return { points, bands };
}

// ---------------------------------------------------------------- daily

export function getLatestDaily(): DailyEvolutionRow | null {
  return one<DailyEvolutionRow>(
    "SELECT * FROM daily_evolution ORDER BY date DESC LIMIT 1"
  );
}

export function getDailyDates(): { date: string }[] {
  return q<{ date: string }>(
    "SELECT date FROM daily_evolution ORDER BY date DESC"
  );
}

export function getDailyByDate(date: string): DailyEvolutionRow | null {
  return one<DailyEvolutionRow>(
    "SELECT * FROM daily_evolution WHERE date = ?",
    date
  );
}

export function getPreviousDaily(date: string): DailyEvolutionRow | null {
  return one<DailyEvolutionRow>(
    "SELECT * FROM daily_evolution WHERE date < ? ORDER BY date DESC LIMIT 1",
    date
  );
}

export function parseReport(row: DailyEvolutionRow | null): DailyReport | null {
  if (!row?.report_json) return null;
  try {
    return JSON.parse(row.report_json) as DailyReport;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- overview

export interface OverviewStats {
  currentGeneration: number | null;
  totalTested: number;
  activePopulation: number | null;
  numElites: number;
}

export function getOverviewStats(): OverviewStats {
  const gen = one<{ g: number | null; pop: number | null }>(
    "SELECT generation AS g, population_size AS pop FROM generations ORDER BY generation DESC LIMIT 1"
  );
  const total = one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM strategies WHERE status != 'BENCHMARK'"
  );
  const elites = one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM strategies WHERE status = 'ELITE'"
  );
  return {
    currentGeneration: gen?.g ?? null,
    totalTested: total?.c ?? 0,
    activePopulation: gen?.pop ?? null,
    numElites: elites?.c ?? 0,
  };
}

export interface EliteSummary {
  strategy: StrategyRow;
  validation: Metrics | null;
  hiddenTest: Metrics | null;
}

/** Best strategy by fitness: prefer ELITE, fall back to SURVIVED. */
export function getCurrentElite(): EliteSummary | null {
  const s =
    one<StrategyRow>(
      "SELECT * FROM strategies WHERE status = 'ELITE' AND fitness IS NOT NULL ORDER BY fitness DESC LIMIT 1"
    ) ??
    one<StrategyRow>(
      "SELECT * FROM strategies WHERE status = 'SURVIVED' AND fitness IS NOT NULL ORDER BY fitness DESC LIMIT 1"
    );
  if (!s) return null;
  return {
    strategy: s,
    validation: getPeriodMetrics(s.strategy_id, "validation"),
    hiddenTest: getPeriodMetrics(s.strategy_id, "hidden_test"),
  };
}

export function getPeriodMetrics(
  strategyId: string,
  period: string
): Metrics | null {
  const row = one<{ metrics_json: string | null }>(
    "SELECT metrics_json FROM backtest_results WHERE strategy_id = ? AND period = ?",
    strategyId,
    period
  );
  return parseMetrics(row?.metrics_json);
}

export function getEquityCurve(strategyId: string): EquityPoint[] {
  const row = one<{ equity_json: string | null }>(
    "SELECT equity_json FROM backtest_results WHERE strategy_id = ? AND period = 'full'",
    strategyId
  );
  return parseEquity(row?.equity_json);
}

// ---------------------------------------------------------------- evolution

export interface GenerationSeriesRow extends GenerationRow {
  best_name: string | null;
  val_cagr: number | null;
  val_sharpe: number | null;
  val_max_dd: number | null;
  val_win_rate: number | null;
}

export function getGenerationSeries(): GenerationSeriesRow[] {
  const gens = q<GenerationRow & { best_name: string | null }>(
    `SELECT g.*, s.name AS best_name
     FROM generations g
     LEFT JOIN strategies s ON s.strategy_id = g.best_strategy_id
     ORDER BY g.generation ASC`
  );
  return gens.map((g) => {
    const m = g.best_strategy_id
      ? getPeriodMetrics(g.best_strategy_id, "validation")
      : null;
    return {
      ...g,
      val_cagr: m?.cagr ?? null,
      val_sharpe: m?.sharpe ?? null,
      val_max_dd: m?.max_drawdown ?? null,
      val_win_rate: m?.win_rate ?? null,
    };
  });
}

export const HOLDING_BUCKETS = ["short", "medium", "long"];

export function getArchiveGrid(): {
  families: string[];
  cells: Map<string, ArchiveCell>;
} {
  const rows = q<ArchiveCell>(
    `SELECT a.family, a.holding_bucket, a.strategy_id, a.fitness, a.updated_at,
            s.name, s.status
     FROM archive a LEFT JOIN strategies s ON s.strategy_id = a.strategy_id
     ORDER BY a.family, a.holding_bucket`
  );
  const families = Array.from(new Set(rows.map((r) => r.family))).sort();
  const cells = new Map<string, ArchiveCell>();
  for (const r of rows) cells.set(`${r.family}|${r.holding_bucket}`, r);
  return { families, cells };
}

// ---------------------------------------------------------------- strategies

export interface StrategyListRow extends StrategyRow {
  val_cagr: number | null;
  val_sharpe: number | null;
  val_max_dd: number | null;
}

export function getFamilies(): string[] {
  return q<{ family: string }>(
    "SELECT DISTINCT family FROM strategies WHERE family != 'benchmark' ORDER BY family"
  ).map((r) => r.family);
}

export function getStatuses(): string[] {
  return q<{ status: string }>(
    "SELECT DISTINCT status FROM strategies ORDER BY status"
  ).map((r) => r.status);
}

const ACTIVE_STATUSES = ["ELITE", "SURVIVED"];

export function getStrategyList(opts: {
  status?: string;
  family?: string;
  activeOnly: boolean;
}): StrategyListRow[] {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.status) {
    where.push("s.status = ?");
    params.push(opts.status);
  } else if (opts.activeOnly) {
    where.push(
      `s.status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})`
    );
    params.push(...ACTIVE_STATUSES);
  }
  if (opts.family) {
    where.push("s.family = ?");
    params.push(opts.family);
  }
  const whereSql = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
  const rows = q<StrategyRow & { metrics_json: string | null }>(
    `SELECT s.*, b.metrics_json
     FROM strategies s
     LEFT JOIN backtest_results b
       ON b.strategy_id = s.strategy_id AND b.period = 'validation'
     ${whereSql}
     ORDER BY (s.fitness IS NULL) ASC, s.fitness DESC`,
    ...params
  );
  return rows.map((r) => {
    const m = parseMetrics(r.metrics_json);
    return {
      ...r,
      val_cagr: m?.cagr ?? null,
      val_sharpe: m?.sharpe ?? null,
      val_max_dd: m?.max_drawdown ?? null,
    };
  });
}

export function getStrategy(id: string): StrategyRow | null {
  return one<StrategyRow>(
    "SELECT * FROM strategies WHERE strategy_id = ?",
    id
  );
}

export interface LineageEntry {
  strategy: StrategyRow;
  mutation_type: string | null;
}

export function getParents(id: string): LineageEntry[] {
  const rows = q<StrategyRow & { lin_mutation: string | null }>(
    `SELECT s.*, l.mutation_type AS lin_mutation
     FROM strategy_lineage l
     JOIN strategies s ON s.strategy_id = l.parent_id
     WHERE l.child_id = ?`,
    id
  );
  return rows.map((r) => ({ strategy: r, mutation_type: r.lin_mutation }));
}

export function getChildren(id: string): LineageEntry[] {
  const rows = q<StrategyRow & { lin_mutation: string | null }>(
    `SELECT s.*, l.mutation_type AS lin_mutation
     FROM strategy_lineage l
     JOIN strategies s ON s.strategy_id = l.child_id
     WHERE l.parent_id = ?
     ORDER BY s.generation ASC, s.strategy_id ASC`,
    id
  );
  return rows.map((r) => ({ strategy: r, mutation_type: r.lin_mutation }));
}

export interface BacktestPeriod {
  period: string;
  start_date: string | null;
  end_date: string | null;
  metrics: Metrics | null;
}

export function getBacktests(id: string): Map<string, BacktestPeriod> {
  const rows = q<{
    period: string;
    start_date: string | null;
    end_date: string | null;
    metrics_json: string | null;
  }>(
    "SELECT period, start_date, end_date, metrics_json FROM backtest_results WHERE strategy_id = ? ORDER BY period",
    id
  );
  const map = new Map<string, BacktestPeriod>();
  for (const r of rows)
    map.set(r.period, {
      period: r.period,
      start_date: r.start_date,
      end_date: r.end_date,
      metrics: parseMetrics(r.metrics_json),
    });
  return map;
}

export function getRegimeResults(id: string): RegimeResultRow[] {
  return q<RegimeResultRow>(
    "SELECT * FROM regime_results WHERE strategy_id = ? ORDER BY period, regime_label",
    id
  );
}

export function getTrades(
  id: string,
  limit = 100
): { trades: TradeRow[]; total: number } {
  const total =
    one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM trades WHERE strategy_id = ? AND period = 'full'",
      id
    )?.c ?? 0;
  const trades = q<TradeRow>(
    "SELECT * FROM trades WHERE strategy_id = ? AND period = 'full' ORDER BY entry_date DESC LIMIT ?",
    id,
    limit
  );
  return { trades, total };
}

// ---------------------------------------------------------------- regime matrix

export const TREND_REGIMES = ["UPTREND", "DOWNTREND", "SIDEWAYS"];
export const VOL_REGIMES = [
  "LOW_VOLATILITY",
  "MEDIUM_VOLATILITY",
  "HIGH_VOLATILITY",
];

export interface RegimeMatrixRow {
  strategy: StrategyRow;
  /** regime_label -> ann_return (validation, fallback train) */
  returns: Record<string, number | null>;
}

export function getRegimeMatrix(topN = 12): RegimeMatrixRow[] {
  const strategies = q<StrategyRow>(
    `SELECT * FROM strategies
     WHERE status IN ('ELITE','SURVIVED') AND fitness IS NOT NULL
     ORDER BY fitness DESC LIMIT ?`,
    topN
  );
  const labels = [...TREND_REGIMES, ...VOL_REGIMES];
  return strategies.map((s) => {
    const rows = q<RegimeResultRow>(
      "SELECT * FROM regime_results WHERE strategy_id = ? AND period IN ('validation','train')",
      s.strategy_id
    );
    const returns: Record<string, number | null> = {};
    for (const label of labels) {
      const val = rows.find(
        (r) => r.regime_label === label && r.period === "validation"
      );
      const train = rows.find(
        (r) => r.regime_label === label && r.period === "train"
      );
      returns[label] = val?.ann_return ?? train?.ann_return ?? null;
    }
    return { strategy: s, returns };
  });
}

// ---------------------------------------------------------------- tree

export interface TreeData {
  strategies: Map<string, StrategyRow>;
  childrenOf: Map<string, { child_id: string; mutation_type: string | null }[]>;
  parentCount: Map<string, number>;
  roots: StrategyRow[];
}

export function getTreeData(): TreeData {
  const all = q<StrategyRow>(
    "SELECT * FROM strategies WHERE status != 'BENCHMARK' ORDER BY generation ASC, strategy_id ASC"
  );
  const strategies = new Map(all.map((s) => [s.strategy_id, s]));
  const links = q<{
    child_id: string;
    parent_id: string;
    mutation_type: string | null;
  }>("SELECT child_id, parent_id, mutation_type FROM strategy_lineage");

  const childrenOf = new Map<
    string,
    { child_id: string; mutation_type: string | null }[]
  >();
  const parentCount = new Map<string, number>();
  for (const l of links) {
    if (!strategies.has(l.child_id) || !strategies.has(l.parent_id)) continue;
    const arr = childrenOf.get(l.parent_id) ?? [];
    arr.push({ child_id: l.child_id, mutation_type: l.mutation_type });
    childrenOf.set(l.parent_id, arr);
    parentCount.set(l.child_id, (parentCount.get(l.child_id) ?? 0) + 1);
  }
  const roots = all.filter(
    (s) => s.generation === 0 && (parentCount.get(s.strategy_id) ?? 0) === 0
  );
  return { strategies, childrenOf, parentCount, roots };
}
