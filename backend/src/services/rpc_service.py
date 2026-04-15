import configparser
import itertools
import json
import os
import logging
from typing import Any, Dict, List, Optional
from functools import lru_cache

import requests

logger = logging.getLogger("rpc_service")

CHAIN_DISPLAY_NAMES = {
    "main": "MAINNET", "test": "TESTNET", "testnet4": "TESTNET4",
    "signet": "SIGNET", "regtest": "REGTEST",
}

DEFAULT_TIMEOUT_SECONDS = 30

# Shared counter across all clients for JSON-RPC IDs
_rpc_id_counter = itertools.count(1)


def _clamp_target(target: int) -> int:
    """Bitcoin Core treats targets <= 1 the same as 2."""
    return max(2, target)


# ---------------------------------------------------------------------------
# RpcClient — one instance per Bitcoin Core node
# ---------------------------------------------------------------------------

class RpcClient:
    """Stateful RPC connection to a single Bitcoin Core node."""

    def __init__(self, url: str, user: Optional[str] = None, password: Optional[str] = None):
        self._url = url
        self._user = user
        self._password = password
        self._session = requests.Session()
        self._chain: Optional[str] = None

    @property
    def chain(self) -> str:
        if self._chain is None:
            info = self.get_blockchain_info()
            self._chain = info["chain"]
        return self._chain

    @property
    def chain_display(self) -> str:
        return CHAIN_DISPLAY_NAMES.get(self.chain, self.chain.upper())

    def rpc_call(self, method: str, params: List[Any]) -> Any:
        payload = json.dumps({
            "method": method,
            "params": params,
            "id": next(_rpc_id_counter),
        })
        auth = (self._user, self._password) if (self._user or self._password) else None
        try:
            response = self._session.post(
                self._url, data=payload, auth=auth, timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            data = response.json()
            if data.get("error"):
                raise RuntimeError(f"RPC Error ({method}): {data['error']}")
            return data.get("result")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"RPC call '{method}' failed: {type(e).__name__}") from e

    def get_block_count(self) -> int:
        return self.rpc_call("getblockcount", [])

    def get_blockchain_info(self) -> Dict[str, Any]:
        result = self.rpc_call("getblockchaininfo", [])
        if not result:
            raise RuntimeError("getblockchaininfo returned empty result — cannot determine chain")
        chain = result.get("chain", "main")
        blocks = result.get("blocks", self.get_block_count())
        display = CHAIN_DISPLAY_NAMES.get(chain, chain.upper())
        return {"chain": chain, "chain_display": display, "blockcount": blocks}

    def estimate_smart_fee(self, conf_target: int, mode: str = "unset", verbosity_level: int = 2) -> Dict[str, Any]:
        effective_target = _clamp_target(conf_target)
        result = self.rpc_call("estimatesmartfee", [effective_target, mode, verbosity_level])
        if result and "feerate" in result:
            # feerate is BTC/kvB → sat/vB: ×100_000_000 sat/BTC ÷ 1000 vB/kvB = ×100_000
            result["feerate_sat_per_vb"] = result["feerate"] * 100_000

        if result is not None:
            result["chain"] = self.chain

        return result

    def get_mempool_health_statistics(self) -> List[Dict[str, Any]]:
        current_height = self.get_block_count()
        stats = []
        mempool_diagram = self.rpc_call("getmempoolfeeratediagram", [])
        total_mempool_weight = mempool_diagram[-1]["weight"] if mempool_diagram else 0

        for h in range(current_height - 4, current_height + 1):
            try:
                b = self.get_single_block_stats(h)
                weight = b.get("total_weight", 0)
                stats.append({
                    "block_height": h,
                    "block_weight": weight,
                    "mempool_txs_weight": total_mempool_weight,
                    "ratio": min(1.0, total_mempool_weight / 4_000_000),
                })
            except Exception:
                continue
        return stats

    @lru_cache(maxsize=2000)
    def _get_single_block_stats_cached(self, height: int) -> str:
        result = self.rpc_call("getblockstats", [
            height, ["height", "feerate_percentiles", "minfeerate", "maxfeerate", "total_weight"],
        ])
        return json.dumps(result)

    def get_single_block_stats(self, height: int) -> Dict[str, Any]:
        return json.loads(self._get_single_block_stats_cached(height))

    def get_mempool_feerate_diagram_analysis(self) -> Dict[str, Any]:
        raw_points = self.rpc_call("getmempoolfeeratediagram", [])
        if not raw_points:
            return {"raw": [], "windows": {}}

        BLOCK_WEIGHT = 4_000_000
        max_weight = raw_points[-1]["weight"]

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
            "1": _window_percentiles(BLOCK_WEIGHT),
            "2": _window_percentiles(BLOCK_WEIGHT * 2),
            "3": _window_percentiles(BLOCK_WEIGHT * 3),
            "all": _window_percentiles(max_weight),
        }

        return {
            "raw": raw_points,
            "windows": windows,
            "total_weight": max_weight,
            "total_fee": raw_points[-1]["fee"],
        }

    def get_performance_data(self, start_height: int, count: int = 100, target: int = 2) -> Dict[str, Any]:
        import services.database_service as db_service

        effective_target = _clamp_target(target)
        db_rows = db_service.get_estimates_in_range(
            start_height, start_height + count, effective_target, chain=self.chain,
        )

        latest_estimates_map = {row["poll_height"]: row["estimate_feerate"] for row in db_rows}
        estimates = [{"height": h, "rate": latest_estimates_map[h]} for h in sorted(latest_estimates_map)]

        blocks = []
        for h in range(start_height, start_height + count):
            try:
                b = self.get_single_block_stats(h)
                p = b.get("feerate_percentiles", [0, 0, 0, 0, 0])
                blocks.append({"height": h, "low": p[0], "high": p[4]})
            except Exception:
                logger.debug(f"Skipping block stats for height {h} — RPC unavailable")
                continue

        return {"blocks": blocks, "estimates": estimates}

    def calculate_local_summary(self, target: int = 2, start_height: Optional[int] = None) -> Dict[str, Any]:
        import services.database_service as db_service

        effective_target = _clamp_target(target)
        current_h = self.get_block_count()
        start_h = start_height if start_height is not None else current_h - 1000
        db_rows = db_service.get_estimates_in_range(
            start_h, current_h, effective_target, chain=self.chain,
        )

        total = over = under = within = 0

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
                    b = self.get_single_block_stats(h)
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


