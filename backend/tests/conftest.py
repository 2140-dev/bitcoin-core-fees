import sys
import os

# Make `services` and `app` importable when running pytest from the tests/ directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))
