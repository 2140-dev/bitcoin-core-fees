"""
RPC node registry.

RpcRegistry manages a collection of RpcClient instances (one per configured
Bitcoin Core node).  _build_registry() reads rpc_config.ini and populates the
registry; the module-level `registry` proxy defers that work until the first
attribute access so tests can patch _build_registry before the app starts.
"""

import configparser
import logging
import os
from typing import Dict, List, Optional

from services.rpc_client import CHAIN_DISPLAY_NAMES, RpcClient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RpcRegistry
# ---------------------------------------------------------------------------

class RpcRegistry:
    """Registry of RpcClient instances keyed by chain name.

    Chains are stored in insertion order so the first registered chain is
    the default when no explicit chain is requested.
    """

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

    def add_client(self, chain: str, client: RpcClient) -> None:
        self._clients[chain] = client
        if self._default_chain is None:
            self._default_chain = chain

    def get_client(self, chain: Optional[str] = None) -> RpcClient:
        key = chain or self.default_chain
        if key not in self._clients:
            raise ValueError(
                f"No RPC client for chain '{key}'. Available: {list(self._clients.keys())}"
            )
        return self._clients[key]

    def available_chains(self) -> List[Dict[str, str]]:
        return [
            {"chain": chain, "chain_display": CHAIN_DISPLAY_NAMES.get(chain, chain.upper())}
            for chain in self._clients
        ]

    def chains(self) -> List[str]:
        return list(self._clients.keys())

    def __contains__(self, chain: str) -> bool:
        return chain in self._clients

    def __len__(self) -> int:
        return len(self._clients)


# ---------------------------------------------------------------------------
# Config discovery and registry construction
# ---------------------------------------------------------------------------

def _find_config(filename: str = "rpc_config.ini") -> Optional[str]:
    """Search for rpc_config.ini, walking up from the services directory."""
    if env_path := os.environ.get("RPC_CONFIG_PATH"):
        return env_path
    directory = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        candidate = os.path.join(directory, filename)
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)
        directory = os.path.dirname(directory)
    return None


def _build_registry() -> RpcRegistry:
    """Construct an RpcRegistry from [RPC.<chain>] sections in rpc_config.ini."""
    reg = RpcRegistry()
    config_path = _find_config()
    config = configparser.ConfigParser()
    if config_path:
        config.read(config_path)
        logger.debug("Loading RPC config from: %s", config_path)

    for section in config.sections():
        if not section.startswith("RPC."):
            continue
        chain_hint = section.split(".", 1)[1]
        url = config.get(section, "URL", fallback="").strip()
        user = config.get(section, "RPC_USER", fallback="").strip()
        password = config.get(section, "RPC_PASSWORD", fallback="").strip()
        if not url:
            logger.warning("Skipping [%s]: no URL configured", section)
            continue
        client = RpcClient(url, user or None, password or None)
        try:
            actual_chain = client.chain
            if chain_hint != actual_chain:
                logger.warning(
                    "[%s] config says '%s' but node reports '%s'; using '%s'",
                    section, chain_hint, actual_chain, actual_chain,
                )
            reg.add_client(actual_chain, client)
            logger.info(
                "Registered RPC client: %s (%s)",
                CHAIN_DISPLAY_NAMES.get(actual_chain, actual_chain), url,
            )
        except Exception as e:
            logger.warning("Skipping [%s] (%s): %s", section, url, e)

    if len(reg) == 0:
        raise EnvironmentError(
            "No RPC connections configured. "
            "Add [RPC.<chain>] sections to rpc_config.ini."
        )

    return reg


# ---------------------------------------------------------------------------
# Module-level singleton with lazy initialisation
# ---------------------------------------------------------------------------

# Kept as None until first access so tests can patch _build_registry.
_registry: Optional[RpcRegistry] = None


def _get_registry() -> RpcRegistry:
    global _registry
    if _registry is None:
        _registry = _build_registry()
    return _registry


class _RegistryProxy:
    """Transparent proxy that defers registry construction to first attribute access."""

    def __getattr__(self, name: str):
        return getattr(_get_registry(), name)

    def __contains__(self, item: str) -> bool:
        return item in _get_registry()

    def __len__(self) -> int:
        return len(_get_registry())


# Public singleton used by app.py, collector_service, and tests.
registry: RpcRegistry = _RegistryProxy()  # type: ignore[assignment]
