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
    """Create a Flask test app with all side effects patched out."""
    mock_reg = _make_mock_registry()

    with patch('services.rpc_service._registry', mock_reg), \
         patch('services.rpc_service._get_registry', return_value=mock_reg), \
         patch('services.database_service.init_db', return_value=None), \
         patch('services.collector_service.start_background_collectors', return_value=None), \
         patch('services.collector_service.start_background_collector', return_value=None):
        from app import create_app
        app = create_app()
        app.config['TESTING'] = True
        app.config['RATELIMIT_ENABLED'] = False
        return app
