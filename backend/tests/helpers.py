import os
import sys
from unittest.mock import patch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))


def make_app():
    """Create a Flask test app with all side effects patched out."""
    with patch('services.database_service.init_db', return_value=None), \
         patch('services.collector_service.start_background_collector', return_value=None):
        from app import create_app
        app = create_app()
        app.config['TESTING'] = True
        app.config['RATELIMIT_ENABLED'] = False
        return app
