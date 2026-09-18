import Link from "next/link";
import SectionHeading from "@/components/SectionHeading";
import { fmtInt, fmtNum } from "@/lib/format";
import {
  getDailyByDate,
  getDailyDates,
  getLatestDaily,
  getPreviousDaily,
} from "@/lib/queries";
import ReportView from "./ReportView";

export const dynamic = "force-dynamic";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const dates = getDailyDates();
  const row = date ? getDailyByDate(date) : getLatestDaily();
  const prev = row ? getPreviousDaily(row.date) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-wide">
            Daily Report
          </h1>
          <p className="mt-1 text-xs text-muted">
            {row ? (
              <>
                <span className="num text-fg">{row.date}</span> · generation{" "}
                <span className="num text-amber">{row.generation ?? "—"}</span>
                {prev ? (
                  <>
                    {" "}
                    · deltas vs <span className="num">{prev.date}</span>
                  </>
                ) : null}
              </>
            ) : (
              "No reports yet"
            )}
          </p>
        </div>
      </div>

      {row ? (
        <ReportView row={row} prev={prev} />
      ) : (
        <div className="rounded-lg border border-bd bg-panel p-5 text-sm text-faint">
          {date
            ? `No report found for ${date}.`
            : "The engine has not produced a daily report yet."}
        </div>
      )}

      <section>
        <SectionHeading title="Report Archive" />
        <div className="overflow-x-auto rounded-lg border border-bd bg-panel">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-bd bg-panel2/60">
                {["Date", "Gen", "Tested", "Survived", "Rejected", "New Elites", "Best Fitness"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted ${
                        i > 0 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {dates.map(({ date: d }) => {
                const r = getDailyByDate(d);
                const isCurrent = row?.date === d;
                return (
                  <tr
                    key={d}
                    className={`border-b border-bd/60 last:border-0 ${
                      isCurrent ? "bg-panel2/60" : "hover:bg-panel2/40"
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/daily-report/${d}`}
                        className={`num hover:underline ${
                          isCurrent ? "font-bold text-amber" : "text-accent"
                        }`}
                      >
                        {d}
                      </Link>
                    </td>
                    <td className="num px-3 py-1.5 text-right">
                      {r?.generation ?? "—"}
                    </td>
                    <td className="num px-3 py-1.5 text-right">
                      {fmtInt(r?.strategies_tested)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-pos">
                      {fmtInt(r?.survived)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-neg">
                      {fmtInt(r?.rejected)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-amber">
                      {fmtInt(r?.new_elites)}
                    </td>
                    <td className="num px-3 py-1.5 text-right">
                      {fmtNum(r?.best_fitness ?? null, 4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
