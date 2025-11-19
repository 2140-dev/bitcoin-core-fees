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
EXTERNAL_FALLBACK_ENABLED = os.environ.get("EXTERNAL_FALLBACK_ENABLED", "0") == "1"
EXTERNAL_BASE_URL = os.environ.get("EXTERNAL_BASE_URL", "https://bitcoincorefeerate.com")

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

def get_block_txids(height: int) -> List[str]:
    """
    Return list of TXIDs for a given block height (excludes coinbase handling at caller).
    Uses getblock with verbosity=1 which returns txids.
    """
    block_hash = get_block_hash(height)
    block = _rpc_call("getblock", [block_hash, 1])
    return block.get("tx", []) or []

def get_block_count() -> int:
    """Get current block height (TTL cached)."""
    return _cached_call(("getblockcount", ""), 2, lambda: _rpc_call("getblockcount", []))

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

def _external_get_json(path: str, timeout: int = 10) -> Any:
    if not EXTERNAL_FALLBACK_ENABLED:
        raise Exception("External fallback disabled")
    session = _get_session()
    url = f"{EXTERNAL_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    resp = session.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.json()

def external_block_stats(count: int) -> Any:
    """
    Proxy to bitcoincorefeerate.com/block-stats/{count}/
    """
    return _external_get_json(f"block-stats/{count}/")

def external_fees_stats(count: int) -> Any:
    """
    Proxy to bitcoincorefeerate.com/fees-stats/{count}/
    """
    return _external_get_json(f"fees-stats/{count}/")

def external_fees_sum(count: int) -> Any:
    """
    Proxy to bitcoincorefeerate.com/fees-sum/{count}/
    """
    return _external_get_json(f"fees-sum/{count}/")
def _calc_feerate_sat_per_vbyte(fee_sats: Optional[int], weight: Optional[int]) -> Optional[float]:
    if fee_sats is None or weight is None or weight <= 0:
        return None
    vbytes = weight / 4.0
    if vbytes == 0:
        return None
    return fee_sats / vbytes


def get_mempool_percentile_fee_estimate(percentiles: List[int]) -> Dict[str, Any]:
    """
    Experimental mempool-based fee estimator using getblocktemplate data.
    Returns fee rates (sat/vB) for requested percentiles (by block weight).
    """
    if not percentiles:
        raise ValueError("Percentiles list cannot be empty")

    # Validate percentiles: 0 < p < 100
    cleaned_percentiles = sorted({p for p in percentiles if 0 < p < 100})
    if not cleaned_percentiles:
        raise ValueError("Percentiles must be integers between 1 and 99")

    template = get_block_template()
    txs = template.get("transactions", [])
    if not txs:
        raise Exception("Block template returned no transactions")

    # Filter to transactions with fee + weight information
    valid_txs = [
        tx for tx in txs
        if tx.get("fee") is not None and tx.get("weight") is not None and tx.get("weight") > 0
    ]
    if not valid_txs:
        raise Exception("Block template missing transaction fee/weight data")

    total_weight = sum(tx["weight"] for tx in valid_txs)
    if total_weight <= 0:
        raise Exception("Invalid total weight calculated from block template")

    percentile_targets = {
        p: (p / 100.0) * total_weight for p in cleaned_percentiles
    }

    results: Dict[int, Optional[float]] = {}
    current_percentile_index = 0
    cumulative_weight = 0

    for tx in valid_txs:
        cumulative_weight += tx["weight"]
        while (
            current_percentile_index < len(cleaned_percentiles)
            and cumulative_weight >= percentile_targets[cleaned_percentiles[current_percentile_index]]
        ):
            percentile = cleaned_percentiles[current_percentile_index]
            results[percentile] = _calc_feerate_sat_per_vbyte(tx.get("fee"), tx.get("weight"))
            current_percentile_index += 1

        if current_percentile_index >= len(cleaned_percentiles):
            break

    # Ensure every percentile has a value (fallback to last known fee rate)
    last_feerate = None
    for percentile in cleaned_percentiles:
        if percentile in results and results[percentile] is not None:
            last_feerate = results[percentile]
        else:
            results[percentile] = last_feerate

    percentiles_payload = [
        {
            "percentile": percentile,
            "feerate_sat_per_vb": results[percentile]
        }
        for percentile in cleaned_percentiles
    ]

    return {
        "template_height": template.get("height"),
        "previous_block_hash": template.get("previousblockhash"),
        "transactions_considered": len(valid_txs),
        "total_weight": total_weight,
        "weight_limit": template.get("weightlimit"),
        "percentiles": percentiles_payload,
        "generated_at": time.time(),
    }

