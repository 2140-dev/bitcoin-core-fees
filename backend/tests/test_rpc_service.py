import json
import unittest
from unittest.mock import MagicMock, patch

from services.rpc_service import RpcClient, _clamp_target


class TestClampTarget(unittest.TestCase):

    def test_below_2(self):
        self.assertEqual(_clamp_target(1), 2)
        self.assertEqual(_clamp_target(0), 2)
        self.assertEqual(_clamp_target(-5), 2)

    def test_at_or_above_2(self):
        self.assertEqual(_clamp_target(2), 2)
        self.assertEqual(_clamp_target(7), 7)
        self.assertEqual(_clamp_target(144), 144)


class TestRpcClient(unittest.TestCase):

    def setUp(self):
        self.client = RpcClient("http://test:8332", "user", "pass")

    def _mock_post(self, result=None, error=None):
        mock_response = MagicMock()
        mock_response.json.return_value = {"result": result, "error": error, "id": 1}
        return MagicMock(return_value=mock_response)

    # --- rpc_call -----------------------------------------------------------

    def test_rpc_call_success(self):
        with patch.object(self.client._session, 'post', self._mock_post(result=42)):
            self.assertEqual(self.client.rpc_call("getblockcount", []), 42)

    def test_rpc_call_rpc_error_raises(self):
        with patch.object(self.client._session, 'post', self._mock_post(error={"code": -1, "message": "bad"})):
            with self.assertRaises(RuntimeError) as ctx:
                self.client.rpc_call("getblockcount", [])
            self.assertIn("RPC Error", str(ctx.exception))

    def test_rpc_call_transport_error_does_not_leak_details(self):
        mock_post = MagicMock(side_effect=ConnectionError("refused"))
        with patch.object(self.client._session, 'post', mock_post):
            with self.assertRaises(RuntimeError) as ctx:
                self.client.rpc_call("getblockcount", [])
            self.assertNotIn('refused', str(ctx.exception))

    def test_rpc_call_uses_incrementing_ids(self):
        captured_ids = []

        def capture(url, data, **kwargs):
            captured_ids.append(json.loads(data)['id'])
            resp = MagicMock()
            resp.json.return_value = {"result": 1, "error": None, "id": captured_ids[-1]}
            return resp

        with patch.object(self.client._session, 'post', side_effect=capture):
            for _ in range(3):
                self.client.rpc_call("getblockcount", [])

        self.assertEqual(len(set(captured_ids)), 3)
        self.assertEqual(captured_ids, sorted(captured_ids))

    # --- estimate_smart_fee -------------------------------------------------

    def test_adds_feerate_sat_per_vb(self):
        def mock_rpc(method, params):
            if method == "estimatesmartfee":
                return {"feerate": 0.0001, "blocks": 2}
            if method == "getblockchaininfo":
                return {"chain": "main", "blocks": 800000}
            if method == "getblockcount":
                return 800000
            if method == "getmempoolfeeratediagram":
                return [{"fee": 0.001, "weight": 100000}]
            if method == "getblockstats":
                return {"height": params[0], "total_weight": 1000000}
            return None

        with patch.object(self.client, 'rpc_call', side_effect=mock_rpc):
            result = self.client.estimate_smart_fee(2, "unset", 2)
        self.assertAlmostEqual(result['feerate_sat_per_vb'], 0.0001 * 100_000)

    def test_feerate_conversion_is_correct(self):
        def mock_rpc(method, params):
            if method == "estimatesmartfee":
                return {"feerate": 1.0, "blocks": 2}
            if method == "getblockchaininfo":
                return {"chain": "main", "blocks": 800000}
            if method == "getblockcount":
                return 800000
            if method == "getmempoolfeeratediagram":
                return [{"fee": 0.001, "weight": 100000}]
            if method == "getblockstats":
                return {"height": params[0], "total_weight": 1000000}
            return None

        with patch.object(self.client, 'rpc_call', side_effect=mock_rpc):
            result = self.client.estimate_smart_fee(2, "unset", 2)
        self.assertAlmostEqual(result['feerate_sat_per_vb'], 100_000.0)

    def test_no_feerate_key_does_not_crash(self):
        def mock_rpc(method, params):
            if method == "estimatesmartfee":
                return {"blocks": 2}
            if method == "getblockchaininfo":
                return {"chain": "main", "blocks": 800000}
            if method == "getblockcount":
                return 800000
            if method == "getmempoolfeeratediagram":
                return []
            return None

        with patch.object(self.client, 'rpc_call', side_effect=mock_rpc):
            result = self.client.estimate_smart_fee(2, "unset", 2)
        self.assertNotIn('feerate_sat_per_vb', result)

    def test_clamps_target_in_rpc_call(self):
        def mock_rpc(method, params):
            if method == "estimatesmartfee":
                return {"feerate": 0.0001}
            if method == "getblockchaininfo":
                return {"chain": "main", "blocks": 800000}
            if method == "getblockcount":
                return 800000
            if method == "getmempoolfeeratediagram":
                return [{"fee": 0.001, "weight": 100000}]
            if method == "getblockstats":
                return {"height": params[0], "total_weight": 1000000}
            return None

        with patch.object(self.client, 'rpc_call', side_effect=mock_rpc) as mock:
            self.client.estimate_smart_fee(1, "unset", 2)
            esf_calls = [c for c in mock.call_args_list if c[0][0] == "estimatesmartfee"]
            self.assertGreater(len(esf_calls), 0)
            params = esf_calls[0][0][1]
            self.assertEqual(params[0], 2)

    # --- get_single_block_stats cache safety --------------------------------

    def test_mutation_does_not_corrupt_cache(self):
        stats = {"height": 800000, "feerate_percentiles": [1, 2, 3, 4, 5]}
        with patch.object(self.client, 'rpc_call', return_value=stats):
            result1 = self.client.get_single_block_stats(800000)
            result1['mutated'] = True

        with patch.object(self.client, 'rpc_call', return_value=stats):
            result2 = self.client.get_single_block_stats(800000)

        self.assertNotIn('mutated', result2)

    def test_second_call_hits_cache(self):
        stats = {"height": 800000, "feerate_percentiles": [1, 2, 3, 4, 5]}
        with patch.object(self.client, 'rpc_call', return_value=stats) as mock:
            self.client.get_single_block_stats(800000)
            self.client.get_single_block_stats(800000)
            mock.assert_called_once()

    # --- get_mempool_feerate_diagram_analysis --------------------------------

    def test_empty_raw_returns_defaults(self):
        with patch.object(self.client, 'rpc_call', return_value=None):
            result = self.client.get_mempool_feerate_diagram_analysis()
        self.assertEqual(result, {"raw": [], "windows": {}})

    def test_diagram_output_structure(self):
        raw_points = [
            {"weight": 1_000_000, "fee": 0.001},
            {"weight": 2_000_000, "fee": 0.002},
            {"weight": 4_000_000, "fee": 0.004},
        ]
        with patch.object(self.client, 'rpc_call', return_value=raw_points):
            result = self.client.get_mempool_feerate_diagram_analysis()

        self.assertEqual(result['total_weight'], 4_000_000)
        self.assertEqual(result['total_fee'], 0.004)
        for window_key in ('1', '2', '3', 'all'):
            self.assertIn(window_key, result['windows'])
        for window in result['windows'].values():
            for p_key in ('5', '25', '50', '75', '95'):
                self.assertIn(p_key, window)

    def test_diagram_feerates_non_negative(self):
        raw_points = [
            {"weight": 500_000, "fee": 0.0005},
            {"weight": 4_000_000, "fee": 0.004},
        ]
        with patch.object(self.client, 'rpc_call', return_value=raw_points):
            result = self.client.get_mempool_feerate_diagram_analysis()

        for window in result['windows'].values():
            for fr in window.values():
                self.assertGreaterEqual(fr, 0)


