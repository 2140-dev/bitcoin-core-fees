"""
Public RPC service API.

This module re-exports everything that app.py, collector_service, and tests
use.  Implementation details live in rpc_client.py (RpcClient) and
rpc_registry.py (RpcRegistry + config loading).

The module-level ``registry`` proxy is defined here (not imported from
rpc_registry) so that tests can patch ``services.rpc_service._get_registry``
and have the proxy resolve against that patched binding.
"""

from typing import Any, Dict, List, Optional

from services.rpc_client import CHAIN_DISPLAY_NAMES, RpcClient, _clamp_target
from services.rpc_registry import RpcRegistry, _get_registry as _build_registry

__all__ = [
    "CHAIN_DISPLAY_NAMES",
    "RpcClient",
    "RpcRegistry",
    "_clamp_target",
    "_get_registry",
    "registry",
    "get_client",
    "get_available_chains",
    "get_blockchain_info",
    "estimate_smart_fee",
    "get_mempool_feerate_diagram_analysis",
    "get_mempool_health_statistics",
    "get_performance_data",
    "calculate_local_summary",
]

# Re-exported so tests can patch ``services.rpc_service._get_registry``.
_get_registry = _build_registry


class _RegistryProxy:
    """Transparent proxy that defers registry construction to first access.

    Defined here (not imported) so that all attribute lookups go through
    ``_get_registry`` as resolved in *this* module's globals.  Tests that
    patch ``services.rpc_service._get_registry`` therefore affect the
    proxy's behaviour without needing to patch ``rpc_registry`` separately.
    """

    def __getattr__(self, name: str):
        return getattr(_get_registry(), name)

    def __contains__(self, item: str) -> bool:
        return item in _get_registry()

    def __len__(self) -> int:
        return len(_get_registry())


registry: RpcRegistry = _RegistryProxy()  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Convenience wrappers — delegate to the appropriate RpcClient
# ---------------------------------------------------------------------------

def get_client(chain: Optional[str] = None) -> RpcClient:
    return _get_registry().get_client(chain)


def get_available_chains() -> List[Dict[str, str]]:
    return registry.available_chains()


def get_blockchain_info(chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).get_blockchain_info()


def estimate_smart_fee(
    conf_target: int,
    mode: str = "unset",
    verbosity_level: int = 2,
    chain: Optional[str] = None,
) -> Dict[str, Any]:
    return get_client(chain).estimate_smart_fee(conf_target, mode, verbosity_level)


def get_mempool_feerate_diagram_analysis(chain: Optional[str] = None) -> Dict[str, Any]:
    return get_client(chain).get_mempool_feerate_diagram_analysis()


def get_mempool_health_statistics(chain: Optional[str] = None) -> List[Dict[str, Any]]:
    return get_client(chain).get_mempool_health_statistics()


def get_performance_data(
    start_height: int,
    count: int = 100,
    target: int = 2,
    chain: Optional[str] = None,
) -> Dict[str, Any]:
    return get_client(chain).get_performance_data(start_height, count, target)


def calculate_local_summary(
    target: int = 2,
    start_height: Optional[int] = None,
    chain: Optional[str] = None,
) -> Dict[str, Any]:
    return get_client(chain).calculate_local_summary(target, start_height)
