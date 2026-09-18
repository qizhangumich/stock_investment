"""Market regime engine (spec §6–7).

Three dimensions per trading day:
  trend:      UPTREND / DOWNTREND / SIDEWAYS
  volatility: LOW_VOLATILITY / MEDIUM_VOLATILITY / HIGH_VOLATILITY
  bubble:     NORMAL / EXPENSIVE / EXTREME  (price-based for Phase One)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import load_config

TREND_LABELS = ["UPTREND", "DOWNTREND", "SIDEWAYS"]
VOL_LABELS = ["LOW_VOLATILITY", "MEDIUM_VOLATILITY", "HIGH_VOLATILITY"]
BUBBLE_LABELS = ["NORMAL", "EXPENSIVE", "EXTREME"]


def classify_regimes(features: pd.DataFrame) -> pd.DataFrame:
    cfg = load_config()["regimes"]
    px = features["close"]

    # --- Trend: vote of price-vs-SMA200, SMA50-vs-SMA200 and medium-term slope
    above_200 = (px > features["sma_200"]).astype(int)
    golden = (features["sma_50"] > features["sma_200"]).astype(int)
    slope_up = (features["sma_50_slope"] > 0).astype(int)
    votes = above_200 + golden + slope_up
    trend = pd.Series("SIDEWAYS", index=features.index)
    trend[votes >= 3] = "UPTREND"
    trend[votes <= 0] = "DOWNTREND"
    # strong medium-term returns can promote/demote the middle band
    trend[(votes == 2) & (features["ret_60d"] > 0.10)] = "UPTREND"
    trend[(votes == 1) & (features["ret_60d"] < -0.15)] = "DOWNTREND"
    trend_conf = (votes.map({0: 3, 1: 2, 2: 2, 3: 3}) / 3.0).fillna(0.5)

    # --- Volatility: rolling percentile of 20d realized vol
    vp = features["vol_pctile"]
    vol = pd.Series("MEDIUM_VOLATILITY", index=features.index)
    vol[vp <= cfg["vol_low_pct"]] = "LOW_VOLATILITY"
    vol[vp >= cfg["vol_high_pct"]] = "HIGH_VOLATILITY"
    vol_conf = (vp - 0.5).abs() * 2  # more extreme percentile -> more confident

    # --- Bubble (price-based): percentile of distance above SMA200 + 1y return percentile
    d200 = features["dist_sma_200"]
    d200_pct = d200.rolling(756, min_periods=252).rank(pct=True)
    r252_pct = features["cumret_252d"].rolling(756, min_periods=252).rank(pct=True)
    heat = (d200_pct + r252_pct) / 2
    bubble = pd.Series("NORMAL", index=features.index)
    bubble[(heat >= cfg["bubble_expensive_pct"]) & (d200 > 0.15)] = "EXPENSIVE"
    bubble[(heat >= cfg["bubble_extreme_pct"]) & (d200 > 0.40)] = "EXTREME"

    out = pd.DataFrame(
        {
            "trend": trend,
            "volatility": vol,
            "bubble": bubble,
            "confidence": ((trend_conf + vol_conf.fillna(0.5)) / 2).clip(0.3, 0.98).round(2),
        },
        index=features.index,
    )
    out["combined"] = out["trend"] + " + " + out["volatility"] + " + " + out["bubble"]

    # mark days a regime dimension changed and how long the current combo has run
    changed = (out["combined"] != out["combined"].shift(1)).astype(int)
    out["regime_change"] = changed
    grp = changed.cumsum()
    out["regime_since"] = out.groupby(grp)["combined"].transform(lambda s: s.index[0].strftime("%Y-%m-%d"))
    return out


def regime_transitions(regimes: pd.DataFrame, n: int = 12) -> list[dict]:
    """Most recent regime transitions for the dashboard."""
    ch = regimes[regimes["regime_change"] == 1]
    rows = []
    for date, r in ch.tail(n).iterrows():
        rows.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "trend": r["trend"],
                "volatility": r["volatility"],
                "bubble": r["bubble"],
            }
        )
    return rows