class TestChainDetection(unittest.TestCase):
    """RpcClient.chain auto-detects the network from getblockchaininfo."""

    def test_detects_all_supported_networks(self):
        cases = [
            ("main", "MAINNET"),
            ("test", "TESTNET"),
            ("testnet4", "TESTNET4"),
            ("signet", "SIGNET"),
            ("regtest", "REGTEST"),
        ]
        for chain, display in cases:
            with self.subTest(chain=chain):
                client = RpcClient("http://test:8332", "u", "p")
                with patch.object(client, 'rpc_call', return_value={"chain": chain, "blocks": 100}):
                    self.assertEqual(client.chain, chain)
                    self.assertEqual(client.chain_display, display)

    def test_chain_is_cached_after_first_access(self):
        client = RpcClient("http://test:8332", "u", "p")
        with patch.object(client, 'rpc_call', return_value={"chain": "signet", "blocks": 0}) as mock:
            _ = client.chain
            _ = client.chain
            rpc_calls = [c for c in mock.call_args_list if c[0][0] == "getblockchaininfo"]
            self.assertEqual(len(rpc_calls), 1)

    def test_estimate_smart_fee_attaches_chain(self):
        client = RpcClient("http://test:8332", "u", "p")

        def mock_rpc(method, params):
            if method == "estimatesmartfee":
                return {"feerate": 0.0001, "blocks": 2}
            if method == "getblockchaininfo":
                return {"chain": "testnet4", "blocks": 100}
            if method == "getblockcount":
                return 100
            if method == "getmempoolfeeratediagram":
                return []
            return None

        with patch.object(client, 'rpc_call', side_effect=mock_rpc):
            result = client.estimate_smart_fee(2)
        self.assertEqual(result['chain'], 'testnet4')
        self.assertEqual(result['chain_display'], 'TESTNET4')


