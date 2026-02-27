import importlib
import json
import unittest
from unittest.mock import MagicMock, patch


class TestRpcService(unittest.TestCase):

    def setUp(self):
        # Reload module each time so lru_cache and counters start fresh
        import services.rpc_service as rpc
        importlib.reload(rpc)
        self.rpc = rpc

    def _mock_post(self, result=None, error=None):
        mock_response = MagicMock()
        mock_response.json.return_value = {"result": result, "error": error, "id": 1}
        return MagicMock(return_value=mock_response)

    # --- _clamp_target ------------------------------------------------------

    def test_clamp_target_below_2(self):
        self.assertEqual(self.rpc._clamp_target(1), 2)
        self.assertEqual(self.rpc._clamp_target(0), 2)
        self.assertEqual(self.rpc._clamp_target(-5), 2)

    def test_clamp_target_at_or_above_2(self):
        self.assertEqual(self.rpc._clamp_target(2), 2)
        self.assertEqual(self.rpc._clamp_target(7), 7)
        self.assertEqual(self.rpc._clamp_target(144), 144)

    # --- _rpc_call ----------------------------------------------------------

    def test_rpc_call_success(self):
        with patch.object(self.rpc._session, 'post', self._mock_post(result=42)):
            self.assertEqual(self.rpc._rpc_call("getblockcount", []), 42)

    def test_rpc_call_rpc_error_raises(self):
        with patch.object(self.rpc._session, 'post', self._mock_post(error={"code": -1, "message": "bad"})):
            with self.assertRaises(RuntimeError) as ctx:
                self.rpc._rpc_call("getblockcount", [])
            self.assertIn("RPC Error", str(ctx.exception))

    def test_rpc_call_transport_error_does_not_leak_details(self):
        mock_post = MagicMock(side_effect=ConnectionError("refused"))
        with patch.object(self.rpc._session, 'post', mock_post):
            with self.assertRaises(RuntimeError) as ctx:
                self.rpc._rpc_call("getblockcount", [])
            self.assertNotIn('refused', str(ctx.exception))

    def test_rpc_call_uses_incrementing_ids(self):
        captured_ids = []

        def capture(url, data, **kwargs):
            captured_ids.append(json.loads(data)['id'])
            resp = MagicMock()
            resp.json.return_value = {"result": 1, "error": None, "id": captured_ids[-1]}
            return resp

        with patch.object(self.rpc._session, 'post', side_effect=capture):
            for _ in range(3):
                self.rpc._rpc_call("getblockcount", [])

        self.assertEqual(len(set(captured_ids)), 3)
        self.assertEqual(captured_ids, sorted(captured_ids))

    # --- estimate_smart_fee -------------------------------------------------

    def test_adds_feerate_sat_per_vb(self):
        with patch.object(self.rpc, '_rpc_call', return_value={"feerate": 0.0001, "blocks": 2}):
            result = self.rpc.estimate_smart_fee(2, "unset", 2)
        self.assertAlmostEqual(result['feerate_sat_per_vb'], 0.0001 * 100_000)

    def test_feerate_conversion_is_correct(self):
        # 1 BTC/kVB = 100_000 sat/vB
        with patch.object(self.rpc, '_rpc_call', return_value={"feerate": 1.0, "blocks": 2}):
            result = self.rpc.estimate_smart_fee(2, "unset", 2)
        self.assertAlmostEqual(result['feerate_sat_per_vb'], 100_000.0)

    def test_no_feerate_key_does_not_crash(self):
        with patch.object(self.rpc, '_rpc_call', return_value={"blocks": 2}):
            result = self.rpc.estimate_smart_fee(2, "unset", 2)
        self.assertNotIn('feerate_sat_per_vb', result)

    def test_clamps_target_in_rpc_call(self):
        with patch.object(self.rpc, '_rpc_call', return_value={"feerate": 0.0001}) as mock:
            self.rpc.estimate_smart_fee(1, "unset", 2)
            self.assertEqual(mock.call_args[0][1][0], 2)  # params[0] should be 2

    # --- get_single_block_stats cache safety --------------------------------

    def test_mutation_does_not_corrupt_cache(self):
        stats = {"height": 800000, "feerate_percentiles": [1, 2, 3, 4, 5]}
        with patch.object(self.rpc, '_rpc_call', return_value=stats):
            result1 = self.rpc.get_single_block_stats(800000)
            result1['mutated'] = True

        with patch.object(self.rpc, '_rpc_call', return_value=stats):
            result2 = self.rpc.get_single_block_stats(800000)

        self.assertNotIn('mutated', result2)

    def test_second_call_hits_cache(self):
        stats = {"height": 800000, "feerate_percentiles": [1, 2, 3, 4, 5]}
        with patch.object(self.rpc, '_rpc_call', return_value=stats) as mock:
            self.rpc.get_single_block_stats(800000)
            self.rpc.get_single_block_stats(800000)
            mock.assert_called_once()

    # --- get_mempool_feerate_diagram_analysis --------------------------------

    def test_empty_raw_returns_defaults(self):
        with patch.object(self.rpc, '_rpc_call', return_value=None):
            result = self.rpc.get_mempool_feerate_diagram_analysis()
        self.assertEqual(result, {"raw": [], "windows": {}})

    def test_diagram_output_structure(self):
        raw_points = [
            {"weight": 1_000_000, "fee": 0.001},
            {"weight": 2_000_000, "fee": 0.002},
            {"weight": 4_000_000, "fee": 0.004},
        ]
        with patch.object(self.rpc, '_rpc_call', return_value=raw_points):
            result = self.rpc.get_mempool_feerate_diagram_analysis()

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
        with patch.object(self.rpc, '_rpc_call', return_value=raw_points):
            result = self.rpc.get_mempool_feerate_diagram_analysis()

        for window in result['windows'].values():
            for fr in window.values():
                self.assertGreaterEqual(fr, 0)


if __name__ == '__main__':
    unittest.main()
