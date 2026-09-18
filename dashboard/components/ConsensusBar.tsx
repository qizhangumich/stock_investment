export default function ConsensusBar({
  longPct,
  cashPct,
  shortPct,
  nStrategies,
}: {
  longPct: number;
  cashPct: number;
  shortPct: number;
  nStrategies?: number;
}) {
  const total = longPct + cashPct + shortPct || 1;
  const seg = (v: number) => `${(v / total) * 100}%`;
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded border border-bd">
        {longPct > 0 && (
          <div
            className="flex items-center justify-center bg-emerald-500/30 font-mono text-[10px] font-bold text-pos"
            style={{ width: seg(longPct) }}
          >
            {longPct >= 8 ? `LONG ${longPct.toFixed(0)}%` : ""}
          </div>
        )}
        {cashPct > 0 && (
          <div
            className="flex items-center justify-center bg-slate-500/20 font-mono text-[10px] font-bold text-slate-300"
            style={{ width: seg(cashPct) }}
          >
            {cashPct >= 8 ? `CASH ${cashPct.toFixed(0)}%` : ""}
          </div>
        )}
        {shortPct > 0 && (
          <div
            className="flex items-center justify-center bg-red-500/30 font-mono text-[10px] font-bold text-neg"
            style={{ width: seg(shortPct) }}
          >
            {shortPct >= 8 ? `SHORT ${shortPct.toFixed(0)}%` : ""}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-faint">
        <span>
          Long {longPct.toFixed(1)}% · Cash {cashPct.toFixed(1)}% · Short{" "}
          {shortPct.toFixed(1)}%
        </span>
        {nStrategies !== undefined && (
          <span>{nStrategies} active strategies polled</span>
        )}
      </div>
    </div>
  );
}
