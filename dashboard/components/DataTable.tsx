import type { ReactNode } from "react";

export interface Column {
  key: string;
  label: ReactNode;
  align?: "left" | "right" | "center";
}

/**
 * Dense dark-theme data table. Rows are maps of column key -> ReactNode.
 */
export default function DataTable({
  columns,
  rows,
  empty = "No data",
}: {
  columns: Column[];
  rows: Record<string, ReactNode>[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bd bg-panel">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-bd bg-panel2/60">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted ${
                  c.align === "right"
                    ? "text-right"
                    : c.align === "center"
                      ? "text-center"
                      : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-faint"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-bd/60 last:border-0 hover:bg-panel2/40"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-1.5 ${
                      c.align === "right"
                        ? "num text-right"
                        : c.align === "center"
                          ? "text-center"
                          : "text-left"
                    }`}
                  >
                    {row[c.key] ?? <span className="text-faint">—</span>}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
