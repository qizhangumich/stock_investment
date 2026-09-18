import type { ReactNode } from "react";

const STATUS_STYLES: Record<string, string> = {
  ELITE: "bg-amber-500/15 text-gold border-amber-500/40",
  SURVIVED: "bg-emerald-500/10 text-pos border-emerald-500/40",
  REJECTED: "bg-gray-500/10 text-gray-400 border-gray-500/40",
  OVERFIT: "bg-red-500/10 text-neg border-red-500/40",
  ARCHIVED: "bg-slate-500/10 text-slate-400 border-slate-500/40",
  BENCHMARK: "bg-blue-500/10 text-accent border-blue-500/40",
  NEW: "bg-violet-500/10 text-violet border-violet-500/40",
  TESTING: "bg-cyan-500/10 text-cyan-400 border-cyan-500/40",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-faint">—</span>;
  const cls =
    STATUS_STYLES[status] ?? "bg-gray-500/10 text-muted border-gray-500/40";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

const REGIME_STYLES: Record<string, string> = {
  UPTREND: "bg-emerald-500/10 text-pos border-emerald-500/40",
  DOWNTREND: "bg-red-500/10 text-neg border-red-500/40",
  SIDEWAYS: "bg-gray-500/10 text-gray-300 border-gray-500/40",
  LOW_VOLATILITY: "bg-emerald-500/10 text-pos border-emerald-500/40",
  MEDIUM_VOLATILITY: "bg-amber-500/10 text-amber border-amber-500/40",
  HIGH_VOLATILITY: "bg-red-500/10 text-neg border-red-500/40",
  NORMAL: "bg-blue-500/10 text-accent border-blue-500/40",
  EXPENSIVE: "bg-amber-500/10 text-amber border-amber-500/40",
  EXTREME: "bg-red-500/10 text-neg border-red-500/40",
};

export function RegimeBadge({
  label,
  big = false,
}: {
  label: string | null | undefined;
  big?: boolean;
}) {
  if (!label) return <span className="text-faint">—</span>;
  const cls =
    REGIME_STYLES[label] ?? "bg-gray-500/10 text-muted border-gray-500/40";
  const size = big
    ? "px-4 py-2 text-sm font-bold tracking-widest"
    : "px-1.5 py-0.5 text-[10px] font-semibold tracking-wider";
  return (
    <span className={`inline-block rounded border font-mono ${size} ${cls}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function FamilyBadge({ family }: { family: string | null }) {
  if (!family) return <span className="text-faint">—</span>;
  return (
    <span className="inline-block rounded bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {family}
    </span>
  );
}

export function StatusLight({
  state,
  label,
}: {
  state: "ok" | "off" | "alert";
  label: ReactNode;
}) {
  const color =
    state === "alert"
      ? "bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
      : state === "ok"
        ? "bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
        : "bg-gray-600";
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
      {label}
    </div>
  );
}
