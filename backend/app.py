from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from json_rpc_request import (
    estimate_smart_fee, 
    get_mempool_info, 
    get_blockchain_info, 
    get_block_stats,
    get_block_count,
    get_mempool_percentile_fee_estimate,
    get_estimated_fee_rate_satvb,
    external_block_stats,
    external_fees_stats,
    external_fees_sum
)
from database import compute_summary

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app)
CORS(app) 

@app.route("/fees/<int:target>/<string:mode>/<int:level>", methods=['GET'])
def fees(target, mode, level):
    try:
        result = estimate_smart_fee(conf_target=target, mode=mode, verbosity_level=level)
        return jsonify(result)
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get fee estimate: {str(e)}"}), 500

@app.route("/mempool/info", methods=['GET'])
def mempool_info():
    try:
        result = get_mempool_info()
        return jsonify(result)
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get mempool info: {str(e)}"}), 500

@app.route("/blockchain/info", methods=['GET'])
def blockchain_info():
    try:
        result = get_blockchain_info()
        return jsonify(result)
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get blockchain info: {str(e)}"}), 500

@app.route("/blockstats/<int:block_height>", methods=['GET'])
def block_stats(block_height):
    try:
        result = get_block_stats(block_height)
        return jsonify(result)
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get block stats: {str(e)}"}), 500

@app.route("/blockcount", methods=['GET'])
def block_count():
    try:
        result = get_block_count()
        return jsonify({"blockcount": result})
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get block count: {str(e)}"}), 500

@app.route("/health", methods=['GET'])
def health():
    try:
        get_blockchain_info()
        return jsonify({
            "status": "healthy", 
            "service": "bitcoin-core-fees-api",
            "rpc_connected": True
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy", 
            "service": "bitcoin-core-fees-api",
            "rpc_connected": False,
            "error": str(e)
        }), 503

@app.route("/fees/mempool", methods=['GET'])
def mempool_fee_estimate():
    percentile_param = request.args.get("percentiles", "25,50,75")
    try:
        percentiles = [
            int(value.strip())
            for value in percentile_param.split(",")
            if value.strip()
        ]
    except ValueError:
        return jsonify({"error": "Percentiles must be integers"}), 400

    if not percentiles:
        percentiles = [50]

    invalid = [p for p in percentiles if p <= 0 or p >= 100]
    if invalid:
        return jsonify({"error": "Percentiles must be between 1 and 99"}), 400

    try:
        result = get_mempool_percentile_fee_estimate(percentiles)
        # Add coverage hint from analytics
        summary = compute_summary(limit=500)
        warnings = []
        avg_cov = summary.get("avg_block_coverage")
        if avg_cov is not None and avg_cov < 0.9:
            warnings.append(f"Low mempool alignment detected (avg block coverage {avg_cov}). Estimates may be skewed.")
        return jsonify({
            "mode": "mempool_percentile_estimator",
            "input_percentiles": percentiles,
            **result,
            "warnings": warnings
        })
    except Exception as e:
        print(f"RPC Error: {e}")
        return jsonify({"error": f"Failed to get mempool-based fee estimate: {str(e)}"}), 500

@app.route("/api/v1/fees/estimate", methods=['GET'])
def api_estimate():
    """
    Unified estimator endpoint.
    Query params:
      - method: 'mempool' | 'historical' | 'hybrid' (default: 'mempool')
      - target: confirmation target blocks (default: 1)
      - percentile: percentile for mempool method (default: 50)
    """
    method = request.args.get("method", default="mempool").lower()
    target = request.args.get("target", default=1, type=int)
    percentile = request.args.get("percentile", default=50, type=int)

    if percentile <= 0 or percentile >= 100:
        return jsonify({"error": "percentile must be between 1 and 99"}), 400
    if target <= 0:
        return jsonify({"error": "target must be >= 1"}), 400

    warnings = []
    # Coverage warning from analytics
    try:
        summary = compute_summary(limit=500)
        avg_cov = summary.get("avg_block_coverage")
        if avg_cov is not None and avg_cov < 0.9:
            warnings.append(f"Low mempool alignment detected (avg block coverage {avg_cov}). Estimates may be skewed.")
    except Exception:
        pass

    # Historical
    historical_rate = None
    try:
        hist = get_estimated_fee_rate_satvb(conf_target=target, mode="economical", verbosity_level=2)
        historical_rate = hist.get("feerate_sat_per_vb")
    except Exception as e:
        warnings.append(f"historical estimator unavailable: {str(e)}")

    # Mempool
    mempool_rate = None
    if method in ("mempool", "hybrid"):
        try:
            mem = get_mempool_percentile_fee_estimate([percentile])
            # percentiles payload is list of dicts; take first
            plist = mem.get("percentiles") or []
            if plist:
                mempool_rate = plist[0].get("feerate_sat_per_vb")
        except Exception as e:
            warnings.append(f"mempool estimator unavailable: {str(e)}")
        if method == "mempool" and target > 1:
            warnings.append("mempool method is tuned for target=1; accuracy may degrade for multi-block targets.")

    result_rate = None
    chosen_method = method
    if method == "mempool":
        result_rate = mempool_rate
    elif method == "historical":
        result_rate = historical_rate
    elif method == "hybrid":
        # Simple policy: use mempool for target=1, otherwise historical
        if target == 1 and mempool_rate is not None:
            result_rate = mempool_rate
            chosen_method = "mempool"
        else:
            result_rate = historical_rate
            chosen_method = "historical"

    return jsonify({
        "method": chosen_method,
        "requested_method": method,
        "target": target,
        "percentile": percentile,
        "fee_rate_sat_per_vb": result_rate,
        "components": {
            "mempool": mempool_rate,
            "historical": historical_rate
        },
        "warnings": warnings
    })

@app.route("/analytics/summary", methods=['GET'])
def analytics_summary():
    limit = request.args.get("limit", default=1000, type=int)
    forecaster = request.args.get("forecaster", default="OurModelV1")

    if limit is None or limit <= 0:
        limit = 100
    limit = min(limit, 5000)

    try:
        summary = compute_summary(limit=limit, forecaster_name=forecaster)
        # If no data yet, try external fallback
        if not summary or summary.get("total", 0) == 0:
            try:
                ext = external_fees_sum(limit)
                # Return as-is but mark source
                if isinstance(ext, dict):
                    ext["source"] = "external"
                return jsonify(ext)
            except Exception as e:
                print(f"External summary fallback failed: {e}")
        # Mark source for clarity
        summary["source"] = "internal"
        return jsonify(summary)
    except Exception as e:
        print(f"Analytics Error: {e}")
        return jsonify({"error": f"Failed to compute analytics summary: {str(e)}"}), 500

@app.route("/external/block-stats/<int:count>", methods=['GET'])
def proxy_external_block_stats(count: int):
    try:
        data = external_block_stats(count)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": f"External block-stats failed: {str(e)}"}), 502

@app.route("/external/fees-stats/<int:count>", methods=['GET'])
def proxy_external_fees_stats(count: int):
    try:
        data = external_fees_stats(count)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": f"External fees-stats failed: {str(e)}"}), 502

@app.route("/external/fees-sum/<int:count>", methods=['GET'])
def proxy_external_fees_sum(count: int):
    try:
        data = external_fees_sum(count)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": f"External fees-sum failed: {str(e)}"}), 502

@app.errorhandler(404)
def page_not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
