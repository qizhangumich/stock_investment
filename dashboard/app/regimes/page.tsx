import Link from "next/link";
import { RegimeBadge, StatusBadge } from "@/components/Badge";
import DataTable from "@/components/DataTable";
import SectionHeading from "@/components/SectionHeading";
import PriceRegimeChart from "@/components/charts/PriceRegimeChart";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import {
  getLatestRegime,
  getPriceSeries,
  getRegimeMatrix,
  getRegimeTransitions,
  TREND_REGIMES,
  VOL_REGIMES,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const MATRIX_COLS = [...TREND_REGIMES, ...VOL_REGIMES];

function heatStyle(ret: number | null): React.CSSProperties {
  if (ret === null || ret === undefined || Number.isNaN(ret)) return {};
  const capped = Math.max(-1, Math.min(1.5, ret));
  const alpha = Math.min(0.45, Math.abs(capped) * 0.5 + 0.04);
  return {
    backgroundColor:
      capped >= 0
        ? `rgba(74, 222, 128, ${alpha})`
        : `rgba(248, 113, 113, ${alpha})`,
  };
}

export default function RegimesPage() {
  const regime = getLatestRegime();
  const { points, bands } = getPriceSeries();
  const transitions = getRegimeTransitions(15);
  const matrix = getRegimeMatrix(12);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide">
          Market Regimes
        </h1>
        <p className="mt-1 text-xs text-muted">
          Daily regime classification of TSLA ·{" "}
          <span className="num">{fmtDate(points[0]?.date)}</span> →{" "}
          <span className="num">{fmtDate(regime?.date)}</span>
        </p>
      </div>

      {/* current regime hero */}
      <section>
        <SectionHeading title="Current Regime" />
        <div className="rounded-lg border border-bd bg-panel p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <RegimeBadge label={regime?.trend} big />
              <RegimeBadge label={regime?.volatility} big />
              <RegimeBadge label={regime?.bubble} big />
            </div>
            <div className="ml-auto text-right text-xs text-muted">
              <div>
                close{" "}
                <span className="num text-fg">{fmtMoney(regime?.close)}</span>
              </div>
              <div className="mt-1">
                since{" "}
                <span className="num text-fg">
                  {fmtDate(regime?.regime_since)}
                </span>{" "}
                · confidence{" "}
                <span className="num text-amber">
                  {fmtPct(regime?.confidence, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* price chart */}
      <section>
        <SectionHeading
          title="TSLA Price by Trend Regime"
          right={`${points.length} sampled points`}
        />
        <div className="rounded-lg border border-bd bg-panel p-4">
          <PriceRegimeChart points={points} bands={bands} />
        </div>
      </section>

      {/* transitions */}
      <section>
        <SectionHeading title="Recent Regime Transitions" />
        <DataTable
          columns={[
            { key: "date", label: "Date", align: "right" },
            { key: "trend", label: "Trend" },
            { key: "vol", label: "Volatility" },
            { key: "bubble", label: "Bubble" },
            { key: "close", label: "Close", align: "right" },
            { key: "conf", label: "Confidence", align: "right" },
          ]}
          rows={transitions.map((t) => ({
            date: <span className="text-muted">{t.date}</span>,
            trend: <RegimeBadge label={t.trend} />,
            vol: <RegimeBadge label={t.volatility} />,
            bubble: <RegimeBadge label={t.bubble} />,
            close: fmtMoney(t.close),
            conf: fmtPct(t.confidence, 0),
          }))}
          empty="No transitions"
        />
      </section>

      {/* regime performance matrix */}
      <section>
        <SectionHeading
          title="Regime Performance Matrix"
          right="annualized return by regime · validation (fallback: train)"
        />
        <div className="overflow-x-auto rounded-lg border border-bd bg-panel">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-bd bg-panel2/60">
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Strategy
                </th>
                {MATRIX_COLS.map((c) => (
                  <th
                    key={c}
                    className="px-2 py-2 text-center text-[9px] font-semibold uppercase tracking-wider text-muted"
                  >
                    {c.replace("_VOLATILITY", " VOL").replace("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 ? (
                <tr>
                  <td
                    colSpan={MATRIX_COLS.length + 1}
                    className="px-3 py-6 text-center text-faint"
                  >
                    No active strategies
                  </td>
                </tr>
              ) : (
                matrix.map(({ strategy, returns }) => (
                  <tr
                    key={strategy.strategy_id}
                    className="border-b border-bd/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/strategies/${strategy.strategy_id}`}
                          className="text-accent hover:underline"
                        >
                          {strategy.name}
                        </Link>
                        <StatusBadge status={strategy.status} />
                      </div>
                    </td>
                    {MATRIX_COLS.map((c) => {
                      const v = returns[c] ?? null;
                      return (
                        <td
                          key={c}
                          className="num px-2 py-1.5 text-center text-[11px]"
                          style={heatStyle(v)}
                        >
                          {v === null ? (
                            <span className="text-faint">—</span>
                          ) : (
                            fmtPct(v, 0)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-faint">
          Top 12 active strategies (ELITE + SURVIVED) by fitness. Cell color
          intensity reflects the magnitude of annualized return in that regime.
        </p>
      </section>
    </div>
  );
}
