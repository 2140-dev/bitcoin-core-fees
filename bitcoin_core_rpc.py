from json_rpc_request import make_request

def estimatesmartfee(conf_target=1, mode="economical", block_policy_only=False, verbosity_level=1):
    params = [conf_target, mode, block_policy_only, verbosity_level]
    method = "estimatesmartfee"
    return make_request(method, params)

