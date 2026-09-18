"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface GenChartRow {
  generation: number;
  best_fitness: number | null;
  val_cagr: number | null;
  val_sharpe: number | null;
  val_max_dd: number | null;
  val_win_rate: number | null;
  population_size: number | null;
  num_families: number | null;
}

interface Panel {
  key: keyof GenChartRow;
  title: string;
  color: string;
  percent?: boolean;
  integer?: boolean;
}

const PANELS: Panel[] = [
  { key: "best_fitness", title: "Best Fitness", color: "#fbbf24" },
  { key: "val_cagr", title: "Best Validation CAGR", color: "#4ade80", percent: true },
  { key: "val_sharpe", title: "Best Validation Sharpe", color: "#60a5fa" },
  {
    key: "val_max_dd",
    title: "Best Validation Max Drawdown",
    color: "#f87171",
    percent: true,
  },
  {
    key: "val_win_rate",
    title: "Best Validation Win Rate",
    color: "#a78bfa",
    percent: true,
  },
  {
    key: "population_size",
    title: "Population Size",
    color: "#34d399",
    integer: true,
  },
  {
    key: "num_families",
    title: "Distinct Families",
    color: "#f59e0b",
    integer: true,
  },
];

function fmt(v: number | null, p: Panel): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (p.percent) return (v * 100).toFixed(1) + "%";
  if (p.integer) return String(Math.round(v));
  return v.toFixed(2);
}

export default function GenerationCharts({ rows }: { rows: GenChartRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PANELS.map((panel) => (
        <div
          key={panel.key}
          className="rounded-lg border border-bd bg-panel px-3 pb-2 pt-3"
        >
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {panel.title}
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart
              data={rows}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`grad-${panel.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={panel.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={panel.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1c2434" strokeDasharray="3 3" />
              <XAxis
                dataKey="generation"
                tick={{ fill: "#7d8aa0", fontSize: 10 }}
                stroke="#2a3447"
                tickFormatter={(g: number) => `G${g}`}
              />
              <YAxis
                tick={{ fill: "#7d8aa0", fontSize: 10 }}
                stroke="#2a3447"
                width={52}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmt(v, panel)}
              />
              <Tooltip
                contentStyle={{
                  background: "#0e131c",
                  border: "1px solid #2a3447",
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
                labelStyle={{ color: "#7d8aa0" }}
                labelFormatter={(g) => `Generation ${g}`}
                formatter={(value) => [
                  fmt(typeof value === "number" ? value : null, panel),
                  panel.title,
                ]}
              />
              <Area
                type="monotone"
                dataKey={panel.key}
                stroke={panel.color}
                strokeWidth={1.8}
                fill={`url(#grad-${panel.key})`}
                dot={{ r: 2.5, fill: panel.color, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
