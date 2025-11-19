The Collector (The Brain): Runs in the background, continuously pulling real data, making a prediction, and archiving the result.

The API (The Server): Provides instantaneous responses by querying the pre-computed data, avoiding slow, repeated calls to the Bitcoin Core node.

app.py

The API Server (Flask)

Exposes endpoints for both real-time data (/fees) and high-performance historical analytics (/block-stats).
Also exposes an experimental `/fees/mempool` endpoint that uses the current block template
to return fee rate percentiles (default 25/50/75) straight from the mempool. Pass a custom
comma-separated list of percentiles via `?percentiles=10,50,90`.

collector.py

The Background Worker

Continuously monitors the blockchain, runs the custom prediction logic (get_custom_fee_prediction_asap), and archives the prediction-vs-actual data. It now stores percentile information (p10, p25, p50, p75, p90) for each processed block so that accuracy summaries can be generated later.

json_rpc_request.py

The RPC Client

Handles all communication with the Bitcoin Core node. Includes exponential backoff and a built-in cache for reliable, efficient data retrieval.

database.py

SQLite persistence that stores every processed block’s actual fee range, prediction, and percentile information. Provides helpers to fetch recent history and compute a summary of overpayment/underpayment/within-range accuracy for a configurable window (default 1,000 blocks).

New API endpoints

- `GET /fees/mempool`: experimental percentile estimator based on `getblocktemplate`.
- `GET /analytics/summary`: returns historical performance metrics (`total`, `overpayment_val`, `within_val`, etc.) for the stored predictions. Accepts `?limit=` and `?forecaster=` query parameters.
- `GET /api/v1/fees/estimate`: unified estimator endpoint with `method=mempool|historical|hybrid`, `target`, and `percentile`. Includes warnings when average block coverage is low or when using mempool mode for multi-block targets.
- External fallbacks (optional, set `EXTERNAL_FALLBACK_ENABLED=1`):
  - `GET /external/block-stats/{N}` → proxies `https://bitcoincorefeerate.com/block-stats/{N}/`
  - `GET /external/fees-stats/{N}` → proxies `https://bitcoincorefeerate.com/fees-stats/{N}/`
  - `GET /external/fees-sum/{N}` → proxies `https://bitcoincorefeerate.com/fees-sum/{N}/`
  - `/analytics/summary` will return external data if internal DB has no records yet.

database.py

The Persistence Layer (SQLite)

Stores the historical performance of our model (prediction, min fee, max fee) over thousands of blocks for instant retrieval. Uses INSERT OR IGNORE for stability.

+---------------------------+ +----------------------------+
| Frontend (Next.js) | REST (JSON) | Flask API |
| /dashboard, /stats +---------------->+ /api/v1/fees/estimate |
| calls /fees/mempool, | | /fees/mempool |
| /analytics/summary | | /analytics/summary |
+---------------------------+ +------------+---------------+
|
| RPC (JSON-RPC)
v
+-----------------------------+
| Bitcoin Core (bitcoind) |
| getblocktemplate |
| getrawmempool (verbose) |
| getblockstats, estimates... |
+--------------+--------------+
^
|
periodic |
fetch/store |
|
+------------------------------------------+ |
| Collector (background process) | |
| - Snapshot mempool (txids + verbose) | |
| - Predict p50 via blocktemplate | |
| - Compute block coverage | |
| - Compute high-fee inclusion ratio | |
| - Store analytics in SQLite | |
+---------------------------+--------------+ |
| |
v |
+------------------+ |
| SQLite (history) |<-----------------+
| fee_analysis |
+------------------+
