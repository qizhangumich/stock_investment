"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/evolution", label: "Evolution Growth" },
  { href: "/strategies", label: "Strategy Zoo" },
  { href: "/regimes", label: "Market Regimes" },
  { href: "/daily-report", label: "Daily Report" },
  { href: "/evolution-tree", label: "Evolution Tree" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-bd bg-panel">
      <div className="border-b border-bd px-5 py-5">
        <div className="font-mono text-sm font-bold tracking-[0.2em] text-amber">
          ALPHAEVOLVE
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">
          Investment Lab · <span className="text-accent">TSLA</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-[13px] transition-colors ${
                active
                  ? "bg-panel2 font-medium text-fg"
                  : "text-muted hover:bg-panel2/60 hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-bd px-5 py-4 text-[10px] leading-relaxed text-faint">
        Self-improving strategy
        <br />
        evolution engine
      </div>
    </aside>
  );
}
