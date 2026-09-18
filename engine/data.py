"""Data layer.

Modular market-data loading (spec §4). Phase One uses yfinance with a local
CSV cache; the `load_market_data` interface stays stable so a paid data
provider can be dropped in later.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

import pandas as pd

from .config import cache_dir, load_config

COLUMNS = ["open", "high", "low", "close", "adj_close", "volume", "dividends", "stock_splits"]


def _cache_file(ticker: str) -> Path:
    return cache_dir() / f"{ticker.upper()}_daily.csv"


def _fetch_yfinance(ticker: str, start_date: str) -> pd.DataFrame:
    import yfinance as yf

    t = yf.Ticker(ticker)
    # auto_adjust=False keeps raw OHLC plus Adj Close
    df = t.history(start=start_date, auto_adjust=False, actions=True)
    if df.empty:
        raise RuntimeError(f"yfinance returned no data for {ticker}")
    df = df.rename(
        columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Adj Close": "adj_close",
            "Volume": "volume",
            "Dividends": "dividends",
            "Stock Splits": "stock_splits",
        }
    )
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df.index.name = "date"
    return df[COLUMNS].sort_index()


def load_market_data(
    ticker: str = "TSLA",
    start_date: str | None = None,
    end_date: str | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Load daily market data, using the local cache when fresh.

    refresh=True forces a re-download (used by the daily runner).
    """
    cfg = load_config()
    start_date = start_date or cfg["start_date"]
    cache = _cache_file(ticker)

    df = None
    if cache.exists() and not refresh:
        df = pd.read_csv(cache, parse_dates=["date"], index_col="date")
        # consider cache stale if last bar is older than 3 days
        if (dt.datetime.now() - df.index[-1]).days > 3:
            df = None

    if df is None:
        try:
            df = _fetch_yfinance(ticker, start_date)
            df.to_csv(cache)
        except Exception:
            if cache.exists():
                df = pd.read_csv(cache, parse_dates=["date"], index_col="date")
            else:
                raise

    if end_date:
        df = df.loc[:end_date]
    return df.loc[start_date:]
