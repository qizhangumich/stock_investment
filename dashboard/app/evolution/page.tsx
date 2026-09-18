import Link from "next/link";
import { StatusBadge } from "@/components/Badge";
import DataTable from "@/components/DataTable";
import SectionHeading from "@/components/SectionHeading";
import GenerationCharts from "@/components/charts/GenerationCharts";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import {
  getArchiveGrid,
  getGenerationSeries,
  HOLDING_BUCKETS,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function EvolutionPage() {
  const series = getGenerationSeries();
  const { families, cells } = getArchiveGrid();

  const chartRows = series.map((g) => ({
    generation: g.generation,
    best_fitness: g.best_fitness,
    val_cagr: g.val_cagr,
    val_sharpe: g.val_sharpe,
    val_max_dd: g.val_max_dd,
    val_win_rate: g.val_win_rate,
    population_size: g.population_size,
    num_families: g.num_families,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide">
          Evolution Growth
        </h1>
        <p className="mt-1 text-xs text-muted">
          Best-of-generation metrics (validation period) across{" "}
          {series.length} generations.
        </p>
      </div>

      <section>
        <SectionHeading title="Metrics by Generation" />
        <GenerationCharts rows={chartRows} />
      </section>

      <section>
        <SectionHeading title="Generation Log" />
        <DataTable
          columns={[
            { key: "gen", label: "Gen", align: "right" },
            { key: "finished", label: "Finished" },
            { key: "tested", label: "Tested", align: "right" },
            { key: "survived", label: "Survived", align: "right" },
            { key: "rejected", label: "Rejected", align: "right" },
            { key: "elites", label: "New Elites", align: "right" },
            { key: "fitness", label: "Best Fitness", align: "right" },
            { key: "best", label: "Best Strategy" },
            { key: "pop", label: "Population", align: "right" },
            { key: "fam", label: "Families", align: "right" },
          ]}
          rows={[...series].reverse().map((g) => ({
            gen: <span className="text-amber">{g.generation}</span>,
            finished: (
              <span className="num text-muted">
                {fmtDateTime(g.finished_at)}
              </span>
            ),
            tested: g.num_tested,
            survived: <span className="text-pos">{g.num_survived}</span>,
            rejected: <span className="text-neg">{g.num_rejected}</span>,
            elites: <span className="text-amber">{g.num_new_elites}</span>,
            fitness: fmtNum(g.best_fitness, 4),
            best: g.best_strategy_id ? (
              <Link
                href={`/strategies/${g.best_strategy_id}`}
                className="text-accent hover:underline"
              >
                {g.best_name ?? g.best_strategy_id}
              </Link>
            ) : undefined,
            pop: g.population_size,
            fam: g.num_families,
          }))}
        />
      </section>

      <section>
        <SectionHeading
          title="MAP-Elites Archive"
          right="best strategy per family × holding-period niche"
        />
        <div className="overflow-x-auto rounded-lg border border-bd bg-panel">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-bd bg-panel2/60">
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Family
                </th>
                {HOLDING_BUCKETS.map((b) => (
                  <th
                    key={b}
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted"
                  >
                    {b} hold
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {families.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-faint">
                    Archive empty
                  </td>
                </tr>
              ) : (
                families.map((fam) => (
                  <tr
                    key={fam}
                    className="border-b border-bd/60 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-muted">{fam}</td>
                    {HOLDING_BUCKETS.map((b) => {
                      const cell = cells.get(`${fam}|${b}`);
                      return (
                        <td key={b} className="px-3 py-2">
                          {cell ? (
                            <Link
                              href={`/strategies/${cell.strategy_id}`}
                              className="group block rounded border border-bd bg-panel2/50 px-2.5 py-1.5 hover:border-amber-500/40"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-fg group-hover:text-amber">
                                  {cell.name ?? cell.strategy_id}
                                </span>
                                {cell.status ? (
                                  <StatusBadge status={cell.status} />
                                ) : null}
                              </div>
                              <div className="num mt-0.5 text-[10px] text-muted">
                                fitness {fmtNum(cell.fitness, 4)}
                              </div>
                            </Link>
                          ) : (
                            <span className="block px-2.5 py-1.5 text-faint">
                              —
                            </span>
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
          Each niche keeps the fittest strategy of its family and holding
          bucket — diversity pressure for the evolutionary search. Validation
          CAGR of the overall best:{" "}
          <span className="num text-pos">
            {fmtPct(series[series.length - 1]?.val_cagr)}
          </span>
        </p>
      </section>
    </div>
  );
}
