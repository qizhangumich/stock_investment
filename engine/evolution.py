"""Evolution engine: cascade evaluation, fitness, selection, MAP-Elites.

Overfitting protection (spec §16): fitness and selection use TRAIN +
walk-forward + VALIDATION only. Hidden-test results are computed and stored
for reporting, but never feed back into mutation or selection.
"""
from __future__ import annotations

import json
import random

import numpy as np
import pandas as pd

from . import db as dbm
from .backtest import run_backtest
from .config import load_config, llm_available
from .data import load_market_data
from .features import compute_features
from .genome import complexity, generate_positions, genome_hash, render_code, validate
from .metrics import compute_metrics, regime_performance
from .mutation import crossover, heuristic_mutate, llm_mutate
from .regimes import classify_regimes
from .seeds import seed_population

HOLDING_BUCKETS = [("short", 0, 8), ("medium", 8, 30), ("long", 30, 10_000)]


def holding_bucket(avg_days: float) -> str:
    for name, lo, hi in HOLDING_BUCKETS:
        if lo <= avg_days < hi:
            return name
    return "long"


class Lab:
    """Holds data/features/regimes and evaluates genomes."""

    def __init__(self, refresh_data: bool = False):
        cfg = load_config()
        self.cfg = cfg
        self.ticker = cfg["ticker"]
        self.prices_df = load_market_data(self.ticker, refresh=refresh_data)
        self.features = compute_features(self.prices_df)
        self.regimes = classify_regimes(self.features)
        self.px = self.features["close"]

        s = cfg["splits"]
        self.train = (s["train_start"], s["train_end"])
        self.val = (s["validation_start"], s["validation_end"])
        self.hidden = (s["hidden_test_start"], self.px.index[-1].strftime("%Y-%m-%d"))
        self.rng = random.Random(cfg["evolution"]["seed"])

    # ------------------------------------------------------------ evaluation

    def _slice(self, series: pd.Series, period: tuple[str, str]) -> pd.Series:
        return series.loc[period[0] : period[1]]

    def evaluate(self, genome: dict) -> dict:
        """Full cascade evaluation (spec §24). Returns a result dict with
        stage reached, metrics per period, fitness, and rejection reason."""
        cfg = self.cfg["evolution"]
        positions = generate_positions(genome, self.features, self.regimes)
        out: dict = {"genome": genome, "positions": positions, "metrics": {}, "regime": {},
                     "equity": {}, "trades": {}, "fitness": None, "status": "REJECTED", "reason": None}

        # ---- Stage 1: cheap screen on last 3 years of TRAIN
        t_end = pd.Timestamp(self.train[1])
        s1 = positions.loc[t_end - pd.DateOffset(years=3) : t_end]
        if s1.sum() == 0:
            out["reason"] = "stage1: never enters a position"
            return out
        bt1 = run_backtest(s1, self.px)
        m1 = compute_metrics(bt1)
        if m1["sharpe"] < cfg["stage1_min_sharpe"] or m1["num_trades"] == 0:
            out["reason"] = f"stage1: sharpe {m1['sharpe']:.2f} below screen"
            return out

        # ---- Stage 2: full TRAIN backtest with costs
        bt_train = run_backtest(self._slice(positions, self.train), self.px)
        m_train = compute_metrics(bt_train)
        out["metrics"]["train"] = m_train
        if m_train["num_trades"] < 3:
            out["reason"] = "stage2: fewer than 3 trades in train"
            return out

        # ---- Stage 3: robustness — walk-forward + validation + regimes
        wf = self.walk_forward(positions)
        out["metrics"].update({f"wf_{y}": m for y, m in wf.items()})
        bt_val = run_backtest(self._slice(positions, self.val), self.px)
        m_val = compute_metrics(bt_val)
        out["metrics"]["validation"] = m_val
        out["regime"]["train"] = regime_performance(bt_train.returns, bt_train.positions, self.regimes)
        out["regime"]["validation"] = regime_performance(bt_val.returns, bt_val.positions, self.regimes)

        fitness, parts = self.fitness(genome, m_train, m_val, wf, out["regime"]["train"])
        out["fitness"] = fitness
        out["fitness_parts"] = parts
        if fitness < cfg["stage2_min_fitness"]:
            out["reason"] = f"fitness {fitness:.3f} below threshold"
            return out

        # Overfit check: strong train, collapsing validation
        if m_train["sharpe"] > 0.8 and m_val["sharpe"] < 0.2 * m_train["sharpe"]:
            out["status"] = "OVERFIT"
            out["reason"] = f"train sharpe {m_train['sharpe']:.2f} vs validation {m_val['sharpe']:.2f}"
            return out

        # ---- Hidden test: computed for REPORTING ONLY, never used above
        bt_hidden = run_backtest(self._slice(positions, self.hidden), self.px)
        out["metrics"]["hidden_test"] = compute_metrics(bt_hidden)
        bt_full = run_backtest(positions.loc[self.train[0] :], self.px)
        out["metrics"]["full"] = compute_metrics(bt_full)
        out["trades"]["full"] = bt_full.trades
        out["equity"]["full"] = self._equity_payload(bt_full)
        out["regime"]["hidden_test"] = regime_performance(bt_hidden.returns, bt_hidden.positions, self.regimes)

        # ---- Stage 4: elite qualification (uses validation, not hidden test)
        if (
            m_val["sharpe"] >= cfg["elite_min_validation_sharpe"]
            and m_val["max_drawdown"] >= cfg["elite_max_validation_drawdown"]
            and _wf_positive_fraction(wf) >= 0.5
        ):
            out["status"] = "ELITE"
        else:
            out["status"] = "SURVIVED"
        return out

    def walk_forward(self, positions: pd.Series) -> dict[int, dict]:
        wf_cfg = self.cfg["walk_forward"]
        folds = {}
        for year in range(wf_cfg["first_test_year"], wf_cfg["last_test_year"] + 1):
            seg = positions.loc[f"{year}-01-01" : f"{year}-12-31"]
            if len(seg) < 100:
                continue
            folds[year] = compute_metrics(run_backtest(seg, self.px))
        return folds

    def fitness(self, genome: dict, m_train: dict, m_val: dict, wf: dict, regime_train: dict) -> tuple[float, dict]:
        """Composite fitness (spec §42) on TRAIN + robustness. Weights in config."""
        w = self.cfg["fitness"]["weights"]

        def norm(x, scale):
            return float(np.clip(x / scale, -1, 1))

        # blend train and validation so selection prefers strategies that generalize
        cagr = 0.6 * m_train["cagr"] + 0.4 * m_val["cagr"]
        sharpe = 0.6 * m_train["sharpe"] + 0.4 * m_val["sharpe"]
        sortino = 0.6 * m_train["sortino"] + 0.4 * m_val["sortino"]
        calmar = 0.6 * m_train["calmar"] + 0.4 * m_val["calmar"]

        robustness = _wf_positive_fraction(wf)
        # regime stability: fraction of trend regimes where the strategy either
        # made money or stayed mostly out of the market
        labels = [l for l in regime_train if l in ("UPTREND", "DOWNTREND", "SIDEWAYS")]
        ok = sum(1 for l in labels if regime_train[l]["ann_return"] > 0 or regime_train[l]["exposure"] < 0.25)
        regime_stability = ok / len(labels) if labels else 0.0

        parts = {
            "cagr": norm(cagr, 0.5), "sharpe": norm(sharpe, 2.0), "sortino": norm(sortino, 3.0),
            "calmar": norm(calmar, 2.0), "robustness": robustness, "regime_stability": regime_stability,
            "turnover_penalty": float(np.clip(m_train["turnover"] / 60.0, 0, 1)),
            "complexity_penalty": float(np.clip(complexity(genome) / 30.0, 0, 1)),
        }
        fit = (
            w["cagr"] * parts["cagr"] + w["sharpe"] * parts["sharpe"]
            + w["sortino"] * parts["sortino"] + w["calmar"] * parts["calmar"]
            + w["robustness"] * parts["robustness"] + w["regime_stability"] * parts["regime_stability"]
            - w["turnover_penalty"] * parts["turnover_penalty"]
            - w["complexity_penalty"] * parts["complexity_penalty"]
        )
        return float(fit), parts

    def _equity_payload(self, bt) -> list:
        """Weekly-downsampled equity curve with buy&hold overlay + split labels."""
        eq = bt.equity
        bh = (1 + self.px.loc[eq.index].pct_change().fillna(0)).cumprod()
        weekly = eq.resample("W").last().dropna()
        bh_w = bh.resample("W").last().dropna()
        rows = []
        for d, v in weekly.items():
            ds = d.strftime("%Y-%m-%d")
            split = "train" if ds <= self.train[1] else ("validation" if ds <= self.val[1] else "hidden_test")
            rows.append([ds, round(float(v), 4), round(float(bh_w.get(d, np.nan)), 4), split])
        return rows


