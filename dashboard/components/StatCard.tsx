import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "pos" | "neg" | "amber" | "accent";
}) {
  const valueCls =
    accent === "pos"
      ? "text-pos"
      : accent === "neg"
        ? "text-neg"
        : accent === "amber"
          ? "text-amber"
          : accent === "accent"
            ? "text-accent"
            : "text-fg";
  return (
    <div className="rounded-lg border border-bd bg-panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
        {label}
      </div>
      <div className={`num mt-1.5 text-2xl font-bold ${valueCls}`}>{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}
