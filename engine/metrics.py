"""Evaluator metrics (spec §12–13). Never judge a strategy by return alone."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest import BacktestResult

TRADING_DAYS = 252


def compute_metrics(bt: BacktestResult) -> dict:
    r = bt.returns
    n = len(r)
    if n < 30:
        return _empty_metrics()

    equity = bt.equity
    total_return = float(equity.iloc[-1] - 1)
    years = n / TRADING_DAYS
    cagr = float(equity.iloc[-1] ** (1 / years) - 1) if equity.iloc[-1] > 0 else -1.0
    ann_ret = float(r.mean() * TRADING_DAYS)
    vol = float(r.std() * np.sqrt(TRADING_DAYS))

    dd_series = equity / equity.cummax() - 1
    max_dd = float(dd_series.min())
    avg_dd = float(dd_series[dd_series < 0].mean()) if (dd_series < 0).any() else 0.0
    downside = r[r < 0]
    downside_dev = float(downside.std() * np.sqrt(TRADING_DAYS)) if len(downside) > 1 else 0.0

    sharpe = float(ann_ret / vol) if vol > 1e-9 else 0.0
    sortino = float(ann_ret / downside_dev) if downside_dev > 1e-9 else 0.0
    calmar = float(cagr / abs(max_dd)) if max_dd < -1e-9 else 0.0

    closed = [t for t in bt.trades if not t["open"]]
    wins = [t for t in closed if t["return_pct"] > 0]
    losses = [t for t in closed if t["return_pct"] <= 0]
    n_tr = len(closed)
    win_rate = len(wins) / n_tr if n_tr else 0.0
    avg_win = float(np.mean([t["return_pct"] for t in wins])) / 100 if wins else 0.0
    avg_loss = float(np.mean([abs(t["return_pct"]) for t in losses])) / 100 if losses else 0.0
    gross_win = sum(t["return_pct"] for t in wins)
    gross_loss = abs(sum(t["return_pct"] for t in losses))
    profit_factor = float(gross_win / gross_loss) if gross_loss > 1e-9 else (5.0 if gross_win > 0 else 0.0)
    payoff = float(avg_win / avg_loss) if avg_loss > 1e-9 else (5.0 if avg_win > 0 else 0.0)
    expectancy = win_rate * avg_win - (1 - win_rate) * avg_loss  # spec §13

    return {
        "total_return": total_return,
        "cagr": cagr,
        "annualized_return": ann_ret,
        "volatility": vol,
        "max_drawdown": max_dd,
        "avg_drawdown": avg_dd,
        "downside_deviation": downside_dev,
        "sharpe": sharpe,
        "sortino": sortino,
        "calmar": calmar,
        "num_trades": n_tr,
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": win_rate,
        "loss_rate": 1 - win_rate if n_tr else 0.0,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "largest_win": max((t["return_pct"] for t in wins), default=0.0) / 100,
        "largest_loss": min((t["return_pct"] for t in losses), default=0.0) / 100,
        "profit_factor": min(profit_factor, 10.0),
        "payoff_ratio": min(payoff, 10.0),
        "expectancy": expectancy,
        "avg_holding_days": float(np.mean([t["holding_days"] for t in closed])) if closed else 0.0,
        "turnover": bt.turnover,
        "exposure": bt.exposure,
        "cash_ratio": bt.cash_ratio,
        "avg_position": bt.avg_position,
        "num_days": n,
    }


def _empty_metrics() -> dict:
    keys = [
        "total_return", "cagr", "annualized_return", "volatility", "max_drawdown", "avg_drawdown",
        "downside_deviation", "sharpe", "sortino", "calmar", "num_trades", "winning_trades",
        "losing_trades", "win_rate", "loss_rate", "avg_win", "avg_loss", "largest_win",
        "largest_loss", "profit_factor", "payoff_ratio", "expectancy", "avg_holding_days",
        "turnover", "exposure", "cash_ratio", "avg_position", "num_days",
    ]
    return {k: 0.0 for k in keys}


def regime_performance(returns: pd.Series, positions: pd.Series, regimes: pd.DataFrame) -> dict:
    """Annualized strategy return + exposure per regime label (spec §18)."""
    out = {}
    reg = regimes.loc[returns.index]
    for dim in ("trend", "volatility", "bubble"):
        for label in reg[dim].unique():
            mask = reg[dim] == label
            if mask.sum() < 20:
                continue
            seg = returns[mask]
            out[label] = {
                "days": int(mask.sum()),
                "ann_return": float(seg.mean() * TRADING_DAYS),
                "sharpe": float(seg.mean() / seg.std() * np.sqrt(TRADING_DAYS)) if seg.std() > 1e-9 else 0.0,
                "exposure": float(positions[mask].mean()),
            }
    return out
