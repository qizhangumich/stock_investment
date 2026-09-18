"""Feature engineering (spec §5).

All features are computed from data up to and including day t (rolling windows,
no centered windows) — no look-ahead. The backtester additionally lags signal
execution by one day.

Price-derived features use adjusted close so splits/dividends do not create
artificial jumps.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Feature groups drive mutation (features are only swapped within a group)
FEATURE_GROUPS: dict[str, list[str]] = {
    "return": ["ret_1d", "ret_5d", "ret_20d", "ret_60d", "cumret_252d"],
    "trend": [
        "sma_10", "sma_20", "sma_50", "sma_100", "sma_200", "ema_20",
        "dist_sma_20", "dist_sma_50", "dist_sma_200", "sma_50_slope", "sma_200_slope",
    ],
    "momentum": ["rsi_14", "macd", "macd_signal", "macd_hist", "roc_20", "momentum_60"],
    "volatility": ["vol_20", "vol_60", "atr_14", "true_range", "vol_pctile"],
    "volume": ["vol_chg", "volume_sma_20", "rel_volume", "volume_breakout"],
    "structure": [
        "roll_high_20", "roll_high_50", "roll_low_20", "roll_low_50",
        "dist_52w_high", "drawdown", "breakout_20", "breakout_50", "breakout_252",
    ],
}

# Features whose values are comparable to price (for feature-vs-feature conditions)
PRICE_LEVEL_FEATURES = {
    "close", "sma_10", "sma_20", "sma_50", "sma_100", "sma_200", "ema_20",
    "roll_high_20", "roll_high_50", "roll_low_20", "roll_low_50",
}

# Sensible threshold ranges per feature, used by mutation to keep thresholds sane
THRESHOLD_RANGES: dict[str, tuple[float, float]] = {
    "ret_1d": (-0.10, 0.10), "ret_5d": (-0.15, 0.15), "ret_20d": (-0.30, 0.30),
    "ret_60d": (-0.50, 0.50), "cumret_252d": (-0.6, 1.5),
    "dist_sma_20": (-0.25, 0.25), "dist_sma_50": (-0.35, 0.35), "dist_sma_200": (-0.5, 0.8),
    "sma_50_slope": (-0.01, 0.01), "sma_200_slope": (-0.005, 0.005),
    "rsi_14": (15, 85), "macd_hist": (-5, 5), "roc_20": (-30, 30), "momentum_60": (-0.5, 0.5),
    "vol_20": (0.15, 1.2), "vol_60": (0.15, 1.0), "vol_pctile": (0.05, 0.95),
    "vol_chg": (-0.5, 2.0), "rel_volume": (0.5, 3.0),
    "dist_52w_high": (-0.7, 0.0), "drawdown": (-0.7, 0.0),
}


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a DataFrame of features aligned to df's index."""
    px = df["adj_close"]
    high = df["high"] * (df["adj_close"] / df["close"])  # adjust OHLC consistently
    low = df["low"] * (df["adj_close"] / df["close"])
    volume = df["volume"].astype(float)

    f = pd.DataFrame(index=df.index)
    f["close"] = px
    ret = px.pct_change()
    f["ret_1d"] = ret
    f["ret_5d"] = px.pct_change(5)
    f["ret_20d"] = px.pct_change(20)
    f["ret_60d"] = px.pct_change(60)
    f["cumret_252d"] = px.pct_change(252)

    for w in (10, 20, 50, 100, 200):
        f[f"sma_{w}"] = px.rolling(w).mean()
    f["ema_20"] = px.ewm(span=20, adjust=False).mean()
    f["dist_sma_20"] = px / f["sma_20"] - 1
    f["dist_sma_50"] = px / f["sma_50"] - 1
    f["dist_sma_200"] = px / f["sma_200"] - 1
    f["sma_50_slope"] = f["sma_50"].pct_change(10) / 10
    f["sma_200_slope"] = f["sma_200"].pct_change(20) / 20

    # RSI (Wilder)
    delta = px.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    f["rsi_14"] = 100 - 100 / (1 + rs)

    ema12 = px.ewm(span=12, adjust=False).mean()
    ema26 = px.ewm(span=26, adjust=False).mean()
    f["macd"] = ema12 - ema26
    f["macd_signal"] = f["macd"].ewm(span=9, adjust=False).mean()
    f["macd_hist"] = f["macd"] - f["macd_signal"]
    f["roc_20"] = px.pct_change(20) * 100
    f["momentum_60"] = px / px.shift(60) - 1

    # Volatility (annualized realized)
    f["vol_20"] = ret.rolling(20).std() * np.sqrt(252)
    f["vol_60"] = ret.rolling(60).std() * np.sqrt(252)
    prev_close = px.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    f["true_range"] = tr / px
    f["atr_14"] = (tr.ewm(alpha=1 / 14, adjust=False).mean()) / px
    f["vol_pctile"] = f["vol_20"].rolling(504, min_periods=252).rank(pct=True)

    f["vol_chg"] = volume.pct_change(5)
    f["volume_sma_20"] = volume.rolling(20).mean()
    f["rel_volume"] = volume / f["volume_sma_20"]
    f["volume_breakout"] = (f["rel_volume"] > 2.0).astype(float)

    for w in (20, 50):
        f[f"roll_high_{w}"] = px.rolling(w).max()
        f[f"roll_low_{w}"] = px.rolling(w).min()
    roll_high_252 = px.rolling(252, min_periods=60).max()
    f["dist_52w_high"] = px / roll_high_252 - 1
    running_max = px.cummax()
    f["drawdown"] = px / running_max - 1
    # breakout flags: close makes a new N-day high (vs. yesterday's rolling high)
    f["breakout_20"] = (px > f["roll_high_20"].shift(1)).astype(float)
    f["breakout_50"] = (px > f["roll_high_50"].shift(1)).astype(float)
    f["breakout_252"] = (px > roll_high_252.shift(1)).astype(float)

    return f
