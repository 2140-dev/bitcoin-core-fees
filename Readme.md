# Bitcoin Core Fee Tracker & Visualizer

A comprehensive full-stack application for monitoring and visualizing Bitcoin Core transaction fees, mempool dynamics, and block statistics. This tool provides real-time insights through a modern web interface powered by a robust backend that interfaces directly with a Bitcoin Core node.

## Overview

This project provides a centralized platform to track and analyze Bitcoin transaction fees. It bridges the gap between raw Bitcoin Core RPC data and human-readable visualizations.

### Key Features
- **Real-time Fee Estimation**: Get feerate estimates based on current mempool percentiles and historical data.
- **Interactive Charts**: Visualize fee history, block statistics, and mempool status using Recharts and D3.
- **Mempool Diagram**: View the current state of the mempool in a graphical format.
- **Unified API**: A clean REST API that handles multiple data sources and internal caching.

## Architecture & Integration

The project is divided into two main modules that are linked through a secure proxy layer:

- **Backend (Python/Flask)**: Communicates with your Bitcoin Core node via RPC. It handles data collection, persistence in SQLite, and serves as the source of truth for all analytics.
- **Frontend (Next.js/TypeScript)**: Provides the user interface. It communicates with the backend via an internal API route (`frontend/src/app/api/[...path]/route.ts`) which proxies requests to the backend service. This architecture simplifies deployment and enhances security.

## Project Structure

```text
.
├── backend/            # Flask API, data collector, and database services
│   ├── src/            # Application logic (services, app.py)
│   └── tests/          # Pytest suite for backend validation
├── frontend/           # Next.js web application
│   ├── src/app/        # App router, pages, and secure API proxy
│   └── src/components/ # Reusable UI components and dynamic charts
└── .github/workflows/  # Automated testing workflow (GitHub Actions)
```

## How to Use

### Prerequisites
- **Bitcoin Core Node**: Access to a running Bitcoin Core node with RPC enabled.
- **Python**: Version 3.12+
- **Node.js**: Version 22+

### 1. Configuration
- **Backend**: Navigate to `backend/`, copy `rpc_config.ini.example` to `rpc_config.ini`, and fill in your node's details.
- **Frontend**: Ensure the `BACKEND_URL` environment variable is set (defaults to `http://127.0.0.1:5001`).

### 2. Manual Startup
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

### 3. Automated Startup (Production-like)
A `restart.sh` script is provided in the root directory to stop any existing instances and start both services in the background using Gunicorn (backend) and Next.js (frontend):
```bash
chmod +x restart.sh
./restart.sh
```

## Credits

This project is a collaborative effort between:
- **Ismael Sadeeq**: Main contributor and maintainer.
- **Gemini**: AI-assisted development, architectural design, and test automation.
- **Claude**: AI-assisted development, code optimization, and documentation.
- **b-l-u-e** ([winnie.gitau282@gmail.com](mailto:winnie.gitau282@gmail.com)): Contributions to core services, backend logic, and test suites.
- **mercie-ux** ([mbaomercy0@gmail.com](mailto:mbaomercy0@gmail.com)): Contributions to user experience, frontend design, and visual components.

The codebase represents a merge of PR work from contributors and AI-generated improvements for a complete, robust experience.