# ---------------------------------------------------------------------------
# RpcRegistry — loads config, creates one RpcClient per [RPC.<chain>] section
# ---------------------------------------------------------------------------

def _find_config(filename: str = "rpc_config.ini") -> Optional[str]:
    if env_path := os.environ.get("RPC_CONFIG_PATH"):
        return env_path
    directory = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        candidate = os.path.join(directory, filename)
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)
        directory = os.path.dirname(directory)
    return None


class RpcRegistry:
    """Registry of RpcClient instances keyed by chain name."""

    def __init__(self):
        self._clients: Dict[str, RpcClient] = {}
        self._default_chain: Optional[str] = None

    @property
    def default_chain(self) -> str:
        if self._default_chain:
            return self._default_chain
        if self._clients:
            return next(iter(self._clients))
        raise RuntimeError("No RPC clients configured")

    def add_client(self, chain: str, client: RpcClient):
        self._clients[chain] = client
        if self._default_chain is None:
            self._default_chain = chain

    def get_client(self, chain: Optional[str] = None) -> RpcClient:
        key = chain or self.default_chain
        if key not in self._clients:
            raise ValueError(f"No RPC client for chain '{key}'. Available: {list(self._clients.keys())}")
        return self._clients[key]

    def available_chains(self) -> List[Dict[str, str]]:
        result = []
        for chain, client in self._clients.items():
            display = CHAIN_DISPLAY_NAMES.get(chain, chain.upper())
            result.append({"chain": chain, "chain_display": display})
        return result

    def chains(self) -> List[str]:
        return list(self._clients.keys())

    def __contains__(self, chain: str) -> bool:
        return chain in self._clients

    def __len__(self) -> int:
        return len(self._clients)


def _build_registry() -> RpcRegistry:
    """Build the registry from config file and/or environment variables."""
    registry = RpcRegistry()
    config_path = _find_config()
    config = configparser.ConfigParser()
    if config_path:
        config.read(config_path)
        logger.debug(f"Loading RPC config from: {config_path}")

    # New multi-section format: [RPC.main], [RPC.test], etc.
    for section in config.sections():
        if section.startswith("RPC."):
            chain_hint = section.split(".", 1)[1]
            url = config.get(section, "URL", fallback="").strip()
            user = config.get(section, "RPC_USER", fallback="").strip()
            password = config.get(section, "RPC_PASSWORD", fallback="").strip()
            if not url:
                logger.warning(f"Skipping [{section}]: no URL configured")
                continue
            client = RpcClient(url, user or None, password or None)
            try:
                actual_chain = client.chain
                if chain_hint != actual_chain:
                    logger.warning(
                        f"[{section}] config says '{chain_hint}' but node reports '{actual_chain}'; using '{actual_chain}'"
                    )
                registry.add_client(actual_chain, client)
                logger.info(f"Registered RPC client: {CHAIN_DISPLAY_NAMES.get(actual_chain, actual_chain)} ({url})")
            except Exception as e:
                logger.warning(f"Skipping [{section}] ({url}): {e}")

    if len(registry) == 0:
        raise EnvironmentError(
            "No RPC connections configured. "
            "Add [RPC.<chain>] sections to rpc_config.ini."
        )

    return registry


# Module-level singleton — lazy so tests can patch _build_registry before first access
_registry: Optional[RpcRegistry] = None


def _get_registry() -> RpcRegistry:
    global _registry
    if _registry is None:
        _registry = _build_registry()
    return _registry


# Public alias for direct access (e.g. registry.chains())
class _RegistryProxy:
    """Proxy that defers registry creation until first attribute access."""
    def __getattr__(self, name):
        return getattr(_get_registry(), name)
    def __contains__(self, item):
        return item in _get_registry()
    def __len__(self):
        return len(_get_registry())

registry = _RegistryProxy()


# ---------------------------------------------------------------------------
# Convenience functions — delegate to default or specified client
# ---------------------------------------------------------------------------

def get_client(chain: Optional[str] = None) -> RpcClient:
    return _get_registry().get_client(chain)


def get_current_chain() -> str:
    return registry.default_chain


def get_available_chains() -> List[Dict[str, str]]:
    return registry.available_chains()


def get_block_count(chain: Optional[str] = None) -> int:
    return get_client(chain).get_block_count()


def get_blockchain_info(chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).get_blockchain_info()


def estimate_smart_fee(conf_target: int, mode: str = "unset", verbosity_level: int = 2, chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).estimate_smart_fee(conf_target, mode, verbosity_level)


def get_mempool_feerate_diagram_analysis(chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).get_mempool_feerate_diagram_analysis()


def get_mempool_health_statistics(chain: Optional[str] = None) -> List[Dict[str, Any]]:
    return get_client(chain).get_mempool_health_statistics()


def get_performance_data(start_height: int, count: int = 100, target: int = 2, chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).get_performance_data(start_height, count, target)


def calculate_local_summary(target: int = 2, start_height: Optional[int] = None, chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).calculate_local_summary(target, start_height)
