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
                    mode TEXT DEFAULT 'economical',  -- estimatesmartfee mode
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP  -- UTC
                )
            ''')
            # Migration: add block_policy_only column for existing databases.
            try:
                cursor.execute('ALTER TABLE fee_estimates ADD COLUMN block_policy_only INTEGER DEFAULT 0')
            except sqlite3.OperationalError:
                pass  # column already exists
            # Migration: add mode column. Existing rows were collected with
            # estimate_mode "unset", which the node resolves to "economical",
            # so defaulting them to 'economical' is accurate.
            try:
                cursor.execute("ALTER TABLE fee_estimates ADD COLUMN mode TEXT DEFAULT 'economical'")
            except sqlite3.OperationalError:
                pass  # column already exists
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_poll_height ON fee_estimates(poll_height)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_target ON fee_estimates(target)')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_poll_height_target
                ON fee_estimates(poll_height, target)
            ''')
            # Cached all-time accuracy summary, one row per (target, all_time).
            # Written by the primary worker's background job, read by /fees-sum.
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS summary_cache (
                    target INTEGER NOT NULL,
                    all_time INTEGER NOT NULL DEFAULT 1,
                    total INTEGER,
                    within_val INTEGER,
                    overpayment_val INTEGER,
                    underpayment_val INTEGER,
                    computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- UTC
                    PRIMARY KEY (target, all_time)
                )
            ''')
            # Persistent per-block feerate range (p10/p90). Immutable once a
            # block is buried, so cached forever to avoid re-fetching
            # getblockstats on every stats/summary request.
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS block_stats (
                    height INTEGER PRIMARY KEY,
                    low REAL,
                    high REAL
                )
            ''')
            conn.commit()
        logger.info(f"Database initialised at {db_path}")
    except sqlite3.Error as e:
        logger.error(f"Failed to initialise database: {e}", exc_info=True)
        raise


def save_estimate(poll_height, target, feerate, chain="main", block_policy_only: bool = False, mode: str = "economical"):
    expected_height = poll_height + target
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO fee_estimates (poll_height, target, estimate_feerate, expected_height, block_policy_only, mode)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (poll_height, target, feerate, expected_height, int(block_policy_only), mode))
            conn.commit()
        logger.debug(f"Saved estimate: poll_height={poll_height}, target={target}, feerate={feerate}, block_policy_only={block_policy_only}, mode={mode}, chain={chain}")
    except sqlite3.Error as e:
        logger.error(f"Failed to save estimate (poll_height={poll_height}, target={target}): {e}", exc_info=True)
        raise


def get_estimates_in_range(start_height, end_height, target=2, chain="main", block_policy_only: bool = False, enforce_cap: bool = True, mode: str = "economical"):
    # enforce_cap=False is used only by the background all-time summary job,
    # which legitimately scans the full history; request paths keep the cap.
    if enforce_cap and end_height - start_height > MAX_RANGE_BLOCKS:
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
                    WHERE poll_height >= ? AND poll_height <= ? AND target = ? AND block_policy_only = ? AND mode = ?
                )
                WHERE rn = 1
                ORDER BY poll_height ASC
            ''', (start_height, end_height, target, int(block_policy_only), mode))
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


def save_summary(chain="main", target=2, result=None, all_time: bool = True):
    """Upsert a precomputed accuracy summary for (target, all_time)."""
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            conn.execute('''
                INSERT INTO summary_cache
                    (target, all_time, total, within_val, overpayment_val, underpayment_val, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(target, all_time) DO UPDATE SET
                    total=excluded.total,
                    within_val=excluded.within_val,
                    overpayment_val=excluded.overpayment_val,
                    underpayment_val=excluded.underpayment_val,
                    computed_at=excluded.computed_at
            ''', (
                target, int(all_time),
                result["total"], result["within_val"],
                result["overpayment_val"], result["underpayment_val"],
            ))
            conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Failed to save summary (target={target}): {e}", exc_info=True)
        raise


def save_block_ranges(chain, ranges):
    """Persist {height: (low, high)} feerate ranges. No-op on empty input."""
    if not ranges:
        return
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            conn.executemany(
                'INSERT OR REPLACE INTO block_stats (height, low, high) VALUES (?, ?, ?)',
                [(h, lo, hi) for h, (lo, hi) in ranges.items()],
            )
            conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Failed to save block ranges: {e}", exc_info=True)
        raise


def get_block_ranges(chain, heights):
    """Return {height: (low, high)} for cached heights (missing ones omitted)."""
    heights = list(heights)
    if not heights:
        return {}
    db_path = get_db_path(chain)
    out = {}
    try:
        with _connect(db_path) as conn:
            cur = conn.cursor()
            CHUNK = 900  # stay under SQLite's variable limit
            for i in range(0, len(heights), CHUNK):
                chunk = heights[i:i + CHUNK]
                placeholders = ','.join('?' * len(chunk))
                cur.execute(
                    f'SELECT height, low, high FROM block_stats WHERE height IN ({placeholders})',
                    chunk,
                )
                for h, lo, hi in cur.fetchall():
                    out[h] = (lo, hi)
    except sqlite3.Error as e:
        logger.error(f"Failed to get block ranges: {e}", exc_info=True)
        raise
    return out


def get_summary(chain="main", target=2, all_time: bool = True):
    """Return the cached summary dict for (target, all_time), or None if absent."""
    db_path = get_db_path(chain)
    try:
        with _connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                'SELECT * FROM summary_cache WHERE target = ? AND all_time = ?',
                (target, int(all_time)),
            )
            row = cur.fetchone()
    except sqlite3.Error as e:
        logger.error(f"Failed to get summary (target={target}): {e}", exc_info=True)
        raise

    if not row:
        return None
    total = row["total"] or 0
    return {
        "total": total,
        "within_val": row["within_val"],
        "within_perc": (row["within_val"] / total) if total else 0,
        "overpayment_val": row["overpayment_val"],
        "overpayment_perc": (row["overpayment_val"] / total) if total else 0,
        "underpayment_val": row["underpayment_val"],
        "underpayment_perc": (row["underpayment_val"] / total) if total else 0,
        "all_time": bool(row["all_time"]),
        "computed_at": row["computed_at"],
    }
