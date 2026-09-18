import Link from "next/link";
import { RegimeBadge, StatusLight } from "@/components/Badge";
import ConsensusBar from "@/components/ConsensusBar";
import SectionHeading from "@/components/SectionHeading";
import StatCard from "@/components/StatCard";
import { fmtInt, fmtNum, fmtPct, signClass } from "@/lib/format";
import { parseReport } from "@/lib/queries";
import type { DailyEvolutionRow, ReportBestMetrics } from "@/lib/types";

function Delta({
  cur,
  prev,
  percent = false,
  digits = 2,
}: {
  cur: number | null;
  prev: number | null | undefined;
  percent?: boolean;
  digits?: number;
}) {
  if (cur === null || prev === null || prev === undefined) return null;
  const d = cur - prev;
  if (Math.abs(d) < 1e-12)
    return <span className="text-[10px] text-faint">±0 vs prev</span>;
  const txt = percent
    ? (d * 100).toFixed(1) + "pp"
    : d.toFixed(digits);
  return (
    <span className={`num text-[10px] ${d > 0 ? "text-pos" : "text-neg"}`}>
      {d > 0 ? "+" : ""}
      {txt} vs prev
    </span>
  );
}

const BEST_ROWS: {
  label: string;
  key: keyof ReportBestMetrics;
  percent?: boolean;
  signed?: boolean;
}[] = [
  { label: "CAGR", key: "cagr", percent: true, signed: true },
  { label: "Sharpe", key: "sharpe" },
  { label: "Sortino", key: "sortino" },
  { label: "Max Drawdown", key: "max_drawdown", percent: true, signed: true },
  { label: "Win Rate", key: "win_rate", percent: true },
  { label: "Profit Factor", key: "profit_factor" },
  { label: "Expectancy", key: "expectancy", percent: true, signed: true },
  { label: "Turnover", key: "turnover" },
];

