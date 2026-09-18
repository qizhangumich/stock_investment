import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyBadge, RegimeBadge, StatusBadge } from "@/components/Badge";
import DataTable from "@/components/DataTable";
import SectionHeading from "@/components/SectionHeading";
import StatCard from "@/components/StatCard";
import EquityChart from "@/components/charts/EquityChart";
import {
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtRawPct,
  signClass,
} from "@/lib/format";
import {
  getBacktests,
  getChildren,
  getEquityCurve,
  getParents,
  getRegimeResults,
  getStrategy,
  getTrades,
} from "@/lib/queries";
import type { LineageEntry } from "@/lib/queries";
import type { Metrics } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIOD_COLS = [
  { key: "train", label: "Train" },
  { key: "validation", label: "Validation" },
  { key: "hidden_test", label: "Hidden Test" },
  { key: "full", label: "Full" },
];

type Fmt = (v: number | null | undefined) => string;
const pct: Fmt = (v) => fmtPct(v);
const num: Fmt = (v) => fmtNum(v);
const int: Fmt = (v) => fmtInt(v);

const METRIC_ROWS: {
  label: string;
  get: (m: Metrics) => number | undefined;
  fmt: Fmt;
  signed?: boolean;
}[] = [
  { label: "CAGR", get: (m) => m.cagr, fmt: pct, signed: true },
  { label: "Total Return", get: (m) => m.total_return, fmt: pct, signed: true },
  { label: "Sharpe", get: (m) => m.sharpe, fmt: num },
  { label: "Sortino", get: (m) => m.sortino, fmt: num },
  { label: "Calmar", get: (m) => m.calmar, fmt: num },
  { label: "Volatility", get: (m) => m.volatility, fmt: pct },
  { label: "Max DD", get: (m) => m.max_drawdown, fmt: pct, signed: true },
  { label: "Win Rate", get: (m) => m.win_rate, fmt: pct },
  { label: "Avg Win", get: (m) => m.avg_win, fmt: pct, signed: true },
  {
    label: "Avg Loss",
    get: (m) => (m.avg_loss !== undefined ? -Math.abs(m.avg_loss) : undefined),
    fmt: pct,
    signed: true,
  },
  { label: "Payoff", get: (m) => m.payoff_ratio, fmt: num },
  { label: "Expectancy", get: (m) => m.expectancy, fmt: pct, signed: true },
  { label: "Profit Factor", get: (m) => m.profit_factor, fmt: num },
  { label: "Trades", get: (m) => m.num_trades, fmt: int },
  { label: "Avg Holding Days", get: (m) => m.avg_holding_days, fmt: (v) => fmtNum(v, 1) },
  { label: "Turnover", get: (m) => m.turnover, fmt: (v) => fmtNum(v, 1) },
  { label: "Exposure", get: (m) => m.exposure, fmt: pct },
];

