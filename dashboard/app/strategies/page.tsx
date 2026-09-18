import Link from "next/link";
import { FamilyBadge, StatusBadge } from "@/components/Badge";
import DataTable from "@/components/DataTable";
import SectionHeading from "@/components/SectionHeading";
import { fmtDate, fmtNum, fmtPct, signClass } from "@/lib/format";
import { getFamilies, getStatuses, getStrategyList } from "@/lib/queries";

export const dynamic = "force-dynamic";

function filterHref(params: {
  status?: string;
  family?: string;
  view?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.family) sp.set("family", params.family);
  if (params.view) sp.set("view", params.view);
  const qs = sp.toString();
  return qs ? `/strategies?${qs}` : "/strategies";
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider transition-colors ${
        active
          ? "border-amber-500/60 bg-amber-500/10 text-amber"
          : "border-bd2 text-muted hover:border-bd2 hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; family?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status || undefined;
  const family = sp.family || undefined;
  const showAll = sp.view === "all" || Boolean(status);
  const activeOnly = !showAll;

  const rows = getStrategyList({ status, family, activeOnly });
  const families = getFamilies();
  const statuses = getStatuses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide">
          Strategy Zoo
        </h1>
        <p className="mt-1 text-xs text-muted">
          {rows.length} strategies · sorted by fitness ·{" "}
          {activeOnly ? "active population only (ELITE + SURVIVED)" : "all statuses"}
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-faint">
            View
          </span>
          <Chip href={filterHref({ family })} active={activeOnly}>
            ACTIVE ONLY
          </Chip>
          <Chip
            href={filterHref({ family, view: "all" })}
            active={showAll && !status}
          >
            ALL
          </Chip>
          {statuses.map((s) => (
            <Chip
              key={s}
              href={filterHref({ status: s, family })}
              active={status === s}
            >
              {s}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-faint">
            Family
          </span>
          <Chip
            href={filterHref({ status, view: sp.view })}
            active={!family}
          >
            ALL FAMILIES
          </Chip>
          {families.map((f) => (
            <Chip
              key={f}
              href={filterHref({ status, family: f, view: sp.view })}
              active={family === f}
            >
              {f.toUpperCase()}
            </Chip>
          ))}
        </div>
      </section>

      <SectionHeading title="Strategies" />
      <DataTable
        columns={[
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "family", label: "Family" },
          { key: "gen", label: "Gen", align: "right" },
          { key: "status", label: "Status", align: "center" },
          { key: "fitness", label: "Fitness", align: "right" },
          { key: "cagr", label: "Val CAGR", align: "right" },
          { key: "sharpe", label: "Val Sharpe", align: "right" },
          { key: "maxdd", label: "Val Max DD", align: "right" },
          { key: "cx", label: "Complexity", align: "right" },
          { key: "created", label: "Created", align: "right" },
        ]}
        rows={rows.map((s) => ({
          id: (
            <Link
              href={`/strategies/${s.strategy_id}`}
              className="num text-accent hover:underline"
            >
              {s.strategy_id}
            </Link>
          ),
          name: (
            <Link
              href={`/strategies/${s.strategy_id}`}
              className="font-medium text-fg hover:text-amber hover:underline"
            >
              {s.name}
            </Link>
          ),
          family: <FamilyBadge family={s.family} />,
          gen: s.generation,
          status: <StatusBadge status={s.status} />,
          fitness: (
            <span className={s.fitness !== null ? "text-amber" : "text-faint"}>
              {fmtNum(s.fitness, 4)}
            </span>
          ),
          cagr: <span className={signClass(s.val_cagr)}>{fmtPct(s.val_cagr)}</span>,
          sharpe: fmtNum(s.val_sharpe),
          maxdd: (
            <span className={signClass(s.val_max_dd)}>
              {fmtPct(s.val_max_dd)}
            </span>
          ),
          cx: fmtNum(s.complexity, 0),
          created: (
            <span className="text-muted">{fmtDate(s.creation_time)}</span>
          ),
        }))}
        empty="No strategies match this filter"
      />
    </div>
  );
}
