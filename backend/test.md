# Testing Guide

## Prerequisites

Ensure all dependencies including test tools are installed:

```bash
pip install pytest pytest-cov
```

---

## Test Structure

```text
tests/
├── conftest.py                  # Pytest path and app setup
├── helpers.py                   # Shared app factory for tests
├── test_app.py                  # HTTP layer (routes, validation)
├── test_rpc_service.py          # RPC conversion and calculation logic
└── test_database_service.py     # SQLite writes and query filtering
```

---

## Running Tests

All commands should be run from the `backend/` directory.

**Run the full suite:**
```bash
python -m pytest tests/ -v
```

**Run a single file:**
```bash
python -m pytest tests/test_app.py -v
python -m pytest tests/test_rpc_service.py -v
python -m pytest tests/test_database_service.py -v
```

**Run a single test by name:**
```bash
python -m pytest tests/test_rpc_service.py::test_feerate_conversion_is_correct -v
```

**Stop on first failure:**
```bash
python -m pytest tests/ -v -x
```

---

## Coverage Report

**Print coverage summary in terminal:**
```bash
python -m pytest tests/ -v --cov=src --cov-report=term-missing
```

**Generate an HTML report:**
```bash
python -m pytest tests/ --cov=src --cov-report=html
```
