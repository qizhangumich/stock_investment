"""Vectorized backtesting engine (spec §12, §14).

Execution model: the target position decided at day t's close earns day t+1's
return (one-day lag — no look-ahead). Transaction cost + slippage are charged
on every unit of position change.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import load_config


@dataclass
class BacktestResult:
    returns: pd.Series          # daily strategy returns (after costs)
    equity: pd.Series           # cumulative growth of $1
    positions: pd.Series        # held position per day (after lag)
    trades: list[dict] = field(default_factory=list)
    turnover: float = 0.0       # avg annual turnover (sum |Δpos| per year)
    exposure: float = 0.0       # mean position
    cash_ratio: float = 0.0
    avg_position: float = 0.0


def run_backtest(positions: pd.Series, prices: pd.Series, cost_bps: float | None = None,
                 slippage_bps: float | None = None) -> BacktestResult:
    cfg = load_config()["costs"]
    cost = (cfg["transaction_cost_bps"] if cost_bps is None else cost_bps) / 1e4
    slip = (cfg["slippage_bps"] if slippage_bps is None else slippage_bps) / 1e4

    px = prices.loc[positions.index]
    ret = px.pct_change().fillna(0.0)

    held = positions.shift(1).fillna(0.0)          # position actually held during day t
    dpos = held.diff().fillna(held)                # trades executed at day t open/close
    gross = held * ret
    costs = dpos.abs() * (cost + slip)
    net = gross - costs

    equity = (1 + net).cumprod()
    years = max(len(net) / 252, 1e-9)
    turnover = float(dpos.abs().sum() / years)

    trades = _extract_trades(held, net, px)

    return BacktestResult(
        returns=net,
        equity=equity,
        positions=held,
        trades=trades,
        turnover=turnover,
        exposure=float(held.mean()),
        cash_ratio=float((held == 0).mean()),
        avg_position=float(held[held > 0].mean()) if (held > 0).any() else 0.0,
    )


def _extract_trades(held: pd.Series, net: pd.Series, px: pd.Series) -> list[dict]:
    """Round-trip trades: flat -> long -> flat. Trade return = compounded
    strategy return over the holding window (costs and scaling included)."""
    trades = []
    in_pos = held > 0
    arr = in_pos.to_numpy()
    idx = held.index
    start = None
    for i in range(len(arr)):
        if arr[i] and start is None:
            start = i
        elif not arr[i] and start is not None:
            seg = net.iloc[start : i + 1]  # include exit-day cost
            trades.append(_trade_row(idx, start, i, seg, px))
            start = None
    if start is not None:
        seg = net.iloc[start:]
        trades.append(_trade_row(idx, start, len(arr) - 1, seg, px, open_trade=True))
    return trades


def _trade_row(idx, start: int, end: int, seg: pd.Series, px: pd.Series, open_trade: bool = False) -> dict:
    r = float((1 + seg).prod() - 1)
    return {
        "entry_date": idx[start].strftime("%Y-%m-%d"),
        "exit_date": None if open_trade else idx[end].strftime("%Y-%m-%d"),
        "entry_price": round(float(px.iloc[start]), 4),
        "exit_price": None if open_trade else round(float(px.iloc[end]), 4),
        "return_pct": round(r * 100, 4),
        "holding_days": int(end - start + 1),
        "open": open_trade,
    }
