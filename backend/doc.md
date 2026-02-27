# Backend - Bitcoin Core Fees API

This Flask-based REST API interacts with Bitcoin Core RPC and a local SQLite database to provide fee analytics and block statistics.

## Running the Application

### 1. Prerequisites
Ensure you have a virtual environment set up and dependencies installed:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ensure `rpc_config.ini` is configured with your Bitcoin Core RPC credentials.

### 2. Start the App (Background)
To start the application in the background:

```bash
nohup env PYTHONPATH=src .venv/bin/gunicorn --workers 4 --bind 127.0.0.1:5001 app:app > debug.log 2>&1 &
```

### 3. Monitoring Logs
To see the logs in real-time:
```bash
tail -f debug.log
```

### 4. Stopping the App
To stop the process:
```bash
pkill -f "gunicorn"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/blockcount` | GET | Current block height from node. |
| `/fees/<target>/<mode>/<level>` | GET | `estimatesmartfee` results converted to sat/vB. |
| `/mempool-diagram` | GET | Analyzed feerate diagram for mempool accumulation. |
| `/performance-data/<start_block>/` | GET | Block feerate percentiles vs. recorded estimates. |
| `/fees-sum/<start_block>/` | GET | Aggregated accuracy metrics (within, over, under). |

### Parameters:
- `target`: Confirmation target (e.g., 2, 7, 144).
- `mode`: Fee estimation mode (`economical`, `conservative`, `unset`).
- `level`: Verbosity level for fee estimation.
- `start_block`: Block height to start range analysis from.
