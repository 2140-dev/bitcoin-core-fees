The Collector (The Brain): Runs in the background, continuously pulling real data, making a prediction, and archiving the result.

The API (The Server): Provides instantaneous responses by querying the pre-computed data, avoiding slow, repeated calls to the Bitcoin Core node.

app.py

The API Server (Flask)

Exposes endpoints for both real-time data (/fees) and high-performance historical analytics (/block-stats).

collector.py

The Background Worker

Continuously monitors the blockchain, runs the custom prediction logic (get_custom_fee_prediction_asap), and archives the prediction-vs-actual data.

json_rpc_request.py

The RPC Client

Handles all communication with the Bitcoin Core node. Includes exponential backoff and a built-in cache for reliable, efficient data retrieval.

database.py

The Persistence Layer (SQLite)

Stores the historical performance of our model (prediction, min fee, max fee) over thousands of blocks for instant retrieval. Uses INSERT OR IGNORE for stability.