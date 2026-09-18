"""Daily evolution report (spec §25, §27–29, §37)."""
from __future__ import annotations

import json

from . import db as dbm
from .genome import generate_positions
from .regimes import regime_transitions


def _best_elite(conn):
    return conn.execute(
        """SELECT s.*, b.metrics_json AS val_metrics, h.metrics_json AS hidden_metrics
           FROM strategies s
           LEFT JOIN backtest_results b ON b.strategy_id = s.strategy_id AND b.period = 'validation'
           LEFT JOIN backtest_results h ON h.strategy_id = s.strategy_id AND h.period = 'hidden_test'
           WHERE s.status IN ('ELITE','SURVIVED') AND s.fitness IS NOT NULL
           ORDER BY (s.status = 'ELITE') DESC, s.fitness DESC LIMIT 1"""
    ).fetchone()


def population_consensus(lab, conn) -> dict:
    """What does the active strategy population want to hold today? (spec §29)"""
    rows = conn.execute(
        "SELECT strategy_id, genome_json FROM strategies WHERE status IN ('ELITE','SURVIVED')"
    ).fetchall()
    long = cash = 0
    for r in rows:
        genome = json.loads(r["genome_json"])
        pos = generate_positions(genome, lab.features.tail(400), lab.regimes.tail(400))
        if pos.iloc[-1] > 0.5:
            long += 1
        else:
            cash += 1
    total = max(long + cash, 1)
    return {"long_pct": round(100 * long / total, 1), "cash_pct": round(100 * cash / total, 1),
            "short_pct": 0.0, "n_strategies": total}


def build_daily_report(lab, conn, gen_stats: list[dict]) -> dict:
    today = lab.px.index[-1].strftime("%Y-%m-%d")
    cur_regime = lab.regimes.iloc[-1]

    total_tested = conn.execute("SELECT COUNT(*) c FROM strategies WHERE status != 'BENCHMARK'").fetchone()["c"]
    cur_gen = conn.execute("SELECT MAX(generation) g FROM generations").fetchone()["g"] or 0
    best = _best_elite(conn)
    val_m = json.loads(best["val_metrics"]) if best and best["val_metrics"] else {}
    hid_m = json.loads(best["hidden_metrics"]) if best and best["hidden_metrics"] else {}

    tested = sum(g["tested"] for g in gen_stats)
    survived = sum(g["survived"] for g in gen_stats)
    new_elites = sum(g["new_elites"] for g in gen_stats)

    consensus = population_consensus(lab, conn)

    # regime-compatible strategies: positive validation-period return in current trend regime
    compatible = conn.execute(
        """SELECT COUNT(DISTINCT strategy_id) c FROM regime_results
           WHERE period='validation' AND regime_label=? AND ann_return > 0
             AND strategy_id IN (SELECT strategy_id FROM strategies WHERE status IN ('ELITE','SURVIVED'))""",
        (cur_regime["trend"],),
    ).fetchone()["c"]
    n_elites_total = conn.execute("SELECT COUNT(*) c FROM strategies WHERE status='ELITE'").fetchone()["c"]

    top_families = [r["family"] for r in conn.execute(
        """SELECT family, AVG(fitness) af FROM strategies
           WHERE status IN ('ELITE','SURVIVED') GROUP BY family ORDER BY af DESC LIMIT 4"""
    ).fetchall()]

    report = {
        "date": today,
        "ticker": lab.ticker,
        "generation": cur_gen,
        "regime": {
            "trend": cur_regime["trend"], "volatility": cur_regime["volatility"],
            "bubble": cur_regime["bubble"], "since": cur_regime["regime_since"],
            "confidence": float(cur_regime["confidence"]),
            "transitions": regime_transitions(lab.regimes),
        },
        "evolution_summary": {
            "strategies_tested_today": tested,
            "survived_today": survived,
            "rejected_today": tested - survived,
            "new_elites_today": new_elites,
            "total_strategies_ever": total_tested,
            "total_elites": n_elites_total,
        },
        "best_strategy": None,
        "consensus": consensus,
        "decision_support": {
            "active_strategies": consensus["n_strategies"],
            "regime_compatible": compatible,
            "top_families": top_families,
        },
        "system_status": {
            "evolution_running": True, "data_updated": True, "backtests_completed": True,
            "overfitting_alert": _overfit_alert(conn),
        },
    }
    if best:
        report["best_strategy"] = {
            "strategy_id": best["strategy_id"], "name": best["name"], "family": best["family"],
            "generation": best["generation"], "mutation_description": best["mutation_description"],
            "validation": {k: val_m.get(k) for k in ("cagr", "sharpe", "sortino", "max_drawdown",
                                                     "win_rate", "profit_factor", "expectancy", "turnover")},
            "hidden_test": {k: hid_m.get(k) for k in ("cagr", "sharpe", "sortino", "max_drawdown",
                                                      "win_rate", "profit_factor", "expectancy", "turnover")},
        }

    conn.execute(
        """INSERT OR REPLACE INTO daily_evolution
           (date, generation, strategies_tested, survived, rejected, new_elites, total_tested,
            best_strategy_id, best_fitness, best_cagr, best_sharpe, best_max_dd, best_win_rate,
            best_profit_factor, best_expectancy, best_turnover, report_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (today, cur_gen, tested, survived, tested - survived, new_elites, total_tested,
         best["strategy_id"] if best else None, best["fitness"] if best else None,
         hid_m.get("cagr"), hid_m.get("sharpe"), hid_m.get("max_drawdown"), hid_m.get("win_rate"),
         hid_m.get("profit_factor"), hid_m.get("expectancy"), hid_m.get("turnover"),
         json.dumps(report)),
    )
    conn.commit()
    return report


def _overfit_alert(conn) -> bool:
    row = conn.execute(
        """SELECT COUNT(*) c FROM strategies WHERE status='OVERFIT'
           AND generation = (SELECT MAX(generation) FROM generations)"""
    ).fetchone()
    return (row["c"] or 0) > 3
