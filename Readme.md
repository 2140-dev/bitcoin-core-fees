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

### Credits
- **Abubakar Sadiq Ismail**: Bitcoin Core contributor and architecture.
- **b-l-u-e**: Backend logic and service implementation.
- **mercie-ux**: Frontend design and visual components.
- **Gemini & Claude**: AI-assisted development and test automation.
