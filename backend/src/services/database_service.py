import sqlite3
import os
import logging

logger = logging.getLogger(__name__)

_BASE_DB_DIR = os.environ.get(
    "DB_DIR",
    os.path.dirname(os.path.abspath(__file__))
)

DB_FILENAME = "fee_analysis.db"

MAX_RANGE_BLOCKS = 10_000  # safety cap on get_estimates_in_range

# Seconds to wait when the database is locked by another process/thread.
_BUSY_TIMEOUT_SECONDS = 10


def _connect(db_path: str) -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and a busy timeout.

    WAL (Write-Ahead Logging) allows concurrent readers while a writer holds
    the lock.  The busy timeout makes writers/readers retry instead of raising
    ``database is locked`` immediately.
    """
    conn = sqlite3.connect(db_path, timeout=_BUSY_TIMEOUT_SECONDS)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

# Bitcoin Core–style subdirectories per network
CHAIN_DIR_MAP = {
    "main": "",
    "test": "testnet3",
    "testnet4": "testnet4",
    "signet": "signet",
    "regtest": "regtest",
}


def get_db_path(chain: str = "main") -> str:
    """Return the DB file path for the given chain (pure lookup, no side effects)."""
    subdir = CHAIN_DIR_MAP.get(chain, chain)
    directory = os.path.join(_BASE_DB_DIR, subdir) if subdir else _BASE_DB_DIR
    return os.path.join(directory, DB_FILENAME)


def init_db(chain: str = "main"):
    db_path = get_db_path(chain)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    try:
        with _connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS fee_estimates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    poll_height INTEGER,
                    target INTEGER,
                    estimate_feerate REAL,
                    expected_height INTEGER,
                    block_policy_only INTEGER DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP  -- UTC
                )
            ''')
            # Migration: add block_policy_only column for existing databases.
            try:
                cursor.execute('ALTER TABLE fee_estimates ADD COLUMN block_policy_only INTEGER DEFAULT 0')
            except sqlite3.OperationalError:
                pass  # column already exists
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_poll_height ON fee_estimates(poll_height)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_target ON fee_estimates(target)')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_poll_height_target
                ON fee_estimates(poll_height, target)
            ''')
            conn.commit()
        logger.info(f"Database initialised at {db_path}")
    except sqlite3.Error as e:
        logger.error(f"Failed to initialise database: {e}", exc_info=True)
        raise


def save_estimate(poll_height, target, feerate, chain="main", block_policy_only: bool = False):
    expected_height = poll_height + target
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO fee_estimates (poll_height, target, estimate_feerate, expected_height, block_policy_only)
                VALUES (?, ?, ?, ?, ?)
            ''', (poll_height, target, feerate, expected_height, int(block_policy_only)))
            conn.commit()
        logger.debug(f"Saved estimate: poll_height={poll_height}, target={target}, feerate={feerate}, block_policy_only={block_policy_only}, chain={chain}")
    except sqlite3.Error as e:
        logger.error(f"Failed to save estimate (poll_height={poll_height}, target={target}): {e}", exc_info=True)
        raise


def get_estimates_in_range(start_height, end_height, target=2, chain="main", block_policy_only: bool = False):
    if end_height - start_height > MAX_RANGE_BLOCKS:
        logger.warning(
            f"Requested range [{start_height}, {end_height}] exceeds MAX_RANGE_BLOCKS={MAX_RANGE_BLOCKS}. Clamping."
        )
        end_height = start_height + MAX_RANGE_BLOCKS

    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT poll_height, target, estimate_feerate, expected_height
                FROM (
                    SELECT poll_height, target, estimate_feerate, expected_height,
                           ROW_NUMBER() OVER (
                               PARTITION BY poll_height, target ORDER BY timestamp ASC, id ASC
                           ) AS rn
                    FROM fee_estimates
                    WHERE poll_height >= ? AND poll_height <= ? AND target = ? AND block_policy_only = ?
                )
                WHERE rn = 1
                ORDER BY poll_height ASC
            ''', (start_height, end_height, target, int(block_policy_only)))
            rows = cursor.fetchall()

        if not rows:
            logger.debug(f"No estimates found in range [{start_height}, {end_height}] for target={target}")

        return rows
    except sqlite3.Error as e:
        logger.error(f"Failed to query estimates in range: {e}", exc_info=True)
        raise


def get_db_height_range(target=2, chain="main"):
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT MIN(poll_height), MAX(poll_height) FROM fee_estimates WHERE target = ?',
                (target,)
            )
            row = cursor.fetchone()

        if row and row[0] is None:
            logger.debug(f"No data in DB for target={target}")

        return row
    except sqlite3.Error as e:
        logger.error(f"Failed to get DB height range: {e}", exc_info=True)
        raise
