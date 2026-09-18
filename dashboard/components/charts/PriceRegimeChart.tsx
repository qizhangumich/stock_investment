"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint, TrendBand } from "@/lib/queries";

const TREND_FILL: Record<string, string> = {
  UPTREND: "rgba(74,222,128,0.10)",
  DOWNTREND: "rgba(248,113,113,0.10)",
  SIDEWAYS: "rgba(148,163,184,0.05)",
};

const TREND_CHIP: Record<string, string> = {
  UPTREND: "rgba(74,222,128,0.45)",
  DOWNTREND: "rgba(248,113,113,0.45)",
  SIDEWAYS: "rgba(148,163,184,0.35)",
};

export default function PriceRegimeChart({
  points,
  bands,
}: {
  points: PricePoint[];
  bands: TrendBand[];
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-faint">
        No price data
      </div>
    );
  }

  const years = new Set<string>();
  const ticks: string[] = [];
  for (const p of points) {
    const y = p.date.slice(0, 4);
    if (!years.has(y)) {
      years.add(y);
      ticks.push(p.date);
    }
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="#1c2434" strokeDasharray="3 3" />
          {bands.map((b, i) => (
            <ReferenceArea
              key={i}
              x1={b.x1}
              x2={b.x2}
              fill={TREND_FILL[b.trend] ?? "transparent"}
              stroke="none"
            />
          ))}
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={(d: string) => d.slice(0, 4)}
            tick={{ fill: "#7d8aa0", fontSize: 10 }}
            stroke="#2a3447"
            minTickGap={16}
          />
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fill: "#7d8aa0", fontSize: 10 }}
            stroke="#2a3447"
            width={60}
            tickFormatter={(v: number) =>
              "$" + (v >= 100 ? v.toFixed(0) : v.toFixed(1))
            }
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
            formatter={(value, name, item) => {
              const trend = (item?.payload as PricePoint | undefined)?.trend;
              return [
                "$" + Number(value).toFixed(2) + (trend ? ` · ${trend}` : ""),
                "TSLA Close",
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#dbe4f0"
            strokeWidth={1.4}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-fg" /> TSLA close (log
          scale)
        </span>
        {Object.entries(TREND_CHIP).map(([trend, chip]) => (
          <span key={trend} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-bd2"
              style={{ background: chip }}
            />
            {trend}
          </span>
        ))}
      </div>
    </div>
  );
}
