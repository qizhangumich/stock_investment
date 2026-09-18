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
import type { EquityPoint, Split } from "@/lib/types";

const SPLIT_META: Record<Split, { label: string; fill: string; chip: string }> =
  {
    train: {
      label: "In-sample",
      fill: "rgba(96,165,250,0.06)",
      chip: "rgba(96,165,250,0.35)",
    },
    validation: {
      label: "Validation",
      fill: "rgba(251,191,36,0.09)",
      chip: "rgba(251,191,36,0.35)",
    },
    hidden_test: {
      label: "Hidden test",
      fill: "rgba(167,139,250,0.12)",
      chip: "rgba(167,139,250,0.35)",
    },
  };

const SPLIT_ORDER: Split[] = ["train", "validation", "hidden_test"];

interface ChartPoint {
  date: string;
  strategy: number;
  buyHold: number;
}

function money(v: number): string {
  return (
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export default function EquityChart({
  data,
  strategyName,
  height = 340,
}: {
  data: EquityPoint[];
  strategyName: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-faint">
        No equity curve available
      </div>
    );
  }

  const points: ChartPoint[] = data.map((p) => ({
    date: p.date,
    strategy: p.strategy * 100,
    buyHold: p.buyHold * 100,
  }));

  // contiguous ranges per split
  const ranges: { split: Split; x1: string; x2: string }[] = [];
  for (const p of data) {
    const cur = ranges[ranges.length - 1];
    if (cur && cur.split === p.split) cur.x2 = p.date;
    else ranges.push({ split: p.split, x1: p.date, x2: p.date });
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
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="#1c2434" strokeDasharray="3 3" />
          {ranges.map((r, i) => (
            <ReferenceArea
              key={i}
              x1={r.x1}
              x2={r.x2}
              fill={SPLIT_META[r.split]?.fill ?? "transparent"}
              stroke="none"
              label={
                ranges.length <= 4
                  ? {
                      value: SPLIT_META[r.split]?.label ?? r.split,
                      position: "insideTop",
                      fill: "#566175",
                      fontSize: 10,
                    }
                  : undefined
              }
            />
          ))}
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={(d: string) => d.slice(0, 4)}
            tick={{ fill: "#7d8aa0", fontSize: 10 }}
            stroke="#2a3447"
            minTickGap={20}
          />
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            tickFormatter={money}
            tick={{ fill: "#7d8aa0", fontSize: 10 }}
            stroke="#2a3447"
            width={70}
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
            formatter={(value, name) => [
              money(Number(value)),
              name === "strategy" ? strategyName : "TSLA Buy & Hold",
            ]}
          />
          <Line
            type="monotone"
            dataKey="buyHold"
            stroke="#60a5fa"
            strokeWidth={1.2}
            strokeOpacity={0.7}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="strategy"
            stroke="#fbbf24"
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-amber" /> {strategyName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent" /> TSLA Buy & Hold
        </span>
        <span className="ml-auto flex items-center gap-3">
          {SPLIT_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-bd2"
                style={{ background: SPLIT_META[s].chip }}
              />
              {SPLIT_META[s].label}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-faint">
        Growth of $100 · log scale · in-sample, validation and hidden-test
        segments are shaded separately and must not be compared as one
        out-of-sample track record.
      </div>
    </div>
  );
}
