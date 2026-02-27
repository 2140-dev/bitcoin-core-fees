import configparser
import itertools
import json
import os
import logging
from typing import Any, Dict, List, Optional
from functools import lru_cache

import requests

logger = logging.getLogger("rpc_service")

# ---------------------------------------------------------------------------
# Config — walk up from this file's directory until rpc_config.ini is found,
# or use the RPC_CONFIG_PATH env var to set it explicitly.
# ---------------------------------------------------------------------------
def _find_config(filename: str = "rpc_config.ini") -> Optional[str]:
    if env_path := os.environ.get("RPC_CONFIG_PATH"):
        return env_path
    directory = os.path.dirname(os.path.abspath(__file__))
    # Walk up a maximum of 5 levels to find the config file
    for _ in range(5):
        candidate = os.path.join(directory, filename)
        if os.path.isfile(candidate):
            return candidate
        directory = os.path.dirname(directory)
    return None

_CONFIG_PATH = _find_config()
if _CONFIG_PATH:
    logger.debug(f"Loading RPC config from: {_CONFIG_PATH}")
else:
    logger.warning("rpc_config.ini not found — relying solely on environment variables.")

_config = configparser.ConfigParser()
if _CONFIG_PATH:
    _config.read(_CONFIG_PATH)

def _get_config_val(section: str, option: str, default: Optional[str] = None) -> Optional[str]:
    try:
        return _config.get(section, option)
    except (configparser.NoSectionError, configparser.NoOptionError):
        return default


# ---------------------------------------------------------------------------
# Credentials — private, validated eagerly at import time
# ---------------------------------------------------------------------------
_URL = os.environ.get("RPC_URL") or _get_config_val("RPC_INFO", "URL")
_RPCUSER = os.environ.get("RPC_USER") or _get_config_val("RPC_INFO", "RPC_USER")
_RPCPASSWORD = os.environ.get("RPC_PASSWORD") or _get_config_val("RPC_INFO", "RPC_PASSWORD")

if not _URL:
    raise EnvironmentError(
        "Bitcoin RPC URL is not configured. "
        "Set the RPC_URL environment variable or add URL under [RPC_INFO] in rpc_config.ini."
    )

DEFAULT_TIMEOUT_SECONDS = 30

# Reuse TCP connection across all RPC calls
_session = requests.Session()

# Monotonically increasing JSON-RPC request IDs
_rpc_id_counter = itertools.count(1)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clamp_target(target: int) -> int:
    """Bitcoin Core treats targets ≤ 1 the same as 2."""
    return max(2, target)


def _rpc_call(method: str, params: List[Any]) -> Any:
    payload = json.dumps({
        "method": method,
        "params": params,
        "id": next(_rpc_id_counter),
    })
    auth = (_RPCUSER, _RPCPASSWORD) if (_RPCUSER or _RPCPASSWORD) else None
    try:
        response = _session.post(_URL, data=payload, auth=auth, timeout=DEFAULT_TIMEOUT_SECONDS)
        data = response.json()
        if data.get("error"):
            raise RuntimeError(f"RPC Error ({method}): {data['error']}")
        return data.get("result")
    except RuntimeError:
        raise
    except Exception as e:
        # Wrap transport-level errors without re-logging — callers decide log level
        raise RuntimeError(f"RPC call '{method}' failed: {type(e).__name__}") from e


# ---------------------------------------------------------------------------
# Block stats — cached, returns a copy to prevent cache corruption
# ---------------------------------------------------------------------------

@lru_cache(maxsize=2000)
def _get_single_block_stats_cached(height: int) -> tuple:
    """
    Returns a frozen (JSON-serialised) snapshot so the lru_cache holds
    immutable data. Use get_single_block_stats() for normal access.
    """
    result = _rpc_call("getblockstats", [height, ["height", "feerate_percentiles", "minfeerate", "maxfeerate"]])
    return json.dumps(result)  # freeze as string


def get_single_block_stats(height: int) -> Dict[str, Any]:
    """Returns a fresh dict each call — safe to mutate without corrupting the cache."""
    return json.loads(_get_single_block_stats_cached(height))


# ---------------------------------------------------------------------------
# Public RPC wrappers
# ---------------------------------------------------------------------------

def get_block_count() -> int:
    return _rpc_call("getblockcount", [])


def estimate_smart_fee(conf_target: int, mode: str = "unset", verbosity_level: int = 2) -> Dict[str, Any]:
    effective_target = _clamp_target(conf_target)
    result = _rpc_call("estimatesmartfee", [effective_target, mode, verbosity_level])
    if result and "feerate" in result:
        # feerate is BTC/kVB → sat/vB: × 1e8 (BTC→sat) ÷ 1e3 (kVB→vB) = × 1e5
        result["feerate_sat_per_vb"] = result["feerate"] * 100_000
    return result


