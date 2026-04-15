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
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    CORS(app)

    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["10000 per day", "1000 per hour"],
        storage_uri="memory://",
        headers_enabled=True,
    )

    # Initialise a DB for each configured chain
    for chain in rpc_service.registry.chains():
        db_service.init_db(chain=chain)

    collector_service.start_background_collectors()

    # ---------------------------------------------------------------------------
    # Helper — resolve ?chain= query param (defaults to first registered chain)
    # ---------------------------------------------------------------------------
    def _resolve_chain():
        chain = request.args.get("chain")
        if chain and chain not in rpc_service.registry:
            return None, (jsonify({"error": f"Unknown chain '{chain}'. See /networks for available chains."}), 400)
        return chain, None

    # ---------------------------------------------------------------------------
    # Routes
    # ---------------------------------------------------------------------------

    @app.route("/networks", methods=['GET'])
    @limiter.limit("100 per minute")
    def networks():
        return jsonify(rpc_service.get_available_chains())

    @app.route("/fees/<int:target>/<string:mode>/<int:level>", methods=['GET'])
    @limiter.limit("50 per minute")
    def fees(target, mode, level):
        VALID_MODES = {"economical", "conservative", "unset"}
        if mode not in VALID_MODES:
            return jsonify({"error": f"Invalid mode '{mode}'. Must be one of: {', '.join(VALID_MODES)}"}), 400
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            result = rpc_service.estimate_smart_fee(conf_target=target, mode=mode, verbosity_level=level, chain=chain)
            return jsonify(result)
        except Exception as e:
            logger.error(f"/fees RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/mempool-health", methods=['GET'])
    @limiter.limit("50 per minute")
    def mempool_health():
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            result = rpc_service.get_mempool_health_statistics(chain=chain)
            return jsonify(result)
        except Exception as e:
            logger.error(f"/mempool-health RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/mempool-diagram", methods=['GET'])
    @limiter.limit("50 per minute")
    def mempool_diagram():
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            result = rpc_service.get_mempool_feerate_diagram_analysis(chain=chain)
            return jsonify(result)
        except Exception as e:
            logger.error(f"Mempool diagram RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/performance-data/<int:start_block>/", methods=['GET'])
    @limiter.limit("50 per minute")
    def get_performance_data(start_block):
        target = request.args.get('target', default=2, type=int)
        count = request.args.get('count', default=100, type=int)
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            data = rpc_service.get_performance_data(start_height=start_block, count=count, target=target, chain=chain)
            return jsonify(data)
        except Exception as e:
            logger.error(f"/performance-data RPC failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/fees-sum/<int:start_block>/", methods=['GET'])
    @limiter.limit("50 per minute")
    def get_local_fees_sum(start_block):
        target = request.args.get('target', default=2, type=int)
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            data = rpc_service.calculate_local_summary(target=target, start_height=start_block, chain=chain)
            return jsonify(data)
        except Exception as e:
            logger.error(f"/fees-sum failed: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500

    @app.route("/blockcount", methods=['GET'])
    @limiter.limit("100 per minute")
    def block_count():
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            info = rpc_service.get_blockchain_info(chain=chain)
            return jsonify({
                "blockcount": info["blockcount"],
                "chain": info["chain"],
                "chain_display": info["chain_display"],
            })
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
