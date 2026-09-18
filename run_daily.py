"""Daily evolution runner (spec §23).

Usage:
    python run_daily.py                 # daily cycle: refresh data, 1 generation, report
    python run_daily.py --generations 5 # run more generations
    python run_daily.py --bootstrap     # first-time setup: seeds + many generations
    python run_daily.py --no-refresh    # skip the data download (offline)
"""
from __future__ import annotations

import argparse
import sys

from engine import db as dbm
from engine.evolution import Lab, run_generation, save_benchmarks
from engine.report import build_daily_report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generations", type=int, default=1)
    ap.add_argument("--bootstrap", action="store_true")
    ap.add_argument("--no-refresh", action="store_true")
    args = ap.parse_args()

    print("[1/5] Loading market data + features + regimes ...")
    lab = Lab(refresh_data=not args.no_refresh)
    print(f"      {lab.ticker}: {len(lab.px)} daily bars {lab.px.index[0].date()} .. {lab.px.index[-1].date()}")
    print(f"      current regime: {lab.regimes.iloc[-1]['combined']}")

    conn = dbm.connect()
    run_id = conn.execute(
        "INSERT INTO model_runs (kind, started_at) VALUES (?, ?)",
        ("bootstrap" if args.bootstrap else "daily", dbm.now()),
    ).lastrowid
    conn.commit()

    print("[2/5] Saving market regimes + benchmarks ...")
    dbm.save_market_regimes(conn, lab.regimes.dropna(), lab.px)
    save_benchmarks(lab, conn)
    conn.commit()

    start_gen = conn.execute("SELECT MAX(generation) g FROM generations").fetchone()["g"]
    start_gen = 0 if start_gen is None else start_gen + 1
    n_gens = max(args.generations, 8) if args.bootstrap and start_gen == 0 else args.generations

    print(f"[3/5] Running {n_gens} generation(s) starting at generation {start_gen} ...")
    stats = []
    for gen in range(start_gen, start_gen + n_gens):
        s = run_generation(lab, conn, gen)
        stats.append(s)
        print(f"      generation {gen}: tested={s['tested']} survived={s['survived']} "
              f"elites={s['new_elites']} best_fitness={s['best_fitness']}")

    print("[4/5] Building daily evolution report ...")
    report = build_daily_report(lab, conn, stats)
    bs = report.get("best_strategy") or {}
    hid = bs.get("hidden_test") or {}
    print(f"      current elite: {bs.get('name')} | OOS CAGR: {fmt_pct(hid.get('cagr'))} "
          f"| OOS sharpe: {fmt(hid.get('sharpe'))} | OOS maxDD: {fmt_pct(hid.get('max_drawdown'))}")
    print(f"      consensus: long {report['consensus']['long_pct']}% / cash {report['consensus']['cash_pct']}%")

    conn.execute("UPDATE model_runs SET finished_at=?, generations_run=? WHERE id=?",
                 (dbm.now(), len(stats), run_id))
    conn.commit()
    conn.close()
    print("[5/5] Done. Open the dashboard to explore today's evolution.")


def fmt(x):
    return "n/a" if x is None else f"{x:.2f}"


def fmt_pct(x):
    return "n/a" if x is None else f"{x:.1%}"


if __name__ == "__main__":
    sys.exit(main())
