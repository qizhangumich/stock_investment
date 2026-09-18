# AlphaEvolve Investment Lab — Phase One (TSLA)

A self-improving quantitative investment research system inspired by AlphaEvolve / OpenEvolve.
It continuously generates, mutates, backtests, and selects TSLA trading strategies, tracks the
full evolutionary history in a database, and shows everything on a web dashboard.

> Do not ask AI to predict the stock. Ask AI to continuously evolve better ways of investing in
> the stock — and learn **which strategies work under which market regimes**.

## Architecture

```
Historical Market Data (yfinance, modular)
  → Feature Engineering (returns, trend, momentum, volatility, volume, structure)
  → Market Regime Classification (trend × volatility × bubble)
  → Strategy Population (JSON rule-tree genomes, long/cash)
  → Mutation (heuristic parameter+structural ops, crossover, optional LLM rewriting)
  → Vectorized Backtesting (1-day execution lag, commission+slippage)
  → Evaluator (30+ metrics, walk-forward, regime matrix, composite fitness)
  → Selection + MAP-Elites archive (family × holding-period diversity grid)
  → SQLite Evolution Database → Daily Report → Next.js Dashboard
```

## Layout

| Path | What it is |
| --- | --- |
| `config.yaml` | All knobs: splits, costs, fitness weights, evolution params, LLM mutation |
| `engine/` | Python evolution engine (data, features, regimes, genome, backtest, metrics, mutation, evolution, report, db) |
| `run_daily.py` | Daily cycle: refresh data → evolve N generations → daily report |
| `db/evolution.db` | SQLite evolution database (schema mirrors a future Postgres/Supabase) |
| `dashboard/` | Next.js 15 + TypeScript + Tailwind dashboard (reads the DB read-only) |
| `scripts/register_daily_task.ps1` | Registers the Windows scheduled task for daily automation |
| `instructions/v1.md` | Full product specification |

## Quick start

```bash
pip install -r requirements.txt
python run_daily.py --bootstrap        # first run: seeds + 8 generations
```

Dashboard:

```bash
cd dashboard
npm install
npm run dev                            # http://localhost:3000
```

Daily cycle (run manually or via the scheduled task):

```bash
python run_daily.py --generations 3
```

## Overfitting protection

- **Splits** (configurable): train 2012–2019, validation 2020–2022, hidden test 2023→now.
- Fitness/selection use train + walk-forward + validation only. **Hidden-test results are
  stored for reporting but never feed back into mutation or selection.**
- Walk-forward folds 2016–2022; strategies with strong train but collapsing validation are
  flagged `OVERFIT`.
- Complexity and turnover penalties in the composite fitness; costs (5 bps commission +
  5 bps slippage) in every backtest.
- Fixed benchmarks (`BENCH_BH` buy & hold, `BENCH_SMA200`) never evolve.

## LLM mutation

Heuristic mutation always works. With `llm_mutation.enabled: auto` in `config.yaml`, a
fraction of children per generation are mutated by an LLM that rewrites the strategy genome
JSON and explains the change (stored in the lineage). Provider is configurable:

- `provider: openai` (default) — uses `OPENAI_API_KEY`, model e.g. `gpt-5-mini`
- `provider: anthropic` — uses `ANTHROPIC_API_KEY`, model e.g. `claude-sonnet-5`

Set the key persistently on Windows so the scheduled task sees it:
`setx OPENAI_API_KEY "sk-..."`. Without a key the engine silently falls back to
heuristic-only evolution.

## Strategy genome

Strategies are JSON rule trees — entry/exit condition trees over ~40 engineered features,
regime gates, and regime-conditional position scaling — interpreted by a safe vectorized
evaluator and rendered as readable pseudocode on the dashboard. Long/cash only in Phase One
(positions in [0, 1]); the representation already supports fractional sizing and can be
extended to shorts.

## Phase One status vs. spec (instructions/v1.md)

- V0 backtesting foundation ✅  V1 regimes ✅  V2 evolution ✅  V3 robustness ✅
- V4 MAP-Elites archive ✅ (family × holding-period grid; islands later)
- V5 dashboard ✅ (overview, evolution growth, strategy zoo + detail, regimes, daily report, evolution tree)
- V6 daily automation ✅ (`run_daily.py` + Windows scheduled task)
- V7 decision support ✅ (regime + eligible strategies + population consensus on overview/report)
- Later: strategy router page, weekly reports, notifications, Supabase/Vercel deployment, more tickers.
