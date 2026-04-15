import os
import sys
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))


def _make_mock_registry():
    """Create a mock registry that claims to have only 'main' chain."""
    reg = MagicMock()
    reg.chains.return_value = ["main"]
    reg.available_chains.return_value = [{"chain": "main", "chain_display": "MAINNET"}]
    reg.__contains__ = lambda self, x: x == "main"
    reg.__len__ = lambda self: 1
    return reg


def make_app():
    """Create a Flask test app with all side effects patched out.

    The _get_registry patch is kept active after this function returns by
    directly setting the module-level _registry singleton to the mock.
    Routes that call rpc_service.registry during request handling (e.g.
    _resolve_chain) will see the mock registry rather than attempting to
    build a real one from rpc_config.ini.
    """
    import services.rpc_service as rpc_service_module

    mock_reg = _make_mock_registry()

    # Assign directly to the module-level singleton so _get_registry() finds
    # a non-None value and returns mock_reg on every call, including calls
    # that happen after this function returns (i.e. during actual test requests).
    rpc_service_module._registry = mock_reg

    with patch('services.database_service.init_db', return_value=None), \
         patch('services.collector_service.start_background_collectors', return_value=None):
        from app import create_app
        app = create_app()
        app.config['TESTING'] = True
        app.config['RATELIMIT_ENABLED'] = False
        return app
