import unittest
from unittest.mock import patch
from helpers import make_app


class TestApp(unittest.TestCase):

    def setUp(self):
        self.client = make_app().test_client()

    # --- /blockcount --------------------------------------------------------

    @patch('services.rpc_service.get_block_count', return_value=800000)
    def test_block_count_success(self, _):
        r = self.client.get('/blockcount')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json['blockcount'], 800000)

    @patch('services.rpc_service.get_block_count', side_effect=RuntimeError("node down"))
    def test_block_count_error_does_not_leak(self, _):
        r = self.client.get('/blockcount')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('node down', r.json.get('error', ''))

    # --- /fees/<target>/<mode>/<level> --------------------------------------

    @patch('services.rpc_service.estimate_smart_fee', return_value={"feerate": 0.0001, "blocks": 2})
    def test_fees_success(self, _):
        r = self.client.get('/fees/2/economical/2')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json['feerate'], 0.0001)

    def test_fees_all_valid_modes_accepted(self):
        for mode in ('economical', 'conservative', 'unset'):
            with patch('services.rpc_service.estimate_smart_fee', return_value={"feerate": 0.0001}):
                r = self.client.get(f'/fees/2/{mode}/2')
                self.assertEqual(r.status_code, 200, msg=f"Mode '{mode}' should be accepted")

    def test_fees_invalid_mode_returns_400(self):
        r = self.client.get('/fees/2/BADMODE/2')
        self.assertEqual(r.status_code, 400)
        self.assertIn('error', r.json)

    @patch('services.rpc_service.estimate_smart_fee', side_effect=RuntimeError("rpc error"))
    def test_fees_rpc_error_does_not_leak(self, _):
        r = self.client.get('/fees/2/economical/2')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('rpc error', r.json.get('error', ''))

    # --- /mempool-diagram ---------------------------------------------------

    @patch('services.rpc_service.get_mempool_feerate_diagram_analysis', return_value={
        "raw": [], "windows": {}, "total_weight": 0, "total_fee": 0
    })
    def test_mempool_diagram_success(self, _):
        r = self.client.get('/mempool-diagram')
        self.assertEqual(r.status_code, 200)
        self.assertIn('raw', r.json)
        self.assertIn('windows', r.json)

    @patch('services.rpc_service.get_mempool_feerate_diagram_analysis', side_effect=RuntimeError("fail"))
    def test_mempool_diagram_error_does_not_leak(self, _):
        r = self.client.get('/mempool-diagram')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('fail', r.json.get('error', ''))

    # --- /performance-data/<start_block> ------------------------------------

    @patch('services.rpc_service.get_performance_data', return_value={
        "blocks": [{"height": 800000, "low": 5, "high": 20}],
        "estimates": [{"height": 800000, "rate": 10.0}]
    })
    def test_performance_data_success(self, _):
        r = self.client.get('/performance-data/800000/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('blocks', r.json)
        self.assertIn('estimates', r.json)

    def test_performance_data_passes_target_query_param(self):
        with patch('services.rpc_service.get_performance_data', return_value={"blocks": [], "estimates": []}) as mock:
            self.client.get('/performance-data/800000/?target=7')
            mock.assert_called_once_with(start_height=800000, count=100, target=7)

    @patch('services.rpc_service.get_performance_data', side_effect=RuntimeError("db fail"))
    def test_performance_data_error_does_not_leak(self, _):
        r = self.client.get('/performance-data/800000/')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('db fail', r.json.get('error', ''))

    # --- /fees-sum/<start_block> --------------------------------------------

    @patch('services.rpc_service.calculate_local_summary', return_value={
        "total": 100, "within_val": 85, "within_perc": 0.85,
        "overpayment_val": 10, "overpayment_perc": 0.1,
        "underpayment_val": 5, "underpayment_perc": 0.05,
    })
    def test_fees_sum_success(self, _):
        r = self.client.get('/fees-sum/800000/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json['within_perc'], 0.85)
        for key in ('total', 'within_val', 'within_perc', 'overpayment_val',
                    'overpayment_perc', 'underpayment_val', 'underpayment_perc'):
            self.assertIn(key, r.json, msg=f"Missing key: {key}")

    def test_fees_sum_passes_target_query_param(self):
        with patch('services.rpc_service.calculate_local_summary', return_value={"total": 0}) as mock:
            self.client.get('/fees-sum/800000/?target=144')
            mock.assert_called_once_with(target=144)

    @patch('services.rpc_service.calculate_local_summary', side_effect=RuntimeError("summary fail"))
    def test_fees_sum_error_does_not_leak(self, _):
        r = self.client.get('/fees-sum/800000/')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('summary fail', r.json.get('error', ''))

    # --- Error handlers -----------------------------------------------------

    def test_404_returns_json(self):
        r = self.client.get('/nonexistent-route')
        self.assertEqual(r.status_code, 404)
        self.assertIn('error', r.json)


if __name__ == '__main__':
    unittest.main()
