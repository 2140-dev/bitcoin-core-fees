import os
import sqlite3
import tempfile
import unittest


class TestDatabaseService(unittest.TestCase):

    def setUp(self):
        """Each test gets its own isolated temporary SQLite DB."""
        self.tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.tmp.close()

        import services.database_service as db
        self._orig_path = db.DB_PATH
        db.DB_PATH = self.tmp.name
        self.db = db
        self.db.init_db()

    def tearDown(self):
        self.db.DB_PATH = self._orig_path
        os.unlink(self.tmp.name)

    # --- init_db ------------------------------------------------------------

    def test_creates_table(self):
        conn = sqlite3.connect(self.tmp.name)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fee_estimates'")
        self.assertIsNotNone(cursor.fetchone())
        conn.close()

    def test_creates_all_indexes(self):
        conn = sqlite3.connect(self.tmp.name)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        index_names = {row[0] for row in cursor.fetchall()}
        conn.close()
        self.assertIn('idx_poll_height', index_names)
        self.assertIn('idx_target', index_names)
        self.assertIn('idx_poll_height_target', index_names)

    def test_is_idempotent(self):
        try:
            self.db.init_db()
            self.db.init_db()
        except Exception as e:
            self.fail(f"init_db raised on repeated call: {e}")

    # --- save_estimate / get_estimates_in_range -----------------------------

    def test_save_and_retrieve(self):
        self.db.save_estimate(poll_height=800000, target=2, feerate=15.5)
        rows = self.db.get_estimates_in_range(800000, 800000, target=2)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['poll_height'], 800000)
        self.assertAlmostEqual(rows[0]['estimate_feerate'], 15.5)

    def test_expected_height_computed_correctly(self):
        self.db.save_estimate(poll_height=800000, target=7, feerate=10.0)
        conn = sqlite3.connect(self.tmp.name)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT expected_height FROM fee_estimates WHERE poll_height=800000')
        row = cursor.fetchone()
        conn.close()
        self.assertEqual(row['expected_height'], 800007)

    def test_filters_by_target(self):
        self.db.save_estimate(800000, target=2, feerate=10.0)
        self.db.save_estimate(800000, target=7, feerate=20.0)
        self.db.save_estimate(800000, target=144, feerate=5.0)

        self.assertAlmostEqual(self.db.get_estimates_in_range(800000, 800000, target=2)[0]['estimate_feerate'], 10.0)
        self.assertAlmostEqual(self.db.get_estimates_in_range(800000, 800000, target=7)[0]['estimate_feerate'], 20.0)
        self.assertAlmostEqual(self.db.get_estimates_in_range(800000, 800000, target=144)[0]['estimate_feerate'], 5.0)

    def test_range_is_inclusive(self):
        for h in (800000, 800001, 800002):
            self.db.save_estimate(h, target=2, feerate=10.0)
        rows = self.db.get_estimates_in_range(800000, 800002, target=2)
        heights = [r['poll_height'] for r in rows]
        self.assertIn(800000, heights)
        self.assertIn(800001, heights)
        self.assertIn(800002, heights)

    def test_empty_range_returns_empty_list(self):
        rows = self.db.get_estimates_in_range(999999, 1000000, target=2)
        self.assertEqual(len(rows), 0)

    def test_oversized_range_does_not_raise(self):
        try:
            self.db.get_estimates_in_range(0, self.db.MAX_RANGE_BLOCKS * 100, target=2)
        except Exception as e:
            self.fail(f"Oversized range raised unexpectedly: {e}")

    def test_results_ordered_by_poll_height(self):
        for h in (800002, 800000, 800001):
            self.db.save_estimate(h, target=2, feerate=float(h))
        rows = self.db.get_estimates_in_range(800000, 800002, target=2)
        heights = [r['poll_height'] for r in rows]
        self.assertEqual(heights, sorted(heights))

    def test_multiple_saves_same_height_stored(self):
        for feerate in (10.0, 11.0, 12.0):
            self.db.save_estimate(800000, target=2, feerate=feerate)
        rows = self.db.get_estimates_in_range(800000, 800000, target=2)
        self.assertGreaterEqual(len(rows), 1)

    # --- get_db_height_range ------------------------------------------------

    def test_height_range_empty_db(self):
        row = self.db.get_db_height_range(target=2)
        self.assertIsNone(row[0])
        self.assertIsNone(row[1])

    def test_height_range_returns_min_max(self):
        for h in (800000, 800100, 800050):
            self.db.save_estimate(h, target=2, feerate=10.0)
        row = self.db.get_db_height_range(target=2)
        self.assertEqual(row[0], 800000)
        self.assertEqual(row[1], 800100)

    def test_height_range_respects_target(self):
        self.db.save_estimate(800000, target=2, feerate=10.0)
        self.db.save_estimate(800500, target=7, feerate=10.0)

        row_t2 = self.db.get_db_height_range(target=2)
        self.assertEqual(row_t2[0], 800000)
        self.assertEqual(row_t2[1], 800000)

        row_t7 = self.db.get_db_height_range(target=7)
        self.assertEqual(row_t7[0], 800500)
        self.assertEqual(row_t7[1], 800500)


if __name__ == '__main__':
    unittest.main()
