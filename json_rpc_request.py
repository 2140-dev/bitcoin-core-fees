import configparser
import json
import requests

Config = configparser.ConfigParser()
Config.read("rpc_config.ini")

URL = Config.get("RPC_INFO", "URL")
RPCUSER = Config.get("RPC_INFO", "RPC_USER")
RPCPASSWORD = Config.get("RPC_INFO", "RPC_PASSWORD")

def getjson_payload(method, params):
    return json.dumps({"method": method, "params": params})

def make_request(method, params):
    payload = getjson_payload(method, params)
    headers = {'content-type': "application/json", 'cache-control': "no-cache"}
    response = requests.request("POST", URL, data=payload, headers=headers, auth=(RPCUSER, RPCPASSWORD))
    return json.loads(response.text)["result"]

