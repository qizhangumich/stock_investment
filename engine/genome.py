"""Strategy genome (spec §8).

A strategy is a JSON-serializable rule tree:

{
  "name": "Momentum_V37",
  "family": "momentum",
  "entry":  <condition tree>,       # when flat: go long
  "exit":   <condition tree|None>,  # when long: go to cash (regime gate loss also exits)
  "regime_gates": {"trend": [...], "volatility": [...], "bubble": [...]},  # allowed regimes (null = all)
  "position_rules": [{"dimension": "volatility", "value": "HIGH_VOLATILITY", "scale": 0.5}],
  "base_position": 1.0
}

Condition tree nodes:
  {"type": "cmp",   "feature": "rsi_14", "op": "<", "value": 70}
  {"type": "cross", "a": "close", "op": ">", "b": "sma_200"}      # feature vs feature
  {"type": "flag",  "feature": "breakout_20"}                     # boolean feature == 1
  {"type": "and"|"or", "children": [...]}
  {"type": "not",   "child": {...}}

The interpreter evaluates the tree vectorized over the whole feature frame,
then runs a simple entry/exit state machine. Phase One is long/cash
(position in [0, 1]); the representation already supports fractional sizing.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

OPS = {"<", "<=", ">", ">="}
REGIME_DIMS = ["trend", "volatility", "bubble"]


# ---------------------------------------------------------------- evaluation

def eval_condition(node: dict | None, f: pd.DataFrame) -> pd.Series:
    if node is None:
        return pd.Series(False, index=f.index)
    t = node["type"]
    if t == "cmp":
        s = f[node["feature"]]
        v = float(node["value"])
        op = node["op"]
        if op == "<":
            return s < v
        if op == "<=":
            return s <= v
        if op == ">":
            return s > v
        if op == ">=":
            return s >= v
        raise ValueError(f"bad op {op}")
    if t == "cross":
        a, b = f[node["a"]], f[node["b"]]
        return a > b if node["op"] in (">", ">=") else a < b
    if t == "flag":
        return f[node["feature"]] >= 0.5
    if t == "and":
        out = pd.Series(True, index=f.index)
        for c in node["children"]:
            out &= eval_condition(c, f)
        return out
    if t == "or":
        out = pd.Series(False, index=f.index)
        for c in node["children"]:
            out |= eval_condition(c, f)
        return out
    if t == "not":
        return ~eval_condition(node["child"], f)
    raise ValueError(f"unknown node type {t}")


def _allowed_mask(genome: dict, regimes: pd.DataFrame) -> pd.Series:
    allowed = pd.Series(True, index=regimes.index)
    gates = genome.get("regime_gates") or {}
    for dim in REGIME_DIMS:
        vals = gates.get(dim)
        if vals:
            allowed &= regimes[dim].isin(vals)
    return allowed


def generate_positions(genome: dict, features: pd.DataFrame, regimes: pd.DataFrame) -> pd.Series:
    """Run the entry/exit state machine. Returns target position per day (0..1).

    The position on day t is decided from data through day t; the backtester
    applies it to day t+1's return (one-day execution lag).
    """
    entry = eval_condition(genome["entry"], features).to_numpy()
    exit_ = eval_condition(genome.get("exit"), features).to_numpy()
    allowed = _allowed_mask(genome, regimes).to_numpy()
    valid = ~features[_used_features(genome)].isna().any(axis=1).to_numpy() if _used_features(genome) else np.ones(len(features), bool)

    base = float(genome.get("base_position", 1.0))
    # per-day position scale from regime position rules
    scale = np.ones(len(features))
    for rule in genome.get("position_rules") or []:
        mask = (regimes[rule["dimension"]] == rule["value"]).to_numpy()
        scale[mask] *= float(rule["scale"])

    pos = np.zeros(len(features))
    in_pos = False
    for i in range(len(pos)):
        if not valid[i]:
            in_pos = False
            continue
        if in_pos:
            if exit_[i] or not allowed[i]:
                in_pos = False
        else:
            if entry[i] and allowed[i]:
                in_pos = True
        pos[i] = base * scale[i] if in_pos else 0.0
    return pd.Series(np.clip(pos, 0.0, 1.0), index=features.index)


# ---------------------------------------------------------------- utilities

def _walk(node: dict | None):
    if not node:
        return
    yield node
    for c in node.get("children", []):
        yield from _walk(c)
    if node.get("child"):
        yield from _walk(node["child"])


def _used_features(genome: dict) -> list[str]:
    feats = set()
    for cond in (genome["entry"], genome.get("exit")):
        for n in _walk(cond):
            if n["type"] in ("cmp", "flag"):
                feats.add(n["feature"])
            elif n["type"] == "cross":
                feats.add(n["a"])
                feats.add(n["b"])
    return sorted(feats)


def complexity(genome: dict) -> float:
    """Complexity score (spec §15): condition nodes + gates + sizing rules."""
    n_nodes = sum(1 for cond in (genome["entry"], genome.get("exit")) for _ in _walk(cond))
    gates = genome.get("regime_gates") or {}
    n_gates = sum(1 for d in REGIME_DIMS if gates.get(d))
    n_rules = len(genome.get("position_rules") or [])
    return float(n_nodes + n_gates + n_rules)


def genome_hash(genome: dict) -> str:
    payload = {k: genome[k] for k in ("entry", "exit", "regime_gates", "position_rules", "base_position") if k in genome}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


# ---------------------------------------------------------------- rendering

def _render_cond(node: dict | None, indent: int = 0) -> str:
    if node is None:
        return "never"
    t = node["type"]
    if t == "cmp":
        return f"{node['feature']} {node['op']} {round(float(node['value']), 4)}"
    if t == "cross":
        return f"{node['a']} {node['op']} {node['b']}"
    if t == "flag":
        return f"{node['feature']} == 1"
    if t in ("and", "or"):
        joiner = f" {t} "
        return "(" + joiner.join(_render_cond(c) for c in node["children"]) + ")"
    if t == "not":
        return f"not {_render_cond(node['child'])}"
    return "?"


def render_code(genome: dict) -> str:
    """Human-readable pseudocode of the strategy — shown on the dashboard and
    given to the LLM as the mutable 'source code'."""
    lines = [f"# {genome['name']}  [{genome['family']}]"]
    gates = genome.get("regime_gates") or {}
    for dim in REGIME_DIMS:
        if gates.get(dim):
            lines.append(f"require regime.{dim} in {gates[dim]}")
    lines.append(f"if flat and {_render_cond(genome['entry'])}:")
    lines.append(f"    position = {genome.get('base_position', 1.0)}")
    if genome.get("exit"):
        lines.append(f"if long and {_render_cond(genome['exit'])}:")
        lines.append("    position = 0.0  # exit to cash")
    for rule in genome.get("position_rules") or []:
        lines.append(f"if regime.{rule['dimension']} == \"{rule['value']}\": position *= {rule['scale']}")
    return "\n".join(lines)


def validate(genome: dict) -> dict:
    """Normalize + sanity-check a genome (also applied to LLM output)."""
    from .features import FEATURE_GROUPS

    known = {f for feats in FEATURE_GROUPS.values() for f in feats} | {"close"}
    assert genome.get("entry"), "entry condition required"
    for cond in (genome["entry"], genome.get("exit")):
        for n in _walk(cond):
            if n["type"] == "cmp":
                assert n["feature"] in known, f"unknown feature {n['feature']}"
                assert n["op"] in OPS
                float(n["value"])
            elif n["type"] == "cross":
                assert n["a"] in known and n["b"] in known
            elif n["type"] == "flag":
                assert n["feature"] in known
            elif n["type"] in ("and", "or"):
                assert n["children"], "empty and/or"
            elif n["type"] == "not":
                assert n.get("child")
            else:
                raise AssertionError(f"unknown node type {n['type']}")
    gates = genome.get("regime_gates") or {}
    from .regimes import BUBBLE_LABELS, TREND_LABELS, VOL_LABELS

    valid_vals = {"trend": TREND_LABELS, "volatility": VOL_LABELS, "bubble": BUBBLE_LABELS}
    for dim in REGIME_DIMS:
        if gates.get(dim):
            gates[dim] = [v for v in gates[dim] if v in valid_vals[dim]]
            if not gates[dim] or len(gates[dim]) == len(valid_vals[dim]):
                gates[dim] = None
    genome["regime_gates"] = {d: gates.get(d) for d in REGIME_DIMS}
    rules = []
    for r in genome.get("position_rules") or []:
        if r.get("dimension") in REGIME_DIMS and r.get("value") in valid_vals[r["dimension"]]:
            r["scale"] = float(np.clip(float(r.get("scale", 1.0)), 0.0, 1.0))
            rules.append({"dimension": r["dimension"], "value": r["value"], "scale": r["scale"]})
    genome["position_rules"] = rules
    genome["base_position"] = float(np.clip(float(genome.get("base_position", 1.0)), 0.0, 1.0))
    assert complexity(genome) <= 40, "genome too complex"
    return genome
