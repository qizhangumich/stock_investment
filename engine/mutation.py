"""Mutation operators (spec §10–11).

Two operator classes:
  * heuristic — deterministic parameter + structural mutations and crossover
  * LLM      — Claude rewrites the genome JSON (used when ANTHROPIC_API_KEY is
               set and llm_mutation.enabled allows it); falls back to heuristic

Every child records a human-readable mutation description for lineage.
"""
from __future__ import annotations

import copy
import json
import os
import random
import urllib.request

from .config import load_config, llm_available, llm_provider
from .features import FEATURE_GROUPS, PRICE_LEVEL_FEATURES, THRESHOLD_RANGES
from .genome import REGIME_DIMS, complexity, validate
from .regimes import BUBBLE_LABELS, TREND_LABELS, VOL_LABELS

FLAG_FEATURES = ["breakout_20", "breakout_50", "breakout_252", "volume_breakout"]
REGIME_VALUES = {"trend": TREND_LABELS, "volatility": VOL_LABELS, "bubble": BUBBLE_LABELS}


def _group_of(feature: str) -> str | None:
    for g, feats in FEATURE_GROUPS.items():
        if feature in feats:
            return g
    return None


def _random_condition(rng: random.Random) -> dict:
    kind = rng.random()
    if kind < 0.55:
        feat = rng.choice(list(THRESHOLD_RANGES.keys()))
        lo, hi = THRESHOLD_RANGES[feat]
        return {"type": "cmp", "feature": feat, "op": rng.choice(["<", ">"]), "value": round(rng.uniform(lo, hi), 4)}
    if kind < 0.85:
        a, b = rng.sample(sorted(PRICE_LEVEL_FEATURES), 2)
        return {"type": "cross", "a": a, "op": rng.choice([">", "<"]), "b": b}
    return {"type": "flag", "feature": rng.choice(FLAG_FEATURES)}


def _cmp_nodes(cond: dict | None) -> list[dict]:
    from .genome import _walk

    return [n for n in _walk(cond) if n["type"] == "cmp"]


# ------------------------------------------------------------ heuristic ops

def heuristic_mutate(genome: dict, rng: random.Random) -> tuple[dict, str, str]:
    """Return (child_genome, mutation_type, description)."""
    g = copy.deepcopy(genome)
    ops = []
    # weighted choice of operation; structural > parameter (spec §10)
    choices = [
        ("perturb_threshold", 0.30), ("swap_feature", 0.12), ("add_entry_condition", 0.14),
        ("add_exit_condition", 0.10), ("remove_condition", 0.08), ("add_regime_gate", 0.10),
        ("add_position_rule", 0.08), ("replace_exit", 0.08),
    ]
    n_ops = 1 if rng.random() < 0.7 else 2
    for _ in range(n_ops):
        op = rng.choices([c for c, _ in choices], weights=[w for _, w in choices])[0]
        desc = _apply_op(g, op, rng)
        if desc:
            ops.append(desc)
    if not ops:
        ops.append(_apply_op(g, "perturb_threshold", rng) or "no-op")
    mut_type = "parameter" if all("threshold" in o for o in ops) else "structural"
    return validate(g), mut_type, "; ".join(ops)


def _apply_op(g: dict, op: str, rng: random.Random) -> str | None:
    if op == "perturb_threshold":
        nodes = _cmp_nodes(g["entry"]) + _cmp_nodes(g.get("exit"))
        if not nodes:
            return None
        n = rng.choice(nodes)
        lo, hi = THRESHOLD_RANGES.get(n["feature"], (n["value"] * 0.5, n["value"] * 1.5 + 0.01))
        old = n["value"]
        span = (hi - lo) * rng.uniform(0.05, 0.25) * rng.choice([-1, 1])
        n["value"] = round(min(hi, max(lo, float(old) + span)), 4)
        return f"changed {n['feature']} threshold {round(float(old), 4)} -> {n['value']}"

    if op == "swap_feature":
        nodes = _cmp_nodes(g["entry"]) + _cmp_nodes(g.get("exit"))
        candidates = [n for n in nodes if _group_of(n["feature"]) and n["feature"] in THRESHOLD_RANGES]
        if not candidates:
            return None
        n = rng.choice(candidates)
        group = _group_of(n["feature"])
        alts = [f for f in FEATURE_GROUPS[group] if f != n["feature"] and f in THRESHOLD_RANGES]
        if not alts:
            return None
        old = n["feature"]
        n["feature"] = rng.choice(alts)
        lo, hi = THRESHOLD_RANGES[n["feature"]]
        n["value"] = round(rng.uniform(lo, hi), 4)
        return f"swapped indicator {old} -> {n['feature']}"

    if op in ("add_entry_condition", "add_exit_condition"):
        key = "entry" if op == "add_entry_condition" else "exit"
        new = _random_condition(rng)
        cur = g.get(key)
        if cur is None:
            g[key] = new
            return f"added {key} rule: {_short(new)}"
        combinator = "and" if key == "entry" else "or"
        if cur.get("type") == combinator:
            if len(cur["children"]) >= 4:
                return None
            cur["children"].append(new)
        else:
            g[key] = {"type": combinator, "children": [cur, new]}
        return f"added {key} filter: {_short(new)}"

    if op == "remove_condition":
        for key in ("entry", "exit"):
            cur = g.get(key)
            if cur and cur.get("type") in ("and", "or") and len(cur["children"]) > 1:
                removed = cur["children"].pop(rng.randrange(len(cur["children"])))
                if len(cur["children"]) == 1:
                    g[key] = cur["children"][0]
                return f"removed {key} condition: {_short(removed)}"
        return None

    if op == "add_regime_gate":
        dim = rng.choice(REGIME_DIMS)
        vals = REGIME_VALUES[dim]
        allowed = rng.sample(vals, rng.choice([1, 2]))
        g.setdefault("regime_gates", {})[dim] = allowed
        return f"restricted to {dim} regimes {allowed}"

    if op == "add_position_rule":
        dim = rng.choice(["volatility", "bubble"])
        val = rng.choice(REGIME_VALUES[dim][-2:])
        scale = round(rng.uniform(0.3, 0.7), 2)
        rules = [r for r in g.get("position_rules") or [] if not (r["dimension"] == dim and r["value"] == val)]
        rules.append({"dimension": dim, "value": val, "scale": scale})
        g["position_rules"] = rules
        return f"reduce exposure to {int(scale*100)}% during {val}"

    if op == "replace_exit":
        new = _random_condition(rng)
        g["exit"] = new
        return f"replaced exit rule with: {_short(new)}"
    return None