def _wf_positive_fraction(wf: dict) -> float:
    if not wf:
        return 0.0
    pos = sum(1 for m in wf.values() if m["sharpe"] > 0)
    return pos / len(wf)


# ================================================================ generation

def _persist_result(conn, lab: Lab, sid: str, res: dict):
    for period, m in res["metrics"].items():
        bounds = {
            "train": lab.train, "validation": lab.val, "hidden_test": lab.hidden,
            "full": (lab.train[0], lab.hidden[1]),
        }.get(period)
        if bounds is None:  # wf_<year>
            y = period.split("_")[1]
            bounds = (f"{y}-01-01", f"{y}-12-31")
        equity = res["equity"].get(period)
        dbm.save_backtest(conn, sid, period, bounds[0], bounds[1], m, equity)
    for period, rr in res["regime"].items():
        dbm.save_regime_results(conn, sid, period, rr)
    if res["trades"].get("full"):
        dbm.save_trades(conn, sid, "full", res["trades"]["full"])
    dbm.set_status(conn, sid, res["status"], res.get("fitness"))


def _perf_summary_for_llm(res: dict) -> str:
    m, v = res["metrics"].get("train", {}), res["metrics"].get("validation", {})
    wf = {k: r for k, r in res["metrics"].items() if k.startswith("wf_")}
    lines = [
        f"train: CAGR {m.get('cagr', 0):.1%}, sharpe {m.get('sharpe', 0):.2f}, maxDD {m.get('max_drawdown', 0):.1%}, "
        f"win rate {m.get('win_rate', 0):.1%}, trades {m.get('num_trades', 0)}, turnover {m.get('turnover', 0):.1f}",
        f"validation: CAGR {v.get('cagr', 0):.1%}, sharpe {v.get('sharpe', 0):.2f}, maxDD {v.get('max_drawdown', 0):.1%}",
        "walk-forward sharpe by year: " + ", ".join(f"{k[3:]}: {r['sharpe']:.2f}" for k, r in sorted(wf.items())),
    ]
    return "\n".join(lines)


