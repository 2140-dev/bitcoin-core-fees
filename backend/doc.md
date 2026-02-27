# Backend - Bitcoin Core Fees API

This service provides a Flask-based REST API to interact with Bitcoin Core RPC and provide fee analytics.

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
To start the application and keep it running after you disconnect from the terminal, use the following `nohup` command:

```bash
nohup .venv/bin/python app.py > debug.log 2>&1 &
```

**What this command does:**
*   `nohup`: Stands for "No Hang Up". It allows the command to continue running even after you logout or close the terminal.
*   `.venv/bin/python app.py`: Executes the Flask app using the Python interpreter inside your virtual environment.
*   `> debug.log`: Redirects standard output (logs) to a file named `debug.log`.
*   `2>&1`: Redirects standard error (errors) to the same location as standard output (`debug.log`).
*   `&`: Puts the command in the background, allowing you to continue using the terminal.

### 3. Monitoring Logs
To see the logs in real-time:
```bash
tail -f debug.log
```

### 4. Stopping the App
To stop the background process, you can find the Process ID (PID) and kill it, or use `pkill`:

**Option A (Using pkill):**
```bash
pkill -f "python app.py"
```

**Option B (By Port):**
```bash
kill $(lsof -t -i:5001)
```

**Option C (Manual):**
1. Find the PID: `ps aux | grep "python app.py"`
2. Kill the process: `kill <PID>`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check service and RPC connection status. |
| `/blockchain/info` | GET | Get general info about the Bitcoin blockchain. |
| `/blockcount` | GET | Get the current block height. |
| `/mempool/info` | GET | Get current mempool state (size, bytes, etc.). |
| `/fees/<target>/<mode>/<level>` | GET | Get `estimatesmartfee` from Bitcoin Core. |
| `/fees/mempool` | GET | Get fee estimates based on current mempool percentiles. |
| `/api/v1/fees/estimate` | GET | Unified endpoint for mempool, historical, or hybrid estimates. |
| `/analytics/summary` | GET | Get summarized fee and block analytics (internal or external fallback). |
| `/blockstats/<height>` | GET | Get detailed stats for a specific block height. |
| `/external/block-stats/<count>` | GET | Proxy to external API for block statistics. |
| `/external/fees-stats/<count>` | GET | Proxy to external API for fee statistics. |
| `/external/fees-sum/<count>` | GET | Proxy to external API for fee summation analytics. |
