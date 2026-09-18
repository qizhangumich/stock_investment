"""Evolution database (spec §21–22).

SQLite for Phase One. The schema deliberately mirrors what a Postgres/Supabase
deployment would use so migration is a connection-string change plus a copy.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from .config import db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS strategies (
    strategy_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    generation INTEGER NOT NULL,
    parent_ids TEXT NOT NULL DEFAULT '[]',
    creation_time TEXT NOT NULL,
    family TEXT NOT NULL,
    genome_json TEXT NOT NULL,
    source_code TEXT NOT NULL,
    mutation_type TEXT,
    mutation_description TEXT,
    complexity REAL NOT NULL,
    fitness REAL,
    status TEXT NOT NULL DEFAULT 'NEW',
    genome_hash TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS generations (
    generation INTEGER PRIMARY KEY,
    started_at TEXT, finished_at TEXT,
    num_tested INTEGER DEFAULT 0,
    num_survived INTEGER DEFAULT 0,
    num_rejected INTEGER DEFAULT 0,
    num_new_elites INTEGER DEFAULT 0,
    best_fitness REAL,
    best_strategy_id TEXT,
    population_size INTEGER,
    num_families INTEGER,
    notes TEXT
);
CREATE TABLE IF NOT EXISTS strategy_lineage (
    child_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    mutation_type TEXT,
    PRIMARY KEY (child_id, parent_id)
);
CREATE TABLE IF NOT EXISTS backtest_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    period TEXT NOT NULL,             -- train / validation / hidden_test / full / wf_<year>
    start_date TEXT, end_date TEXT,
    metrics_json TEXT NOT NULL,
    equity_json TEXT,                 -- downsampled [date, strategy, buy_hold]
    created_at TEXT NOT NULL,
    UNIQUE (strategy_id, period)
);
CREATE TABLE IF NOT EXISTS regime_results (
    strategy_id TEXT NOT NULL,
    period TEXT NOT NULL,
    regime_label TEXT NOT NULL,
    days INTEGER, ann_return REAL, sharpe REAL, exposure REAL,
    PRIMARY KEY (strategy_id, period, regime_label)
);
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    period TEXT NOT NULL,
    entry_date TEXT, exit_date TEXT,
    entry_price REAL, exit_price REAL,
    return_pct REAL, holding_days INTEGER, open INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS market_regimes (
    date TEXT PRIMARY KEY,
    trend TEXT, volatility TEXT, bubble TEXT,
    combined TEXT, confidence REAL, regime_since TEXT, close REAL
);
CREATE TABLE IF NOT EXISTS daily_evolution (
    date TEXT PRIMARY KEY,
    generation INTEGER,
    strategies_tested INTEGER, survived INTEGER, rejected INTEGER, new_elites INTEGER,
    total_tested INTEGER,
    best_strategy_id TEXT,
    best_fitness REAL, best_cagr REAL, best_sharpe REAL, best_max_dd REAL,
    best_win_rate REAL, best_profit_factor REAL, best_expectancy REAL, best_turnover REAL,
    report_json TEXT
);
CREATE TABLE IF NOT EXISTS archive (
    family TEXT NOT NULL,
    holding_bucket TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    fitness REAL,
    updated_at TEXT,
    PRIMARY KEY (family, holding_bucket)
);
CREATE TABLE IF NOT EXISTS model_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT, started_at TEXT, finished_at TEXT,
    generations_run INTEGER, notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_strategies_gen ON strategies (generation);
CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies (status);
CREATE INDEX IF NOT EXISTS idx_bt_strategy ON backtest_results (strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades (strategy_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------------- strategies

def next_strategy_id(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT COUNT(*) c FROM strategies").fetchone()
    return f"S{row['c'] + 1:04d}"


def insert_strategy(conn, strategy_id: str, genome: dict, generation: int, parents: list[str],
                    mutation_type: str | None, mutation_description: str | None,
                    complexity: float, source_code: str, genome_hash: str) -> bool:
    try:
        conn.execute(
            """INSERT INTO strategies (strategy_id, name, generation, parent_ids, creation_time,
               family, genome_json, source_code, mutation_type, mutation_description,
               complexity, status, genome_hash)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,'NEW',?)""",
            (strategy_id, genome["name"], generation, json.dumps(parents), now(), genome["family"],
             json.dumps(genome), source_code, mutation_type, mutation_description, complexity, genome_hash),
        )
        for p in parents:
            conn.execute(
                "INSERT OR IGNORE INTO strategy_lineage (child_id, parent_id, mutation_type) VALUES (?,?,?)",
                (strategy_id, p, mutation_type),
            )
        return True
    except sqlite3.IntegrityError:  # duplicate genome
        return False


def set_status(conn, strategy_id: str, status: str, fitness: float | None = None):
    if fitness is None:
        conn.execute("UPDATE strategies SET status=? WHERE strategy_id=?", (status, strategy_id))
    else:
        conn.execute("UPDATE strategies SET status=?, fitness=? WHERE strategy_id=?", (status, fitness, strategy_id))


def save_backtest(conn, strategy_id: str, period: str, start: str, end: str, metrics: dict,
                  equity: list | None = None):
    conn.execute(
        """INSERT INTO backtest_results (strategy_id, period, start_date, end_date, metrics_json, equity_json, created_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(strategy_id, period) DO UPDATE SET
             metrics_json=excluded.metrics_json, equity_json=excluded.equity_json,
             start_date=excluded.start_date, end_date=excluded.end_date, created_at=excluded.created_at""",
        (strategy_id, period, start, end, json.dumps(metrics), json.dumps(equity) if equity else None, now()),
    )


def save_regime_results(conn, strategy_id: str, period: str, results: dict):
    for label, r in results.items():
        conn.execute(
            """INSERT OR REPLACE INTO regime_results
               (strategy_id, period, regime_label, days, ann_return, sharpe, exposure)
               VALUES (?,?,?,?,?,?,?)""",
            (strategy_id, period, label, r["days"], r["ann_return"], r["sharpe"], r["exposure"]),
        )


def save_trades(conn, strategy_id: str, period: str, trades: list[dict]):
    conn.execute("DELETE FROM trades WHERE strategy_id=? AND period=?", (strategy_id, period))
    conn.executemany(
        """INSERT INTO trades (strategy_id, period, entry_date, exit_date, entry_price, exit_price,
           return_pct, holding_days, open) VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            (strategy_id, period, t["entry_date"], t["exit_date"], t["entry_price"], t["exit_price"],
             t["return_pct"], t["holding_days"], int(t["open"]))
            for t in trades
        ],
    )


def save_market_regimes(conn, regimes, closes):
    rows = [
        (d.strftime("%Y-%m-%d"), r["trend"], r["volatility"], r["bubble"], r["combined"],
         float(r["confidence"]), r["regime_since"], float(closes.loc[d]))
        for d, r in regimes.iterrows()
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO market_regimes (date, trend, volatility, bubble, combined, confidence, regime_since, close) VALUES (?,?,?,?,?,?,?,?)",
        rows,
    )
