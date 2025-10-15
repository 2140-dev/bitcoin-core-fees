import configparser
import json
import os
import time
import threading
import requests
from typing import Any, Dict, List, Optional, Tuple

Config = configparser.ConfigParser()
Config.read("rpc_config.ini")

URL = os.environ.get("RPC_URL") or Config.get("RPC_INFO", "URL")
RPCUSER = os.environ.get("RPC_USER") or Config.get("RPC_INFO", "RPC_USER")
RPCPASSWORD = os.environ.get("RPC_PASSWORD") or Config.get("RPC_INFO", "RPC_PASSWORD")

DEFAULT_TIMEOUT_SECONDS = 15
MAX_RETRIES = 3

_session_lock = threading.Lock()
_session: Optional[requests.Session] = None

# Simple TTL cache for hot endpoints
_cache: Dict[Tuple[str, str], Tuple[float, Any]] = {}

def _get_session() -> requests.Session:
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                _session = requests.Session()
                _session.headers.update({
                    'content-type': "application/json",
                    'cache-control': "no-cache"
                })
    return _session

def _btc_per_kvb_to_sat_per_vb(btc_per_kvb: Optional[float]) -> Optional[float]:
    if btc_per_kvb is None:
        return None
    # 1 BTC = 1e8 sat; 1 kB = 1000 vB
    # sat/vB = BTC/kB * 1e8 / 1000
    return (btc_per_kvb * 100_000_000.0) / 1000.0

def _json_payload(method: str, params: List[Any]) -> str:
    return json.dumps({"method": method, "params": params, "id": 1})

def _rpc_call(method: str, params: List[Any], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> Any:
    """
    Make a JSON-RPC request to Bitcoin Core with basic exponential backoff.
    """
    if not URL:
        raise Exception("RPC URL not configured. Set RPC_URL env or rpc_config.ini")

    payload = _json_payload(method, params)
    auth = (RPCUSER, RPCPASSWORD) if RPCUSER or RPCPASSWORD else None
    session = _get_session()

    attempt = 0
    delay = 1.0
    while True:
        try:
            response = session.post(URL, data=payload, auth=auth, timeout=timeout)
            response.raise_for_status()
            data = response.json()
            if data.get("error") is not None:
                raise Exception(f"RPC Error: {data['error']}")
            return data.get("result")
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            attempt += 1
            if attempt >= MAX_RETRIES:
                raise Exception(f"Connection error after {attempt} attempts: {e}")
            time.sleep(delay)
            delay *= 2
        except requests.exceptions.RequestException as e:
            # Non-retryable HTTP errors
            raise Exception(f"HTTP error: {e}")
        except json.JSONDecodeError as e:
            raise Exception(f"JSON decode error: {e}")

def _cached_call(cache_key: Tuple[str, str], ttl_seconds: int, fn):
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[0]) < ttl_seconds:
        return cached[1]
    value = fn()
    _cache[cache_key] = (now, value)
    return value

# Bitcoin Core RPC Methods
def get_mempool_info() -> Dict[str, Any]:
    """Get mempool information (TTL cached)."""
    return _cached_call(("getmempoolinfo", ""), 2, lambda: _rpc_call("getmempoolinfo", []))

def get_blockchain_info() -> Dict[str, Any]:
    """Get blockchain information (TTL cached)."""
    return _cached_call(("getblockchaininfo", ""), 2, lambda: _rpc_call("getblockchaininfo", []))

def get_block_stats(height: int, stats: Optional[List[str]] = None) -> Dict[str, Any]:
    """Get block statistics for a specific height."""
    if stats is None:
        stats = [
            "height", "time", "avgfee", "avgfeerate", "avgtxsize", "blockhash",
            "feerate_percentiles", "ins", "maxfee", "maxfeerate", "maxtxsize",
            "medianfee", "mediantime", "mediantxsize", "minfee", "minfeerate",
            "mintxsize", "outs", "subsidy", "swtotal_size", "swtotal_weight",
            "swtxs", "total_out", "total_size", "total_weight", "totalfee", "txs"
        ]
    return _rpc_call("getblockstats", [height, stats])

def estimate_smart_fee(conf_target: int, mode: str = "economical", block_policy_only: bool = False, verbosity_level: int = 1) -> Dict[str, Any]:
    """Wrapper for Bitcoin Core estimatesmartfee (raw result)."""
    return _rpc_call("estimatesmartfee", [conf_target, mode, block_policy_only, verbosity_level])

def get_estimated_fee_rate_satvb(conf_target: int, mode: str = "economical", block_policy_only: bool = False, verbosity_level: int = 1) -> Dict[str, Any]:
    """
    Estimate smart fee and normalize to sat/vB for downstream consumers.
    Returns { 'feerate_sat_per_vb': Optional[float], 'blocks': Optional[int], 'errors': Optional[List[str]] }
    """
    raw = estimate_smart_fee(conf_target=conf_target, mode=mode, block_policy_only=block_policy_only, verbosity_level=verbosity_level)
    btc_per_kvb = raw.get("feerate")
    blocks = raw.get("blocks")
    errors = raw.get("errors")
    sat_per_vb = _btc_per_kvb_to_sat_per_vb(btc_per_kvb) if btc_per_kvb is not None else None
    return {
        "feerate_sat_per_vb": sat_per_vb,
        "blocks": blocks,
        "errors": errors,
    }

def get_raw_mempool(verbose: bool = False) -> Any:
    """Get raw mempool (can be heavy if verbose=True)."""
    return _rpc_call("getrawmempool", [verbose])

def get_best_block_hash() -> str:
    """Get best block hash (TTL cached)."""
    return _cached_call(("getbestblockhash", ""), 2, lambda: _rpc_call("getbestblockhash", []))

def get_block_hash(height: int) -> str:
    """Get block hash by height."""
    return _rpc_call("getblockhash", [height])

def get_block_count() -> int:
    """Get current block height (TTL cached)."""
    return _cached_call(("getblockcount", ""), 2, lambda: _rpc_call("getblockcount", []))

def get_block_stats(height: int, stats: Optional[List[str]] = None) -> Dict[str, Any]:
    """Get block statistics for a specific height."""
    # We use a comprehensive list of stats for collector
    if stats is None:
        stats = ["height", "minfeerate", "maxfeerate", "avgfeerate", "txs"]
    return _rpc_call("getblockstats", [height, stats])

# ... (other RPC methods) ...

def get_raw_mempool(verbose: bool = False) -> Any:
    """Get raw mempool (can be heavy if verbose=True)."""
    return _rpc_call("getrawmempool", [verbose])

def get_block_template() -> Dict[str, Any]:
    """
    NEW: Get a block template. Critical for advanced fee estimation.
    NOTE: This requires the node to be run with `-blocksonly=0` and potentially have mining enabled.
    """
    # Use empty template request for minimal overhead
    return _rpc_call("getblocktemplate", [{"mode": "template"}])

# --- Convenience helpers for collector ---
def get_block_tx_details(height: int) -> Dict[str, Any]:
    """
    Return a simplified view of transaction feerate details for a block height.
    Keys:
      - height: int
      - min_fee: float (sat/vB)
      - max_fee: float (sat/vB)
      - avg_feerate: float (sat/vB)
      - percentiles: [p10, p25, p50, p75, p90] (sat/vB)
    """
    stats = get_block_stats(height)
    return {
        "height": stats.get("height", height),
        "min_fee": stats.get("minfeerate"),
        "max_fee": stats.get("maxfeerate"),
        "avg_feerate": stats.get("avgfeerate"),
        "percentiles": stats.get("feerate_percentiles"),
    }