def _short(node: dict) -> str:
    from .genome import _render_cond

    return _render_cond(node)


def crossover(a: dict, b: dict, rng: random.Random) -> tuple[dict, str]:
    """Combine two parents (spec §11)."""
    child = copy.deepcopy(a)
    style = rng.choice(["entry_exit", "and_entries", "or_entries", "gates_and_rules"])
    if style == "entry_exit":
        child["exit"] = copy.deepcopy(b.get("exit"))
        desc = f"entry from {a['name']}, exit from {b['name']}"
    elif style == "and_entries":
        child["entry"] = {"type": "and", "children": [copy.deepcopy(a["entry"]), copy.deepcopy(b["entry"])]}
        desc = f"entry = {a['name']} AND {b['name']}"
    elif style == "or_entries":
        child["entry"] = {"type": "or", "children": [copy.deepcopy(a["entry"]), copy.deepcopy(b["entry"])]}
        child["exit"] = copy.deepcopy(b.get("exit") or a.get("exit"))
        desc = f"entry = {a['name']} OR {b['name']}"
    else:
        child["regime_gates"] = copy.deepcopy(b.get("regime_gates") or {})
        child["position_rules"] = copy.deepcopy(b.get("position_rules") or [])
        desc = f"logic of {a['name']} with risk overlay of {b['name']}"
    if a["family"] != b["family"]:
        child["family"] = "hybrid"
    if complexity(child) > 30:
        return crossover(a, b, rng) if style != "entry_exit" else (validate(child), desc)
    return validate(child), desc


# ------------------------------------------------------------ LLM mutation

LLM_SYSTEM = """You are the mutation operator inside an AlphaEvolve-style evolutionary system
that evolves TSLA long/cash trading strategies. You will receive one strategy genome as JSON
plus its recent performance. Produce ONE improved variant.

Rules:
- Reply with ONLY the mutated genome JSON (no markdown, no commentary) plus a top-level key
  "mutation_description" (short, human-readable list of what you changed and why).
- Keep the same JSON schema. Allowed condition node types: cmp, cross, flag, and, or, not.
- Only use features that already appear in the FEATURES list given to you.
- Prefer structural improvements (regime gates, volatility position rules, better exits)
  over tiny threshold tweaks. Keep strategies simple: complexity budget ~15 nodes.
- Positions are long/cash only: base_position and scales within [0, 1]."""


def llm_mutate(genome: dict, perf_summary: str) -> tuple[dict, str, str] | None:
    """Ask Claude for a mutated genome. Returns None on any failure."""
    if not llm_available():
        return None
    cfg = load_config()["llm_mutation"]
    feats = [f for feats in FEATURE_GROUPS.values() for f in feats]
    user = (
        f"FEATURES: {', '.join(feats)}\n\n"
        f"REGIME VALUES: {json.dumps(REGIME_VALUES)}\n\n"
        f"CURRENT GENOME:\n{json.dumps({k: genome[k] for k in ('name','family','entry','exit','regime_gates','position_rules','base_position')}, indent=1)}\n\n"
        f"PERFORMANCE (train/walk-forward only — no hidden-test data):\n{perf_summary}\n\n"
        "Return the improved genome JSON now."
    )
    if llm_provider() == "openai":
        body = json.dumps(
            {
                "model": cfg["model"],
                "max_completion_tokens": 4000,
                "messages": [
                    {"role": "system", "content": LLM_SYSTEM},
                    {"role": "user", "content": user},
                ],
            }
        ).encode()
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                "content-type": "application/json",
            },
        )
    else:
        body = json.dumps(
            {
                "model": cfg["model"],
                "max_tokens": 2000,
                "system": LLM_SYSTEM,
                "messages": [{"role": "user", "content": user}],
            }
        ).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        if llm_provider() == "openai":
            text = data["choices"][0]["message"]["content"] or ""
        else:
            text = "".join(b.get("text", "") for b in data.get("content", []))
        start, end = text.find("{"), text.rfind("}")
        child = json.loads(text[start : end + 1])
        desc = child.pop("mutation_description", "LLM rewrite")
        for key in ("name", "family"):
            child.setdefault(key, genome[key])
        child = validate(child)
        return child, "llm", str(desc)
    except Exception:
        return None
