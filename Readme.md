### Bitcoin Core Fee Rate Estimator

- A full-stack application for monitoring and validating Bitcoin Core transaction fee estimates against actual block data.
- Built on top of Bitcoin Core PR #34075

### Overview

This project tracks `estimatesmartfee` from a Bitcoin Core node and compares those estimates with the feerate percentiles of subsequent blocks. It provides a visual interface to verify the accuracy of the node's fee predictions.

#### Key Features
- **Fee Estimate Tracking**: A background service polls Bitcoin Core every 7 seconds for smart fee estimates.
- **Historical Accuracy**: Visualizes the accuracy of estimates (within range, overpaid, or underpaid) compared to real block data.
- **Mempool Diagram**: Real-time visualization of the mempool fee/weight accumulation curve.
- **Block Statistics**: Direct insights into feerate percentiles for recent blocks.
- **Multi-Network Support**: Connect to multiple Bitcoin Core nodes simultaneously (mainnet, testnet, signet, regtest). Each network gets its own collector thread and per-network database. Switch between networks from the UI without restarting.

#### Architecture

- **Backend (Python/Flask)**: Communicates with Bitcoin Core via RPC. Collects estimates into SQLite and serves data via a REST API.
- **Frontend (Next.js/TypeScript)**: Modern UI using Recharts and D3. Communicates with the backend via a secure API proxy route.

#### Project Structure

```text
.
├── backend/            # Flask API, data collector, and SQLite database
│   ├── src/            # Core logic and RPC services
│   └── tests/          # Pytest suite for backend validation
├── frontend/           # Next.js web application
│   ├── src/app/        # App router and pages
│   └── src/components/ # D3 and Recharts visualization components
└── .github/workflows/  # Automated testing workflow
```

#### How to Use

#### Prerequisites
- **Bitcoin Core Node**: Access to a node with RPC enabled (`getblockstats` support required).
- **Python**: 3.12+
- **Node.js**: 22+

#### 1. Configuration
- **Backend**: Copy `backend/rpc_config.ini.example` to `backend/rpc_config.ini` and add one `[RPC.<chain>]` section per node you want to connect to. Each section needs `URL`, `RPC_USER`, and `RPC_PASSWORD`. The chain is auto-detected via `getblockchaininfo`. Estimates are stored in per-network databases (`fee_analysis.db`, `testnet3/fee_analysis.db`, etc.).

#### 2. Manual Startup
**Backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python src/app.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

#### 3. Automated Startup
Use the provided `restart.sh` script to launch both services in the background:
```bash
chmod +x restart.sh
./restart.sh
```

---

### REST API

All endpoints are served by the Flask backend (default port `5001`) and proxied through the Next.js frontend at `/api/*`. Every endpoint accepts an optional `?chain=<chain>` query parameter to target a specific connected node. Omitting it uses the first configured node.

Available chain values: `main`, `test`, `testnet4`, `signet`, `regtest`.

---

#### `GET /networks`

Returns all connected Bitcoin Core nodes.

```
GET /networks
```

```json
[
  { "chain": "main",   "chain_display": "MAINNET" },
  { "chain": "signet", "chain_display": "SIGNET"  }
]
```

---

#### `GET /fees/<target>/<mode>/<level>`

Returns a fee rate estimate from Bitcoin Core's `estimatesmartfee`.

| Parameter | Type   | Description |
|-----------|--------|-------------|
| `target`  | int    | Confirmation target in blocks (e.g. `2`, `7`, `144`) |
| `mode`    | string | `economical`, `conservative`, or `unset` |
| `level`   | int    | Verbosity level passed to `estimatesmartfee` (PR #34075) |

| Query param          | Default | Description |
|----------------------|---------|-------------|
| `block_policy_only`  | `false` | When `true`, restricts estimation to the block policy estimator only. When `false`, Bitcoin Core may use additional estimators and includes an `estimator` field in the response naming the one chosen. |

```
GET /fees/2/economical/2?chain=signet
```

```json
{
  "feerate": 0.00001000,
  "feerate_sat_per_vb": 1.0,
  "blocks": 2,
  "estimator": "mempool",
  "chain": "signet"
}
```

---

#### `GET /mempool-health`

Returns per-block mempool health statistics sourced from `estimatesmartfee` verbosity 2 (PR #34075). Each entry shows how much of a recent block's weight came from mempool transactions.

```
GET /mempool-health?chain=main
```

```json
[
  {
    "block_height": 945190,
    "block_weight": 3991965,
    "mempool_txs_weight": 3963668,
    "ratio": 0.9929
  }
]
```

`ratio` = `mempool_txs_weight / block_weight`, capped at `1.0`.

---

#### `GET /mempool-diagram`

Returns the current mempool fee/weight accumulation curve from `getmempoolfeeratediagram`, plus feerate percentiles for 1-, 2-, and 3-block windows.

```
GET /mempool-diagram?chain=main
```

```json
{
  "raw": [{ "weight": 4000000, "fee": 0.004 }],
  "windows": {
    "1":   { "5": 1.2, "25": 3.4, "50": 5.1, "75": 8.0, "95": 20.0 },
    "2":   { ... },
    "3":   { ... },
    "all": { ... }
  },
  "total_weight": 141480000,
  "total_fee": 1.42
}
```

---

#### `GET /blockcount`

Returns the current block height and chain info.

```
GET /blockcount?chain=main
```

```json
{
  "blockcount": 945190,
  "chain": "main",
  "chain_display": "MAINNET"
}
```

---

#### `GET /performance-data/<start_block>/`

Returns historical fee estimates from the database alongside actual block feerate percentiles, for evaluating estimate accuracy.

| Query param | Default | Description |
|-------------|---------|-------------|
| `target`    | `2`     | Confirmation target used when the estimates were polled |
| `count`     | `100`   | Number of blocks to include |

```
GET /performance-data/945000/?target=2&count=100&chain=main
```

```json
{
  "blocks":    [{ "height": 945000, "low": 1.2, "high": 8.4 }],
  "estimates": [{ "height": 945000, "rate": 3.1 }]
}
```

---

#### `GET /fees-sum/<start_block>/`

Returns an accuracy summary for fee estimates starting from `start_block`, comparing stored estimates against actual block feerate percentiles.

| Query param | Default | Description |
|-------------|---------|-------------|
| `target`    | `2`     | Confirmation target |

```
GET /fees-sum/944000/?target=2&chain=main
```

```json
{
  "total": 980,
  "within_val": 860,    "within_perc": 0.878,
  "overpayment_val": 95,  "overpayment_perc": 0.097,
  "underpayment_val": 25, "underpayment_perc": 0.026
}
```

---

### Credits
- **Abubakar Sadiq Ismail**: Bitcoin Core contributor and architecture.
- **b-l-u-e**: Backend logic and service implementation.
- **mercie-ux**: Frontend design and visual components.
- **Gemini & Claude**: AI-assisted development and test automation.
