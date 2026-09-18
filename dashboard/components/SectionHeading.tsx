import type { ReactNode } from "react";

export default function SectionHeading({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
        <span className="inline-block h-3 w-0.5 bg-amber" />
        {title}
      </h2>
      {right ? <div className="text-[11px] text-faint">{right}</div> : null}
    </div>
  );
}