def load_population(conn, limit: int) -> list[dict]:
    rows = conn.execute(
        """SELECT strategy_id, genome_json, fitness FROM strategies
           WHERE status IN ('ELITE','SURVIVED') AND fitness IS NOT NULL
           ORDER BY fitness DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    pop = []
    for r in rows:
        g = json.loads(r["genome_json"])
        g["_id"], g["_fitness"] = r["strategy_id"], r["fitness"]
        pop.append(g)
    return pop


def run_generation(lab: Lab, conn, gen: int, log=print) -> dict:
    """One evolution generation: breed children, cascade-evaluate, select, archive."""
    cfg = lab.cfg["evolution"]
    rng = lab.rng
    started = dbm.now()

    population = load_population(conn, cfg["population_size"])
    children: list[tuple[dict, list[str], str, str]] = []  # genome, parents, mut_type, desc

    if gen == 0 or not population:
        for g in seed_population():
            children.append((g, [], "seed", "seed strategy"))
    else:
        n_children = cfg["children_per_generation"]
        n_cross = int(n_children * cfg["crossover_fraction"]) if len(population) >= 2 else 0
        use_llm = llm_available()
        n_llm = int(n_children * lab.cfg["llm_mutation"]["fraction"]) if use_llm else 0

        # fitness-weighted parent sampling
        weights = [max(p["_fitness"], 0.01) for p in population]

        for _ in range(n_cross):
            a, b = rng.choices(population, weights=weights, k=2)
            if a["_id"] == b["_id"] and len(population) > 1:
                b = rng.choice([p for p in population if p["_id"] != a["_id"]])
            child, desc = crossover(a, b, rng)
            children.append((child, [a["_id"], b["_id"]], "crossover", desc))

        made_llm = 0
        while len(children) < n_children:
            parent = rng.choices(population, weights=weights, k=1)[0]
            done = False
            if made_llm < n_llm:
                row = conn.execute("SELECT strategy_id FROM strategies WHERE strategy_id=?", (parent["_id"],)).fetchone()
                res_row = conn.execute(
                    "SELECT metrics_json FROM backtest_results WHERE strategy_id=? AND period='train'", (parent["_id"],)
                ).fetchone()
                summary = ""
                if res_row:
                    summary = _perf_summary_for_llm({"metrics": {"train": json.loads(res_row["metrics_json"]), "validation": {}}})
                out = llm_mutate({k: v for k, v in parent.items() if not k.startswith("_")}, summary)
                if out:
                    child, mt, desc = out
                    children.append((child, [parent["_id"]], "llm", desc))
                    made_llm += 1
                    done = True
            if not done:
                child, mt, desc = heuristic_mutate({k: v for k, v in parent.items() if not k.startswith("_")}, rng)
                children.append((child, [parent["_id"]], mt, desc))

    # ---------------- evaluate children
    tested = survived = rejected = new_elites = 0
    best_fit, best_sid = None, None
    family_counter: dict[str, int] = {}
    for genome, parents, mut_type, desc in children:
        genome = validate(genome)
        h = genome_hash(genome)
        sid = dbm.next_strategy_id(conn)
        fam = genome["family"]
        family_counter[fam] = family_counter.get(fam, 0) + 1
        genome["name"] = f"{genome['name'].split('_V')[0]}_V{sid[1:]}"
        ok = dbm.insert_strategy(conn, sid, genome, gen, parents, mut_type, desc,
                                 complexity(genome), render_code(genome), h)
        if not ok:
            continue  # duplicate genome — skip silently
        tested += 1
        res = lab.evaluate(genome)
        if res["status"] in ("SURVIVED", "ELITE"):
            survived += 1
            if res["status"] == "ELITE":
                new_elites += 1
            _persist_result(conn, lab, sid, res)
            if best_fit is None or res["fitness"] > best_fit:
                best_fit, best_sid = res["fitness"], sid
            _update_archive(conn, sid, genome, res)
        else:
            rejected += 1
            # keep whatever metrics we computed before rejection, for research history
            for period, m in res["metrics"].items():
                if period in ("train", "validation"):
                    bounds = lab.train if period == "train" else lab.val
                    dbm.save_backtest(conn, sid, period, bounds[0], bounds[1], m)
            dbm.set_status(conn, sid, res["status"], res.get("fitness"))
            conn.execute("UPDATE strategies SET mutation_description = mutation_description || ' | rejected: ' || ? WHERE strategy_id=?",
                         (res.get("reason") or "n/a", sid))
        conn.commit()
        log(f"  gen {gen} {sid} [{res['status']}] fitness={res.get('fitness')} {genome['name']}")

    # ---------------- trim population
    keep = cfg["population_size"]
    rows = conn.execute(
        "SELECT strategy_id FROM strategies WHERE status IN ('ELITE','SURVIVED') ORDER BY fitness DESC"
    ).fetchall()
    for r in rows[keep:]:
        dbm.set_status(conn, r["strategy_id"], "ARCHIVED")

    n_families = conn.execute(
        "SELECT COUNT(DISTINCT family) c FROM strategies WHERE status IN ('ELITE','SURVIVED')"
    ).fetchone()["c"]
    pop_size = conn.execute(
        "SELECT COUNT(*) c FROM strategies WHERE status IN ('ELITE','SURVIVED')"
    ).fetchone()["c"]
    overall_best = conn.execute(
        "SELECT strategy_id, fitness FROM strategies WHERE status IN ('ELITE','SURVIVED') ORDER BY fitness DESC LIMIT 1"
    ).fetchone()

    conn.execute(
        """INSERT OR REPLACE INTO generations
           (generation, started_at, finished_at, num_tested, num_survived, num_rejected,
            num_new_elites, best_fitness, best_strategy_id, population_size, num_families)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (gen, started, dbm.now(), tested, survived, rejected, new_elites,
         overall_best["fitness"] if overall_best else None,
         overall_best["strategy_id"] if overall_best else None, pop_size, n_families),
    )
    conn.commit()
    return {"generation": gen, "tested": tested, "survived": survived, "rejected": rejected,
            "new_elites": new_elites, "best_strategy_id": best_sid, "best_fitness": best_fit}


