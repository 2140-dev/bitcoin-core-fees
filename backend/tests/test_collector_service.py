import fcntl
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch, MagicMock

import services.database_service as db_service
import services.collector_service as collector_service


class TestCollectorFileLock(unittest.TestCase):
    """Only one process should start collector threads."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self._orig_base_dir = db_service._BASE_DB_DIR
        db_service._BASE_DB_DIR = self.tmpdir
        db_service.init_db()

        # Reset module-level state between tests.
        collector_service._collectors_started = False
        if collector_service._lock_fd is not None:
            collector_service._lock_fd.close()
            collector_service._lock_fd = None

    def tearDown(self):
        db_service._BASE_DB_DIR = self._orig_base_dir
        if collector_service._lock_fd is not None:
            collector_service._lock_fd.close()
            collector_service._lock_fd = None
        collector_service._collectors_started = False
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    @patch('services.collector_service.rpc_service')
    def test_first_caller_acquires_lock_and_starts(self, mock_rpc):
        mock_rpc.registry.chains.return_value = ["main"]
        collector_service.start_background_collectors()
        self.assertTrue(collector_service._collectors_started)
        self.assertIsNotNone(collector_service._lock_fd)

    @patch('services.collector_service.rpc_service')
    def test_second_caller_skips_when_lock_held(self, mock_rpc):
        mock_rpc.registry.chains.return_value = ["main"]

        # Simulate another process holding the lock.
        lock_path = db_service.get_db_path("main") + ".collector.lock"
        os.makedirs(os.path.dirname(lock_path), exist_ok=True)
        held_fd = open(lock_path, "w")
        fcntl.flock(held_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

        try:
            collector_service.start_background_collectors()
            self.assertFalse(collector_service._collectors_started)
        finally:
            held_fd.close()

    @patch('services.collector_service.rpc_service')
    def test_already_started_guard_still_works(self, mock_rpc):
        mock_rpc.registry.chains.return_value = ["main"]
        collector_service.start_background_collectors()
        self.assertTrue(collector_service._collectors_started)

        # Second call within same process — guarded by _collectors_started.
        collector_service.start_background_collectors()  # should not raise


if __name__ == '__main__':
    unittest.main()