class TestRpcRegistry(unittest.TestCase):

    def test_add_and_get_client(self):
        from services.rpc_service import RpcRegistry
        reg = RpcRegistry()
        client = RpcClient("http://test:8332", "u", "p")
        client._chain = "signet"
        reg.add_client("signet", client)
        self.assertIs(reg.get_client("signet"), client)

    def test_default_chain_is_first_added(self):
        from services.rpc_service import RpcRegistry
        reg = RpcRegistry()
        for name in ("regtest", "signet"):
            c = RpcClient("http://test:8332", "u", "p")
            c._chain = name
            reg.add_client(name, c)
        self.assertEqual(reg.default_chain, "regtest")

    def test_get_unknown_chain_raises(self):
        from services.rpc_service import RpcRegistry
        reg = RpcRegistry()
        c = RpcClient("http://test:8332", "u", "p")
        c._chain = "main"
        reg.add_client("main", c)
        with self.assertRaises(ValueError):
            reg.get_client("fakenet")

    def test_available_chains_includes_display(self):
        from services.rpc_service import RpcRegistry
        reg = RpcRegistry()
        for name in ("signet", "testnet4", "regtest"):
            c = RpcClient("http://test:8332", "u", "p")
            c._chain = name
            reg.add_client(name, c)
        chains = reg.available_chains()
        chain_names = [c['chain'] for c in chains]
        self.assertEqual(chain_names, ["signet", "testnet4", "regtest"])
        displays = [c['chain_display'] for c in chains]
        self.assertEqual(displays, ["SIGNET", "TESTNET4", "REGTEST"])

    def test_contains_and_len(self):
        from services.rpc_service import RpcRegistry
        reg = RpcRegistry()
        c = RpcClient("http://test:8332", "u", "p")
        c._chain = "main"
        reg.add_client("main", c)
        self.assertIn("main", reg)
        self.assertNotIn("signet", reg)
        self.assertEqual(len(reg), 1)


if __name__ == '__main__':
    unittest.main()
