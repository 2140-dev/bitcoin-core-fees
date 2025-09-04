from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from bitcoin_core_rpc import estimatesmartfee

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app)

@app.route("/fees/<int:target>/<string:mode>/<int:level>", methods=['GET'])
def fees(target, mode, level):
    return estimatesmartfee(conf_target=target, mode=mode, verbosity_level=level)

@app.errorhandler(404)
def page_not_found(error):
    return "Hello Crawler :)"
