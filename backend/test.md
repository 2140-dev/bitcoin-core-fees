# Testing Guide

## Prerequisites

`requirements.txt` should include:

```
Flask==3.1.3
Flask-CORS==4.0.2
Flask-Limiter==4.1.1
requests==2.32.3
configparser==6.0.0
pytest
pytest-cov
```

---

## Test Structure

```
tests/
├── conftest.py                  # pytest path setup
├── helpers.py                   # shared app factory
├── test_app.py                  # HTTP layer — routes, error handlers, mode validation
├── test_rpc_service.py          # RPC logic, fee math, caching, mempool diagram
├── test_database_service.py     # SQLite writes, queries, indexes, edge cases
└── test_collector_service.py    # Collector lifecycle, duplicate guard, error resilience
```

---

## Running Tests

All commands should be run from the `backend/` directory.

**Install all required packages**
```
pip install -r requirements.txt
```

**Run the full suite:**
```bash
python -m pytest tests/ -v
```

**Run a single file:**
```bash
python -m pytest tests/test_app.py -v
python -m pytest tests/test_rpc_service.py -v
python -m pytest tests/test_database_service.py -v
python -m pytest tests/test_collector_service.py -v
```

**Run a single test by name:**
```bash
python -m pytest tests/test_rpc_service.py::TestRpcService::test_feerate_conversion_is_correct -v
```

**Stop on first failure:**
```bash
python -m pytest tests/ -v -x
```

---

## Coverage Report

**Print coverage summary in terminal:**
```bash
python -m pytest tests/ -v --cov=src/services --cov=src/app --cov-report=term-missing
```

**Generate an HTML report (opens in browser):**
```bash
python -m pytest tests/ --cov=src/services --cov=src/app --cov-report=html
open htmlcov/index.html
```


