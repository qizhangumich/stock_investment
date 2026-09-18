import Link from "next/link";
import { FamilyBadge, RegimeBadge, StatusBadge, StatusLight } from "@/components/Badge";
import ConsensusBar from "@/components/ConsensusBar";
import SectionHeading from "@/components/SectionHeading";
import StatCard from "@/components/StatCard";
import EquityChart from "@/components/charts/EquityChart";
import { fmtDate, fmtInt, fmtNum, fmtPct, signClass } from "@/lib/format";
import {
  getCurrentElite,
  getEquityCurve,
  getLatestDaily,
  getLatestRegime,
  getOverviewStats,
  parseReport,
} from "@/lib/queries";
import type { Metrics } from "@/lib/types";

export const dynamic = "force-dynamic";

const ELITE_METRICS: {
  label: string;
  get: (m: Metrics) => number | null | undefined;
  fmt: (v: number | null | undefined) => string;
  signed?: boolean;
}[] = [
  { label: "CAGR", get: (m) => m.cagr, fmt: (v) => fmtPct(v), signed: true },
  { label: "Sharpe", get: (m) => m.sharpe, fmt: (v) => fmtNum(v) },
  {
    label: "Max DD",
    get: (m) => m.max_drawdown,
    fmt: (v) => fmtPct(v),
    signed: true,
  },
  { label: "Win Rate", get: (m) => m.win_rate, fmt: (v) => fmtPct(v) },
  { label: "Profit Factor", get: (m) => m.profit_factor, fmt: (v) => fmtNum(v) },
  {
    label: "Expectancy",
    get: (m) => m.expectancy,
    fmt: (v) => fmtPct(v),
    signed: true,
  },
];

function MetricsCol({ title, m }: { title: string; m: Metrics | null }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-accent">
        {title}
      </div>
      <div className="space-y-1.5">
        {ELITE_METRICS.map((def) => {
          const v = m ? def.get(m) : null;
          return (
            <div key={def.label} className="flex justify-between gap-4 text-xs">
              <span className="text-muted">{def.label}</span>
              <span className={`num ${def.signed ? signClass(v) : "text-fg"}`}>
                {def.fmt(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const regime = getLatestRegime();
  const stats = getOverviewStats();
  const elite = getCurrentElite();
  const daily = getLatestDaily();
  const report = parseReport(daily);
  const equity = elite ? getEquityCurve(elite.strategy.strategy_id) : [];
  const sys = report?.system_status;
  const transitions = (report?.regime?.transitions ?? []).slice(-6).reverse();

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-wide">
            <span className="text-accent">TSLA</span>{" "}
            <span className="text-muted">·</span> Overview
          </h1>
          <p className="mt-1 text-xs text-muted">
            Latest market data:{" "}
            <span className="num text-fg">{fmtDate(regime?.date)}</span>
          </p>
        </div>
        <div className="text-right text-[11px] text-faint">
          AlphaEvolve strategy evolution engine
        </div>
      </div>

      {/* current regime */}
      <section>
        <SectionHeading title="Current Market Regime" />
        <div className="rounded-lg border border-bd bg-panel p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <RegimeBadge label={regime?.trend} big />
              <RegimeBadge label={regime?.volatility} big />
              <RegimeBadge label={regime?.bubble} big />
            </div>
            <div className="ml-auto text-right text-xs text-muted">
              <div>
                since{" "}
                <span className="num text-fg">
                  {fmtDate(regime?.regime_since)}
                </span>
              </div>
              <div className="mt-1">
                confidence{" "}
                <span className="num text-amber">
                  {fmtPct(regime?.confidence, 0)}
                </span>
              </div>
            </div>
          </div>
          {transitions.length > 0 && (
            <div className="mt-4 border-t border-bd pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Recent transitions
              </div>
              <div className="space-y-1">
                {transitions.map((t, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 text-[11px]"
                  >
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

      {/* stat row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Current Generation"
          value={stats.currentGeneration ?? "—"}
          accent="amber"
        />
        <StatCard
          label="Total Strategies Tested"
          value={fmtInt(stats.totalTested)}
        />
        <StatCard
          label="Active Population"
          value={stats.activePopulation ?? "—"}
        />
        <StatCard label="Elites" value={stats.numElites} accent="pos" />
      </section>

      {/* current elite */}
      <section>
        <SectionHeading
          title="Current Elite"
          right="best active strategy by fitness"
        />
        {elite ? (
          <div className="rounded-lg border border-amber-500/30 bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/strategies/${elite.strategy.strategy_id}`}
                    className="font-mono text-lg font-bold text-gold hover:underline"
                  >
                    {elite.strategy.name}
                  </Link>
                  <StatusBadge status={elite.strategy.status} />
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                  <FamilyBadge family={elite.strategy.family} />
                  <span>
                    gen{" "}
                    <span className="num text-fg">
                      {elite.strategy.generation}
                    </span>
                  </span>
                  <span>
                    fitness{" "}
                    <span className="num text-amber">
                      {fmtNum(elite.strategy.fitness, 4)}
                    </span>
                  </span>
                </div>
              </div>
              <Link
                href={`/strategies/${elite.strategy.strategy_id}`}
                className="rounded border border-bd2 px-3 py-1.5 text-xs text-muted hover:border-amber-500/50 hover:text-amber"
              >
                Full detail →
              </Link>
            </div>
            <div className="mt-4 grid max-w-xl grid-cols-2 gap-8">
              <MetricsCol title="Validation" m={elite.validation} />
              <MetricsCol title="Hidden Test" m={elite.hiddenTest} />
            </div>
            {elite.strategy.mutation_description && (
              <p className="mt-4 border-t border-bd pt-3 text-xs italic text-muted">
                {elite.strategy.mutation_description}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-bd bg-panel p-5 text-sm text-faint">
            No active strategy yet.
          </div>
        )}
      </section>

      {/* growth chart */}
      <section>
        <SectionHeading
          title="Growth of $100"
          right={elite ? `${elite.strategy.name} vs TSLA Buy & Hold` : ""}
        />
        <div className="rounded-lg border border-bd bg-panel p-4">
          <EquityChart
            data={equity}
            strategyName={elite?.strategy.name ?? "Strategy"}
          />
        </div>
      </section>

      {/* consensus */}
      <section>
        <SectionHeading title="Strategy Population Consensus" />
        <div className="rounded-lg border border-bd bg-panel p-5">
          {report?.consensus ? (
            <ConsensusBar
              longPct={report.consensus.long_pct ?? 0}
              cashPct={report.consensus.cash_pct ?? 0}
              shortPct={report.consensus.short_pct ?? 0}
              nStrategies={report.consensus.n_strategies}
            />
          ) : (
            <div className="text-sm text-faint">No consensus data.</div>
          )}
        </div>
      </section>

      {/* today's evolution */}
      <section>
        <SectionHeading
          title="Today's Evolution"
          right={daily ? fmtDate(daily.date) : ""}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
            <StatCard label="Tested" value={fmtInt(daily?.strategies_tested)} />
            <StatCard
              label="Survived"
              value={fmtInt(daily?.survived)}
              accent="pos"
            />
            <StatCard
              label="Rejected"
              value={fmtInt(daily?.rejected)}
              accent="neg"
            />
            <StatCard
              label="New Elites"
              value={fmtInt(daily?.new_elites)}
              accent="amber"
            />
          </div>
          <div className="rounded-lg border border-bd bg-panel px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
              System Status
            </div>
            <div className="space-y-1.5">
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
            <Link
              href="/daily-report"
              className="mt-3 inline-block text-[11px] text-accent hover:underline"
            >
              Full daily report →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