def get_mempool_feerate_diagram_analysis() -> Dict[str, Any]:
    raw_points = _rpc_call("getmempoolfeeratediagram", [])
    if not raw_points:
        return {"raw": [], "windows": {}}

    # Weight of a standard full block in weight units
    BLOCK_WEIGHT = 4_000_000
    max_weight = raw_points[-1]["weight"]

    # Pre-calculate per-segment feerates
    # Conversion: (fee_BTC / weight_WU) × 4e8 = sat/vB
    # (1 vB = 4 WU; 1 BTC = 1e8 sat → factor = 1e8 / 4 = 25_000_000... but
    #  raw_points["fee"] is in BTC and weight in WU, so sat/vB = fee/weight × 4e8 / 4
    #  = fee/weight × 1e8 — however Bitcoin Core actually returns fee in BTC and weight
    #  in WU where 1 vB = 4 WU, so sat/vB = (fee_BTC × 1e8) / (weight_WU / 4)
    #  = fee_BTC × 4e8 / weight_WU. Factor 400_000_000 is correct.)
    segments = []
    for i, p in enumerate(raw_points):
        if i == 0:
            fr = (p["fee"] / p["weight"]) * 400_000_000 if p["weight"] > 0 else 0
        else:
            prev = raw_points[i - 1]
            dw = p["weight"] - prev["weight"]
            df = p["fee"] - prev["fee"]
            fr = (df / dw) * 400_000_000 if dw > 0 else 0
        segments.append({"w": p["weight"], "fr": fr})

    def _feerate_at_weight(w_target: float) -> float:
        for seg in segments:
            if seg["w"] >= w_target:
                return seg["fr"]
        return segments[-1]["fr"] if segments else 0

    def _window_percentiles(weight_limit: int) -> Dict[str, float]:
        actual_limit = min(weight_limit, max_weight)
        return {
            str(int(p * 100)): _feerate_at_weight(p * actual_limit)
            for p in (0.05, 0.25, 0.50, 0.75, 0.95)
        }

    windows = {
        "1":   _window_percentiles(BLOCK_WEIGHT),
        "2":   _window_percentiles(BLOCK_WEIGHT * 2),
        "3":   _window_percentiles(BLOCK_WEIGHT * 3),
        "all": _window_percentiles(max_weight),
    }

    return {
        "raw": raw_points,
        "windows": windows,
        "total_weight": max_weight,
        "total_fee": raw_points[-1]["fee"],
    }


# ---------------------------------------------------------------------------
# Performance / summary logic
# ---------------------------------------------------------------------------

def get_performance_data(start_height: int, count: int = 100, target: int = 2) -> Dict[str, Any]:
    import services.database_service as db_service  # late import — breaks circular dep

    effective_target = _clamp_target(target)
    db_rows = db_service.get_estimates_in_range(start_height, start_height + count, effective_target)

    # Deduplicate to latest estimate per height (dict preserves insertion order in Py3.7+)
    latest_estimates_map = {row["poll_height"]: row["estimate_feerate"] for row in db_rows}
    estimates = [{"height": h, "rate": latest_estimates_map[h]} for h in sorted(latest_estimates_map)]

    blocks = []
    for h in range(start_height, start_height + count):
        try:
            b = get_single_block_stats(h)
            p = b.get("feerate_percentiles", [0, 0, 0, 0, 0])
            blocks.append({"height": h, "low": p[0], "high": p[4]})
        except Exception:
            logger.debug(f"Skipping block stats for height {h} — RPC unavailable")
            continue

    return {"blocks": blocks, "estimates": estimates}


def calculate_local_summary(target: int = 2) -> Dict[str, Any]:
    import services.database_service as db_service  # late import — breaks circular dep

    effective_target = _clamp_target(target)
    current_h = get_block_count()

    db_rows = db_service.get_estimates_in_range(current_h - 1000, current_h, effective_target)

    total = 0
    over = 0
    under = 0
    within = 0

    for row in db_rows:
        poll_h = row["poll_height"]
        target_val = row["target"]
        est = row["estimate_feerate"]
        window_end = poll_h + target_val

        if window_end > current_h:
            continue

        total += 1
        is_under = True
        is_over = False

        for h in range(poll_h + 1, window_end + 1):
            try:
                b = get_single_block_stats(h)
                p = b.get("feerate_percentiles", [0, 0, 0, 0, 0])
                if est >= p[0]:
                    is_under = False
                if est > p[4]:
                    is_over = True
            except Exception:
                logger.debug(f"Skipping block {h} in summary calculation — RPC unavailable")
                continue

        if is_under:
            under += 1
        elif is_over:
            over += 1
        else:
            within += 1

    return {
        "total": total,
        "within_val": within,
        "within_perc": within / total if total > 0 else 0,
        "overpayment_val": over,
        "overpayment_perc": over / total if total > 0 else 0,
        "underpayment_val": under,
        "underpayment_perc": under / total if total > 0 else 0,
    }