def _update_archive(conn, sid: str, genome: dict, res: dict):
    m = res["metrics"].get("train", {})
    bucket = holding_bucket(m.get("avg_holding_days", 0.0))
    row = conn.execute(
        "SELECT fitness FROM archive WHERE family=? AND holding_bucket=?", (genome["family"], bucket)
    ).fetchone()
    if row is None or (res["fitness"] or -9) > (row["fitness"] or -9):
        conn.execute(
            "INSERT OR REPLACE INTO archive (family, holding_bucket, strategy_id, fitness, updated_at) VALUES (?,?,?,?,?)",
            (genome["family"], bucket, sid, res["fitness"], dbm.now()),
        )


def save_benchmarks(lab: Lab, conn):
    """Fixed, non-evolving benchmarks (spec §40)."""
    ones = pd.Series(1.0, index=lab.features.index)
    sma = (lab.features["close"] > lab.features["sma_200"]).astype(float)
    for sid, name, positions in (("BENCH_BH", "TSLA Buy & Hold", ones), ("BENCH_SMA200", "SMA200 Trend", sma)):
        conn.execute(
            """INSERT OR REPLACE INTO strategies (strategy_id, name, generation, parent_ids, creation_time,
               family, genome_json, source_code, mutation_type, mutation_description, complexity, fitness, status, genome_hash)
               VALUES (?,?,-1,'[]',?,?,'{}','# fixed benchmark','benchmark','fixed control',0,NULL,'BENCHMARK',?)""",
            (sid, name, dbm.now(), "benchmark", sid),
        )
        for period, bounds in (("train", lab.train), ("validation", lab.val), ("hidden_test", lab.hidden),
                               ("full", (lab.train[0], lab.hidden[1]))):
            bt = run_backtest(positions.loc[bounds[0] : bounds[1]], lab.px,
                              cost_bps=0 if sid == "BENCH_BH" else None,
                              slippage_bps=0 if sid == "BENCH_BH" else None)
            equity = lab._equity_payload(bt) if period == "full" else None
            dbm.save_backtest(conn, sid, period, bounds[0], bounds[1], compute_metrics(bt), equity)
    conn.commit()