export default function ReportView({
  row,
  prev,
}: {
  row: DailyEvolutionRow;
  prev: DailyEvolutionRow | null;
}) {
  const report = parseReport(row);
  if (!report) {
    return (
      <div className="rounded-lg border border-bd bg-panel p-5 text-sm text-faint">
        No report payload stored for {row.date}.
      </div>
    );
  }
  const es = report.evolution_summary;
  const best = report.best_strategy;
  const sys = report.system_status;
  const ds = report.decision_support;
  const transitions = (report.regime?.transitions ?? []).slice(-8).reverse();

  return (
    <div className="space-y-8">
      {/* evolution summary */}
      <section>
        <SectionHeading title="Evolution Summary" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard
            label="Tested Today"
            value={fmtInt(es?.strategies_tested_today)}
          />
          <StatCard
            label="Survived"
            value={fmtInt(es?.survived_today)}
            accent="pos"
          />
          <StatCard
            label="Rejected"
            value={fmtInt(es?.rejected_today)}
            accent="neg"
          />
          <StatCard
            label="New Elites"
            value={fmtInt(es?.new_elites_today)}
            accent="amber"
          />
          <StatCard
            label="Total Ever"
            value={fmtInt(es?.total_strategies_ever)}
          />
          <StatCard label="Total Elites" value={fmtInt(es?.total_elites)} />
        </div>
      </section>

      {/* regime */}
      <section>
        <SectionHeading title="Market Regime" />
        <div className="rounded-lg border border-bd bg-panel p-5">
          <div className="flex flex-wrap items-center gap-4">
            <RegimeBadge label={report.regime?.trend} big />
            <RegimeBadge label={report.regime?.volatility} big />
            <RegimeBadge label={report.regime?.bubble} big />
            <div className="ml-auto text-right text-xs text-muted">
              since <span className="num text-fg">{report.regime?.since}</span>{" "}
              · confidence{" "}
              <span className="num text-amber">
                {fmtPct(report.regime?.confidence, 0)}
              </span>
            </div>
          </div>
          {transitions.length > 0 && (
            <div className="mt-4 border-t border-bd pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Transitions
              </div>
              <div className="space-y-1">
                {transitions.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="num w-24 text-muted">{t.date}</span>
                    <RegimeBadge label={t.trend} />
                    <RegimeBadge label={t.volatility} />
                    <RegimeBadge label={t.bubble} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* best strategy */}
      <section>
        <SectionHeading title="Best Strategy" />
        <div className="rounded-lg border border-amber-500/30 bg-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            {best?.strategy_id ? (
              <Link
                href={`/strategies/${best.strategy_id}`}
                className="font-mono text-lg font-bold text-gold hover:underline"
              >
                {best.name ?? best.strategy_id}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )}
            <span className="text-xs text-muted">
              {best?.family} · gen{" "}
              <span className="num">{best?.generation ?? "—"}</span>
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted">
                fitness{" "}
                <span className="num text-amber">
                  {fmtNum(row.best_fitness, 4)}
                </span>
              </span>
              <Delta cur={row.best_fitness} prev={prev?.best_fitness} digits={4} />
            </span>
          </div>
          {best?.mutation_description && (
            <p className="mt-2 text-xs italic text-muted">
              {best.mutation_description}
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full max-w-xl text-left text-xs">
              <thead>
                <tr className="border-b border-bd">
                  <th className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Metric
                  </th>
                  <th className="py-1.5 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Validation
                  </th>
                  <th className="py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-violet">
                    Hidden Test
                  </th>
                </tr>
              </thead>
              <tbody>
                {BEST_ROWS.map((r) => {
                  const v = best?.validation?.[r.key];
                  const h = best?.hidden_test?.[r.key];
                  const f = (x: number | undefined) =>
                    x === undefined || x === null
                      ? "—"
                      : r.percent
                        ? fmtPct(x)
                        : fmtNum(x);
                  return (
                    <tr key={r.key} className="border-b border-bd/50 last:border-0">
                      <td className="py-1.5 pr-4 text-muted">{r.label}</td>
                      <td
                        className={`num py-1.5 pr-4 text-right ${
                          r.signed ? signClass(v) : "text-fg"
                        }`}
                      >
                        {f(v)}
                      </td>
                      <td
                        className={`num py-1.5 text-right ${
                          r.signed ? signClass(h) : "text-fg"
                        }`}
                      >
                        {f(h)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {prev && (
            <div className="mt-3 flex flex-wrap gap-4 border-t border-bd pt-3 text-[11px] text-muted">
              <span>
                CAGR{" "}
                <Delta
                  cur={row.best_cagr}
                  prev={prev.best_cagr}
                  percent
                />
              </span>
              <span>
                Sharpe <Delta cur={row.best_sharpe} prev={prev.best_sharpe} />
              </span>
              <span>
                Max DD{" "}
                <Delta cur={row.best_max_dd} prev={prev.best_max_dd} percent />
              </span>
              <span>
                Win rate{" "}
                <Delta
                  cur={row.best_win_rate}
                  prev={prev.best_win_rate}
                  percent
                />
              </span>
            </div>
          )}
        </div>
      </section>

      {/* consensus + decision support + status */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-bd bg-panel p-5 lg:col-span-2">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            Population Consensus
          </div>
          {report.consensus ? (
            <ConsensusBar
              longPct={report.consensus.long_pct ?? 0}
              cashPct={report.consensus.cash_pct ?? 0}
              shortPct={report.consensus.short_pct ?? 0}
              nStrategies={report.consensus.n_strategies}
            />
          ) : (
            <div className="text-sm text-faint">No consensus data.</div>
          )}
          <div className="mt-5 border-t border-bd pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
              Decision Support
            </div>
            <div className="flex flex-wrap gap-6 text-xs">
              <span className="text-muted">
                Active strategies{" "}
                <span className="num text-fg">
                  {fmtInt(ds?.active_strategies)}
                </span>
              </span>
              <span className="text-muted">
                Regime-compatible{" "}
                <span className="num text-pos">
                  {fmtInt(ds?.regime_compatible)}
                </span>
              </span>
              <span className="text-muted">
                Top families:{" "}
                <span className="font-mono text-accent">
                  {ds?.top_families?.join(", ") ?? "—"}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-bd bg-panel p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            System Status
          </div>
          <div className="space-y-2">
            <StatusLight
              state={sys?.evolution_running ? "ok" : "off"}
              label="Evolution running"
            />
            <StatusLight
              state={sys?.data_updated ? "ok" : "off"}
              label="Market data updated"
            />
            <StatusLight
              state={sys?.backtests_completed ? "ok" : "off"}
              label="Backtests completed"
            />
            <StatusLight
              state={sys?.overfitting_alert ? "alert" : "ok"}
              label={
                sys?.overfitting_alert ? (
                  <span className="font-semibold text-neg">
                    Overfitting alert
                  </span>
                ) : (
                  "No overfitting alert"
                )
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
