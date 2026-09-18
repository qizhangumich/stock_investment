"""Central configuration loader."""
from __future__ import annotations

import os
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.yaml"

_cfg = None


def load_config() -> dict:
    global _cfg
    if _cfg is None:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            _cfg = yaml.safe_load(f)
    return _cfg


def db_path() -> Path:
    cfg = load_config()
    p = PROJECT_ROOT / cfg["database"]["path"]
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def cache_dir() -> Path:
    cfg = load_config()
    p = PROJECT_ROOT / cfg["data"]["cache_dir"]
    p.mkdir(parents=True, exist_ok=True)
    return p


PROVIDER_ENV_VARS = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}


def llm_provider() -> str:
    return load_config()["llm_mutation"].get("provider", "anthropic")


def llm_available() -> bool:
    cfg = load_config()["llm_mutation"]
    if cfg["enabled"] is False:
        return False
    if cfg["enabled"] is True or cfg["enabled"] == "auto":
        env_var = PROVIDER_ENV_VARS.get(llm_provider())
        return bool(env_var and os.environ.get(env_var))
    return False
