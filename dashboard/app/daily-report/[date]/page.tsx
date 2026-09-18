import Link from "next/link";
import { notFound } from "next/navigation";
import { getDailyByDate, getPreviousDaily } from "@/lib/queries";
import ReportView from "../ReportView";

export const dynamic = "force-dynamic";

export default async function DailyReportDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const row = getDailyByDate(decodeURIComponent(date));
  if (!row) notFound();
  const prev = getPreviousDaily(row.date);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-[11px] text-faint">
          <Link href="/daily-report" className="text-accent hover:underline">
            Daily Report
          </Link>{" "}
          / <span className="num">{row.date}</span>
        </div>
        <h1 className="font-mono text-xl font-bold tracking-wide">
          Report · <span className="text-amber">{row.date}</span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          Generation <span className="num">{row.generation ?? "—"}</span>
          {prev ? (
            <>
              {" "}
              · deltas vs <span className="num">{prev.date}</span>
            </>
          ) : null}
        </p>
      </div>
      <ReportView row={row} prev={prev} />
    </div>
  );
}
