import logging
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import services.rpc_service as rpc_service
import services.collector_service as collector_service
import services.database_service as db_service

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app():
    app = Flask(__name__)
    # NOTE: Configure x_for=1 to match your actual proxy depth.
    # Without this, X-Forwarded-For spoofing can defeat IP-based limiting.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    CORS(app)

    # ---------------------------------------------------------------------------
    # Rate limiting
    # ---------------------------------------------------------------------------
    # Uses the real client IP (respects ProxyFix above).
    # Default: 200 requests/day, 60/hour applied to every endpoint unless
    # overridden with a per-route @limiter.limit() decorator below.
    # ---------------------------------------------------------------------------
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["10000 per day", "1000 per hour"],
        # Store state in memory by default. For multi-worker/multi-process
        # deployments swap this for a Redis URI:
        #   storage_uri="redis://localhost:6379"
        storage_uri="memory://",
        # Return 429 JSON instead of HTML when limit is hit
        headers_enabled=True,   # adds X-RateLimit-* headers to responses
    )

    db_service.init_db()
    collector_service.start_background_collector()

    # ---------------------------------------------------------------------------
    # Routes
    # ---------------------------------------------------------------------------

    @app.route("/fees/<int:target>/<string:mode>/<int:level>", methods=['GET'])
    @limiter.limit("50 per minute")   # estimatesmartfee is a node RPC call — keep it tight
    def fees(target, mode, level):
        VALID_MODES = {"economical", "conservative", "unset"}
        if mode not in VALID_MODES:
            return jsonify({"error": f"Invalid mode '{mode}'. Must be one of: {', '.join(VALID_MODES)}"}), 400
        try:
            result = rpc_service.estimate_smart_fee(conf_target=target, mode=mode, verbosity_level=level)
            return jsonify(result)
        except Exception as e:
            logger.error(f"/fees RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/mempool-diagram", methods=['GET'])
    @limiter.limit("50 per minute")   # expensive computation — strict cap
    def mempool_diagram():
        try:
            result = rpc_service.get_mempool_feerate_diagram_analysis()
            return jsonify(result)
        except Exception as e:
            logger.error(f"Mempool diagram RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/performance-data/<int:start_block>/", methods=['GET'])
    @limiter.limit("50 per minute")   # hits DB + RPC
    def get_performance_data(start_block):
        target = request.args.get('target', default=2, type=int)
        try:
            data = rpc_service.get_performance_data(start_height=start_block, count=100, target=target)
            return jsonify(data)
        except Exception as e:
            logger.error(f"/performance-data RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/fees-sum/<int:start_block>/", methods=['GET'])
    @limiter.limit("50 per minute")
    def get_local_fees_sum(start_block):
        target = request.args.get('target', default=2, type=int)
        try:
            data = rpc_service.calculate_local_summary(target=target)
            return jsonify(data)
        except Exception as e:
            logger.error(f"/fees-sum failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/blockcount", methods=['GET'])
    @limiter.limit("100 per minute")   # cheap call, slightly more relaxed
    def block_count():
        try:
            result = rpc_service.get_block_count()
            return jsonify({"blockcount": result})
        except Exception as e:
            logger.error(f"/blockcount RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    # ---------------------------------------------------------------------------
    # Error handlers
    # ---------------------------------------------------------------------------

    @app.errorhandler(404)
    def page_not_found(error):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(429)
    def rate_limit_exceeded(error):
        # error.description is the limit string e.g. "30 per 1 minute"
        logger.warning(f"Rate limit exceeded from {get_remote_address()}: {error.description}")
        return jsonify({
            "error": "Too many requests",
            "message": f"Rate limit exceeded: {error.description}. Please slow down."
        }), 429

    return app

app = create_app()
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, host='0.0.0.0', port=port)
