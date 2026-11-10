import logging
import os
import tarfile
import threading
import time
from flask import Flask, jsonify, request, send_file
from flask_compress import Compress
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import services.rpc_service as rpc_service
import services.collector_service as collector_service
import services.database_service as db_service

logging.basicConfig(
    # INFO in production; override with LOG_LEVEL=DEBUG for local debugging.
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Confirmation targets the background summary job pre-computes (matches the
# frontend target selector). Kept here so the loop and endpoint agree.
_SUMMARY_TARGETS = (2, 7, 144)
# How often the primary worker recomputes the all-time accuracy summary.
# 0 disables the background job (endpoint then falls back to a live window).
_SUMMARY_REFRESH_SECONDS = int(os.environ.get("SUMMARY_REFRESH_SECONDS", 30 * 60))
# Hard cap on how many blocks /performance-data will fan out getblockstats for.
_MAX_PERFORMANCE_BLOCKS = 1000


def _clamp_int(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))

def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    Compress(app)
    # Browsers reach the API same-origin through the Next.js /api proxy, so
    # cross-origin access isn't needed in production. Lock it down via
    # CORS_ORIGINS (comma-separated); defaults to "*" to preserve current
    # behaviour / local dev hitting :5001 directly.
    cors_origins = os.environ.get("CORS_ORIGINS", "*")
    CORS(app, origins=[o.strip() for o in cors_origins.split(",")] if cors_origins != "*" else "*")

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

    is_primary_worker = collector_service.start_background_collectors()

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

    @app.route("/health", methods=['GET'])
    @limiter.exempt
    def health():
        # Cheap liveness probe (no RPC) for monitoring / load balancers.
        return jsonify({"status": "ok", "chains": rpc_service.registry.chains()})

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
        target = _clamp_int(target, 1, 1008)
        level = _clamp_int(level, 0, 3)
        chain, err = _resolve_chain()
        if err:
            return err
        block_policy_only = request.args.get("block_policy_only", "false").lower() != "false"
        try:
            result = rpc_service.estimate_smart_fee(conf_target=target, mode=mode, verbosity=level, block_policy_only=block_policy_only, chain=chain)
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
        target = _clamp_int(request.args.get('target', default=2, type=int), 1, 1008)
        # Cap the fan-out so a single request can't trigger an unbounded burst
        # of getblockstats calls against the node.
        count = _clamp_int(request.args.get('count', default=100, type=int), 1, _MAX_PERFORMANCE_BLOCKS)
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
        target = _clamp_int(request.args.get('target', default=2, type=int), 1, 1008)
        all_time = request.args.get("all_time", "false").lower() == "true"
        chain, err = _resolve_chain()
        if err:
            return err
        try:
            # All-time is served from the pre-computed cache (the primary worker
            # refreshes it in the background) so the request never fans out
            # getblockstats over ~30k blocks. Fall back to a live window only if
            # the cache hasn't been populated yet.
            if all_time:
                cached = db_service.get_summary(chain=chain, target=max(2, target))
                if cached:
                    return jsonify(cached)
            data = rpc_service.calculate_local_summary(target=target, start_height=start_block, chain=chain)
            data["all_time"] = False
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
    # Data snapshot — download all chain databases as a tar.gz
    # ---------------------------------------------------------------------------

    _SNAPSHOT_PATH = os.path.join(db_service._BASE_DB_DIR, "fee_data.tar.gz")
    _SNAPSHOT_LOCK = threading.Lock()

    def _rebuild_snapshot():
        """Compress all chain databases into a single tar.gz on disk."""
        tmp_path = _SNAPSHOT_PATH + ".tmp"
        base = os.path.realpath(db_service._BASE_DB_DIR)
        try:
            with tarfile.open(tmp_path, mode="w:gz") as tar:
                for chain in rpc_service.registry.chains():
                    db_path = os.path.realpath(db_service.get_db_path(chain))
                    if not os.path.isfile(db_path) or not db_path.startswith(base):
                        continue
                    subdir = db_service.CHAIN_DIR_MAP.get(chain, chain)
                    arcname = os.path.join(subdir, db_service.DB_FILENAME) if subdir else db_service.DB_FILENAME
                    tar.add(db_path, arcname=arcname)
            os.replace(tmp_path, _SNAPSHOT_PATH)
            logger.info("Data snapshot rebuilt: %s", _SNAPSHOT_PATH)
        except Exception:
            logger.exception("Failed to rebuild data snapshot")
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def _snapshot_loop():
        """Rebuild the snapshot every 6 hours."""
        while True:
            with _SNAPSHOT_LOCK:
                _rebuild_snapshot()
            time.sleep(6 * 3600)

    # Only the primary worker (the one holding the collector lock) rebuilds the
    # snapshot, so multiple gunicorn workers don't race on the shared .tmp file.
    # The first build runs inside the loop thread (not synchronously here) so a
    # multi-minute tar.gz build can't block worker boot or the summary job from
    # starting. /data/snapshot returns 503 until the first build finishes.
    if is_primary_worker:
        threading.Thread(target=_snapshot_loop, daemon=True).start()

    # ---------------------------------------------------------------------------
    # All-time accuracy summary — precomputed in the background
    # ---------------------------------------------------------------------------
    # Computing the within/over/under-paid breakdown over all history fans out
    # getblockstats across ~30k blocks per chain, far too expensive to do on a
    # request. The primary worker computes it periodically and stores the result
    # per (chain, target); /fees-sum?all_time=true reads that cached row.

    def _refresh_all_time_summaries():
        for chain in rpc_service.registry.chains():
            for target in _SUMMARY_TARGETS:
                try:
                    result = rpc_service.calculate_local_summary(
                        target=target, all_time=True, chain=chain,
                    )
                    db_service.save_summary(chain=chain, target=target, result=result)
                    logger.info(
                        "All-time summary refreshed: chain=%s target=%d total=%d",
                        chain, target, result.get("total", 0),
                    )
                except Exception:
                    logger.exception("Failed to refresh all-time summary (chain=%s target=%d)", chain, target)

    def _summary_loop():
        while True:
            _refresh_all_time_summaries()
            time.sleep(_SUMMARY_REFRESH_SECONDS)

    if is_primary_worker and _SUMMARY_REFRESH_SECONDS > 0:
        threading.Thread(target=_summary_loop, daemon=True).start()

    @app.route("/data/snapshot", methods=['GET'])
    @limiter.limit("2 per hour")
    def data_snapshot():
        """Serve the pre-built tar.gz of all chain fee_analysis.db files."""
        if not os.path.isfile(_SNAPSHOT_PATH):
            return jsonify({"error": "Snapshot not yet available, try again shortly"}), 503
        return send_file(
            _SNAPSHOT_PATH,
            mimetype="application/gzip",
            as_attachment=True,
            download_name="fee_data.tar.gz",
        )

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