function LineageList({
  title,
  entries,
  showMutation,
}: {
  title: string;
  entries: LineageEntry[];
  showMutation?: boolean;
}) {
  return (
    <div className="rounded-lg border border-bd bg-panel p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-faint">
          {title.startsWith("Parents") ? "None — seed strategy" : "None"}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.strategy.strategy_id} className="text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/strategies/${e.strategy.strategy_id}`}
                  className="font-medium text-accent hover:underline"
                >
                  {e.strategy.name}
                </Link>
                <span className="num text-faint">
                  {e.strategy.strategy_id} · gen {e.strategy.generation}
                </span>
                <StatusBadge status={e.strategy.status} />
                {e.mutation_type && (
                  <span className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-violet">
                    {e.mutation_type}
                  </span>
                )}
              </div>
              {showMutation && e.strategy.mutation_description && (
                <p className="mt-0.5 pl-0.5 italic text-muted">
                  {e.strategy.mutation_description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = getStrategy(decodeURIComponent(id));
  if (!s) notFound();

  const backtests = getBacktests(s.strategy_id);
  const parents = getParents(s.strategy_id);
  const children = getChildren(s.strategy_id);
  const regimes = getRegimeResults(s.strategy_id);
  const { trades, total: tradeCount } = getTrades(s.strategy_id);
  const equity = getEquityCurve(s.strategy_id);

  const wfPeriods = [...backtests.keys()]
    .filter((p) => p.startsWith("wf_"))
    .sort();

  return (
    <div className="space-y-8">
      {/* header */}
      <div>
        <div className="mb-1 text-[11px] text-faint">
          <Link href="/strategies" className="text-accent hover:underline">
            Strategy Zoo
          </Link>{" "}
          / <span className="num">{s.strategy_id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold tracking-wide">
            {s.name}
          </h1>
          <StatusBadge status={s.status} />
          <FamilyBadge family={s.family} />
        </div>
        {s.mutation_description && (
          <p className="mt-2 max-w-3xl text-xs italic text-muted">
            {s.mutation_type ? (
              <span className="mr-2 rounded bg-panel2 px-1.5 py-0.5 font-mono not-italic text-violet">
                {s.mutation_type}
              </span>
            ) : null}
            {s.mutation_description}
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Fitness"
          value={fmtNum(s.fitness, 4)}
          accent="amber"
        />
        <StatCard label="Generation" value={s.generation} />
        <StatCard label="Complexity" value={fmtNum(s.complexity, 0)} />
        <StatCard
          label="Created"
          value={
            <span className="text-base">{fmtDate(s.creation_time)}</span>
          }
        />
      </section>

      {/* lineage */}
      <section>
        <SectionHeading title="Lineage" />
        <div className="grid gap-4 lg:grid-cols-2">
          <LineageList
            title={`Parents (${parents.length})`}
            entries={parents}
            showMutation
          />
          <LineageList
            title={`Children (${children.length})`}
            entries={children}
          />
        </div>
      </section>

      {/* source code */}
      {s.source_code && (
        <section>
          <SectionHeading title="Strategy Logic (pseudocode)" />
          <pre className="overflow-x-auto rounded-lg border border-bd bg-[#080b10] p-4 font-mono text-[11px] leading-relaxed text-emerald-200/80">
            {s.source_code}
          </pre>
        </section>
      )}

      {/* metrics */}
      <section>
        <SectionHeading title="Backtest Metrics" />
        <div className="overflow-x-auto rounded-lg border border-bd bg-panel">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-bd bg-panel2/60">
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Metric
                </th>
                {PERIOD_COLS.map((p) => (
                  <th
                    key={p.key}
                    className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-bd/60 last:border-0 hover:bg-panel2/40"
                >
                  <td className="px-3 py-1.5 text-muted">{row.label}</td>
                  {PERIOD_COLS.map((p) => {
                    const m = backtests.get(p.key)?.metrics;
                    const v = m ? row.get(m) : undefined;
                    return (
                      <td
                        key={p.key}
                        className={`num px-3 py-1.5 text-right ${
                          row.signed ? signClass(v) : "text-fg"
                        }`}
                      >
                        {row.fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* equity */}
      {equity.length > 0 && (
        <section>
          <SectionHeading
            title="Growth of $100"
            right={`${s.name} vs TSLA Buy & Hold`}
          />
          <div className="rounded-lg border border-bd bg-panel p-4">
            <EquityChart data={equity} strategyName={s.name} />
          </div>
        </section>
      )}

      {/* walk-forward */}
      <section>
        <SectionHeading
          title="Walk-Forward Years"
          right="year-by-year stability matters more than any single year"
        />
        <DataTable
          columns={[
            { key: "year", label: "Year" },
            { key: "cagr", label: "CAGR", align: "right" },
            { key: "sharpe", label: "Sharpe", align: "right" },
            { key: "maxdd", label: "Max DD", align: "right" },
            { key: "trades", label: "Trades", align: "right" },
          ]}
          rows={wfPeriods.map((p) => {
            const m = backtests.get(p)?.metrics;
            return {
              year: (
                <span className="num text-amber">{p.replace("wf_", "")}</span>
              ),
              cagr: <span className={signClass(m?.cagr)}>{fmtPct(m?.cagr)}</span>,
              sharpe: fmtNum(m?.sharpe),
              maxdd: (
                <span className={signClass(m?.max_drawdown)}>
                  {fmtPct(m?.max_drawdown)}
                </span>
              ),
              trades: fmtInt(m?.num_trades),
            };
          })}
          empty="No walk-forward results"
        />
        <p className="mt-2 text-[10px] text-faint">
          A robust strategy performs acceptably in most years rather than
          spectacularly in one — look for consistency across regimes, not a
          single outlier year.
        </p>
      </section>

      {/* regime performance */}
      <section>
        <SectionHeading title="Regime Performance" />
        <DataTable
          columns={[
            { key: "period", label: "Period" },
            { key: "regime", label: "Regime" },
            { key: "days", label: "Days", align: "right" },
            { key: "ret", label: "Ann. Return", align: "right" },
            { key: "sharpe", label: "Sharpe", align: "right" },
            { key: "exposure", label: "Exposure", align: "right" },
          ]}
          rows={regimes.map((r) => ({
            period: (
              <span className="font-mono text-[10px] uppercase text-muted">
                {r.period.replace("_", " ")}
              </span>
            ),
            regime: <RegimeBadge label={r.regime_label} />,
            days: fmtInt(r.days),
            ret: (
              <span className={signClass(r.ann_return)}>
                {fmtPct(r.ann_return)}
              </span>
            ),
            sharpe: fmtNum(r.sharpe),
            exposure: fmtPct(r.exposure, 0),
          }))}
          empty="No regime results"
        />
      </section>

      {/* trades */}
      <section>
        <SectionHeading
          title="Trades (full period)"
          right={
            tradeCount > trades.length
              ? `latest ${trades.length} of ${tradeCount}`
              : `${tradeCount} trades`
          }
        />
        <DataTable
          columns={[
            { key: "entry", label: "Entry", align: "right" },
            { key: "exit", label: "Exit", align: "right" },
            { key: "entryP", label: "Entry Px", align: "right" },
            { key: "exitP", label: "Exit Px", align: "right" },
            { key: "ret", label: "Return", align: "right" },
            { key: "days", label: "Days", align: "right" },
            { key: "open", label: "", align: "center" },
          ]}
          rows={trades.map((t) => ({
            entry: <span className="text-muted">{fmtDate(t.entry_date)}</span>,
            exit: <span className="text-muted">{fmtDate(t.exit_date)}</span>,
            entryP: fmtMoney(t.entry_price),
            exitP: fmtMoney(t.exit_price),
            ret: (
              <span className={signClass(t.return_pct)}>
                {fmtRawPct(t.return_pct, 2)}
              </span>
            ),
            days: fmtInt(t.holding_days),
            open: t.open ? (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber">
                OPEN
              </span>
            ) : (
              ""
            ),
          }))}
          empty="No trades recorded"
        />
      </section>
    </div>
  );
}
