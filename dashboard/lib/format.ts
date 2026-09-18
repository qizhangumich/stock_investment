/** Formatting helpers shared by server and client components. */

const EM_DASH = "—";

function isNil(x: number | null | undefined): x is null | undefined {
  return x === null || x === undefined || Number.isNaN(x);
}

/** Format a fraction (0.294) as a percent string (29.4%). */
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (isNil(x)) return EM_DASH;
  return (x * 100).toFixed(digits) + "%";
}

/** Format a value that is ALREADY a percent (e.g. trades.return_pct). */
export function fmtRawPct(x: number | null | undefined, digits = 1): string {
  if (isNil(x)) return EM_DASH;
  return x.toFixed(digits) + "%";
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (isNil(x)) return EM_DASH;
  return x.toFixed(digits);
}

export function fmtInt(x: number | null | undefined): string {
  if (isNil(x)) return EM_DASH;
  return Math.round(x).toLocaleString("en-US");
}

export function fmtMoney(x: number | null | undefined, digits = 2): string {
  if (isNil(x)) return EM_DASH;
  return "$" + x.toFixed(digits);
}

/** Tailwind text color class for a signed value (green pos / red neg). */
export function signClass(x: number | null | undefined): string {
  if (isNil(x) || x === 0) return "text-fg";
  return x > 0 ? "text-pos" : "text-neg";
}

/** Signed percent with color-friendly plus prefix. */
export function fmtSignedPct(x: number | null | undefined, digits = 1): string {
  if (isNil(x)) return EM_DASH;
  const s = (x * 100).toFixed(digits) + "%";
  return x > 0 ? "+" + s : s;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return EM_DASH;
  return s.slice(0, 10);
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return EM_DASH;
  return s.slice(0, 16).replace("T", " ");
}

export const emDash = EM_DASH;
