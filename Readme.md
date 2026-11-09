### Bitcoin Core Fee Rate Estimator

A full-stack application for monitoring and validating Bitcoin Core transaction fee estimates against actual block data.

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
- **Frontend (Next.js/TypeScript)**: Modern UI using D3. Communicates with the backend via a secure API proxy route.

#### Project Structure

```text
.
├── backend/            # Flask API, data collector, and SQLite database
│   ├── src/            # Core logic and RPC services
│   └── tests/          # Pytest suite for backend validation
├── frontend/           # Next.js web application
│   ├── src/app/        # App router and pages
│   └── src/components/ # D3 visualization components
├── scripts/            # Helper scripts (data import, etc.)
└── .github/workflows/  # Automated testing workflow
```

---

### Getting Started

#### Prerequisites
- **Bitcoin Core Node**: Access to a node with RPC enabled (`getblockstats` support required).
- **Python**: 3.12+
- **Node.js**: 22+

#### Configuration
Copy `backend/rpc_config.ini.example` to `backend/rpc_config.ini` and add one `[RPC.<chain>]` section per node you want to connect to. Each section needs `URL`, `RPC_USER`, and `RPC_PASSWORD`. The chain is auto-detected via `getblockchaininfo`.

#### Quick Start
```bash
chmod +x restart.sh
./restart.sh
```

<details>
<summary>Manual startup</summary>

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
</details>

#### Pre-collected Data

To bootstrap with historical fee data instead of collecting from scratch:

```bash
./scripts/import-data.sh
```

Or manually:

```bash
curl -fSL https://bitcoincorefeerate.com/api/data/snapshot | tar xzf - -C backend/src/services/
```

The backend picks up the databases on next start — no extra configuration needed.

---

### REST API

All endpoints are served by the Flask backend (default port `5001`) and proxied through the Next.js frontend at `/api/*`. Every endpoint accepts an optional `?chain=<chain>` query parameter. Omitting it uses the first configured node.

Available chains: `main`, `test`, `testnet4`, `signet`, `regtest`.

<details>
<summary><code>GET /networks</code> — List connected nodes</summary>

```
GET /networks
```

```json
[
  { "chain": "main",   "chain_display": "MAINNET" },
  { "chain": "signet", "chain_display": "SIGNET"  }
]
```
</details>

<details>
<summary><code>GET /fees/&lt;target&gt;/&lt;mode&gt;/&lt;level&gt;</code> — Fee rate estimate</summary>

| Parameter | Type   | Description |
|-----------|--------|-------------|
| `target`  | int    | Confirmation target in blocks (e.g. `2`, `7`, `144`) |
| `mode`    | string | `economical`, `conservative`, or `unset` |
| `level`   | int    | Verbosity level passed to `estimatesmartfee` |

| Query param          | Default | Description |
|----------------------|---------|-------------|
| `block_policy_only`  | `false` | When `true`, restricts to block policy estimator only |

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
</details>

<details>
<summary><code>GET /mempool-health</code> — Per-block mempool health</summary>

Returns how much of each recent block's weight came from mempool transactions (`ratio` = `mempool_txs_weight / block_weight`, capped at `1.0`).

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
</details>

<details>
<summary><code>GET /mempool-diagram</code> — Mempool fee/weight curve</summary>

Returns the accumulation curve from `getmempoolfeeratediagram` plus feerate percentiles for 1-, 2-, and 3-block windows.

```
GET /mempool-diagram?chain=main
```

```json
{
  "raw": [{ "weight": 4000000, "fee": 0.004 }],
  "windows": {
    "1":   { "5": 1.2, "25": 3.4, "50": 5.1, "75": 8.0, "95": 20.0 },
    "2":   { "..." : "..." },
    "3":   { "..." : "..." },
    "all": { "..." : "..." }
  },
  "total_weight": 141480000,
  "total_fee": 1.42
}
```
</details>

<details>
<summary><code>GET /blockcount</code> — Current block height</summary>

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
</details>

<details>
<summary><code>GET /performance-data/&lt;start_block&gt;/</code> — Historical estimate accuracy</summary>

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
</details>

<details>
<summary><code>GET /fees-sum/&lt;start_block&gt;/</code> — Accuracy summary</summary>

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
</details>

<details>
<summary><code>GET /data/snapshot</code> — Download collected data</summary>

Downloads all chain databases as a single `tar.gz` (~890 MB). Rate-limited to 2 requests per hour.

```
GET /data/snapshot
```

Archive contents:
```
fee_analysis.db            # mainnet
signet/fee_analysis.db     # signet
testnet4/fee_analysis.db   # testnet4
```
</details>

---

### Credits
- **Abubakar Sadiq Ismail**: Bitcoin Core contributor and architecture.
- **b-l-u-e**: Backend logic and service implementation.
- **mercie-ux**: Frontend design and visual components.
- **Gemini & Claude**: AI-assisted development and test automation.
