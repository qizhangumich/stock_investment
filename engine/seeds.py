"""Seed strategy population (spec §9): ~16 human-understandable strategies."""
from __future__ import annotations

import copy

from .genome import validate

FAMILIES = [
    "momentum", "trend_following", "mean_reversion", "breakout",
    "buy_the_dip", "volatility", "defensive", "hybrid",
]


def _cmp(feature, op, value):
    return {"type": "cmp", "feature": feature, "op": op, "value": value}


def _cross(a, op, b):
    return {"type": "cross", "a": a, "op": op, "b": b}


def _flag(feature):
    return {"type": "flag", "feature": feature}


def _and(*children):
    return {"type": "and", "children": list(children)}


def _or(*children):
    return {"type": "or", "children": list(children)}


def _g(name, family, entry, exit=None, gates=None, rules=None, base=1.0):
    return {
        "name": name,
        "family": family,
        "entry": entry,
        "exit": exit,
        "regime_gates": gates or {},
        "position_rules": rules or [],
        "base_position": base,
    }


SEED_GENOMES: list[dict] = [
    # --- Momentum
    _g("PriceMomentum", "momentum",
       entry=_cmp("ret_20d", ">", 0.05),
       exit=_cmp("ret_20d", "<", -0.03)),
    _g("LongMomentum", "momentum",
       entry=_and(_cmp("momentum_60", ">", 0.10), _cmp("ret_5d", ">", 0.0)),
       exit=_cmp("momentum_60", "<", 0.0)),
    _g("MACDMomentum", "momentum",
       entry=_and(_cmp("macd_hist", ">", 0.0), _cross("close", ">", "sma_50")),
       exit=_cmp("macd_hist", "<", 0.0)),
    # --- Trend following
    _g("SMACross_50_200", "trend_following",
       entry=_cross("sma_50", ">", "sma_200"),
       exit=_cross("sma_50", "<", "sma_200")),
    _g("SMACross_20_100", "trend_following",
       entry=_cross("sma_20", ">", "sma_100"),
       exit=_cross("sma_20", "<", "sma_100")),
    _g("LongTermTrend", "trend_following",
       entry=_and(_cross("close", ">", "sma_200"), _cmp("sma_200_slope", ">", 0.0)),
       exit=_cross("close", "<", "sma_200")),
    # --- Mean reversion
    _g("RSIOversold", "mean_reversion",
       entry=_cmp("rsi_14", "<", 30),
       exit=_cmp("rsi_14", ">", 55)),
    _g("SnapbackFromSMA", "mean_reversion",
       entry=_cmp("dist_sma_20", "<", -0.10),
       exit=_cmp("dist_sma_20", ">", 0.0)),
    # --- Breakout
    _g("Breakout20", "breakout",
       entry=_flag("breakout_20"),
       exit=_cross("close", "<", "sma_20")),
    _g("Breakout52w", "breakout",
       entry=_flag("breakout_252"),
       exit=_cmp("dist_52w_high", "<", -0.15)),
    _g("VolumeBreakout", "breakout",
       entry=_and(_flag("breakout_50"), _cmp("rel_volume", ">", 1.5)),
       exit=_cross("close", "<", "sma_50")),
    # --- Buy the dip
    _g("BullPullback", "buy_the_dip",
       entry=_and(_cross("close", ">", "sma_200"), _cmp("dist_sma_20", "<", -0.05)),
       exit=_cmp("dist_sma_20", ">", 0.03)),
    _g("RSIPullbackInUptrend", "buy_the_dip",
       entry=_and(_cmp("rsi_14", "<", 45), _cross("sma_50", ">", "sma_200")),
       exit=_cmp("rsi_14", ">", 65),
       gates={"trend": ["UPTREND", "SIDEWAYS"]}),
    # --- Volatility
    _g("VolContraction", "volatility",
       entry=_and(_cmp("vol_pctile", "<", 0.35), _cmp("ret_20d", ">", 0.0)),
       exit=_cmp("vol_pctile", ">", 0.80)),
    # --- Defensive
    _g("DefensiveTrend", "defensive",
       entry=_and(_cross("close", ">", "sma_200"), _cmp("vol_pctile", "<", 0.7)),
       exit=_or(_cross("close", "<", "sma_200"), _cmp("drawdown", "<", -0.35)),
       rules=[{"dimension": "volatility", "value": "HIGH_VOLATILITY", "scale": 0.5}]),
    _g("DrawdownControl", "defensive",
       entry=_and(_cmp("ret_60d", ">", 0.0), _cmp("dist_52w_high", ">", -0.20)),
       exit=_cmp("dist_52w_high", "<", -0.25),
       rules=[{"dimension": "volatility", "value": "HIGH_VOLATILITY", "scale": 0.6}],
       gates={"trend": ["UPTREND", "SIDEWAYS"]}),
]


def seed_population() -> list[dict]:
    return [validate(copy.deepcopy(g)) for g in SEED_GENOMES]
