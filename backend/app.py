from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from json_rpc_request import (
    estimate_smart_fee, 
    get_mempool_info, 
    get_blockchain_info, 
    get_block_stats,
    get_block_count
)

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

@app.errorhandler(404)
def page_not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
