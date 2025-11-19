import sqlite3
from typing import List, Optional, Dict, Any

DATABASE_NAME = 'fee_analysis.db'

PERCENTILE_COLUMNS = [
    ("p10_feerate", "REAL"),
    ("p25_feerate", "REAL"),
    ("p50_feerate", "REAL"),
    ("p75_feerate", "REAL"),
    ("p90_feerate", "REAL"),
    ("block_coverage", "REAL"),
    ("high_fee_incl_ratio", "REAL"),
]

def init_db():
    """Initializes the SQLite database and creates the fee_analysis table."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    
    # Create the table to store historical data:
    # 1. block_height: Primary key
    # 2. min_feerate: Actual minimum feerate of a transaction in the block (sat/vB)
    # 3. max_feerate: Actual maximum feerate of a transaction in the block (sat/vB)
    # 4. predicted_feerate: Our model's prediction for the ASAP feerate (sat/vB)
    # 5. forecaster_name: Allows comparison of multiple models
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fee_analysis (
            block_height INTEGER PRIMARY KEY,
            min_feerate REAL NOT NULL,
            max_feerate REAL NOT NULL,
            predicted_feerate REAL NOT NULL,
            forecaster_name TEXT NOT NULL
        )
    """)

    # Ensure percentile columns exist for newer analytics
    cursor.execute("PRAGMA table_info(fee_analysis)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    for column_name, column_type in PERCENTILE_COLUMNS:
        if column_name not in existing_columns:
            cursor.execute(f"ALTER TABLE fee_analysis ADD COLUMN {column_name} {column_type}")

    conn.commit()
    conn.close()

def insert_analysis(
    block_height: int,
    min_feerate: float,
    max_feerate: float,
    predicted_feerate: float,
    forecaster_name: str = "OurModelV1",
    percentiles: Optional[List[Optional[float]]] = None,
    block_coverage: Optional[float] = None,
    high_fee_incl_ratio: Optional[float] = None,
):
    """Inserts one record of block analysis into the database."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    try:
        p10 = p25 = p50 = p75 = p90 = None
        if percentiles:
            if len(percentiles) >= 1:
                p10 = percentiles[0]
            if len(percentiles) >= 2:
                p25 = percentiles[1]
            if len(percentiles) >= 3:
                p50 = percentiles[2]
            if len(percentiles) >= 4:
                p75 = percentiles[3]
            if len(percentiles) >= 5:
                p90 = percentiles[4]

        cursor.execute("""
            INSERT OR IGNORE INTO fee_analysis (
                block_height,
                min_feerate,
                max_feerate,
                predicted_feerate,
                forecaster_name,
                p10_feerate,
                p25_feerate,
                p50_feerate,
                p75_feerate,
                p90_feerate,
                block_coverage,
                high_fee_incl_ratio
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            block_height,
            min_feerate,
            max_feerate,
            predicted_feerate,
            forecaster_name,
            p10,
            p25,
            p50,
            p75,
            p90,
            block_coverage,
            high_fee_incl_ratio,
        ))
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database Error on insert: {e}")
    finally:
        conn.close()

def fetch_analysis_range(start_height, end_height, forecaster_name="OurModelV1"):
    """Fetches all necessary data for a given block range."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    

    cursor.execute("""
        SELECT block_height, min_feerate, max_feerate, predicted_feerate
        FROM fee_analysis
        WHERE block_height <= ? AND block_height > ? AND forecaster_name = ?
        ORDER BY block_height DESC
    """, (start_height, end_height, forecaster_name))
    
    results = cursor.fetchall()
    conn.close()
    return results

def fetch_recent_analysis(limit: int = 1000, forecaster_name: str = "OurModelV1") -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            block_height,
            min_feerate,
            max_feerate,
            predicted_feerate,
            p10_feerate,
            p25_feerate,
            p50_feerate,
            p75_feerate,
            p90_feerate,
            block_coverage,
            high_fee_incl_ratio
        FROM fee_analysis
        WHERE forecaster_name = ?
        ORDER BY block_height DESC
        LIMIT ?
    """, (forecaster_name, limit))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "block_height": row[0],
            "min_feerate": row[1],
            "max_feerate": row[2],
            "predicted_feerate": row[3],
            "p10_feerate": row[4],
            "p25_feerate": row[5],
            "p50_feerate": row[6],
            "p75_feerate": row[7],
            "p90_feerate": row[8],
            "block_coverage": row[9],
            "high_fee_incl_ratio": row[10],
        }
        for row in rows
    ]

def compute_summary(limit: int = 1000, forecaster_name: str = "OurModelV1") -> Dict[str, Any]:
    rows = fetch_recent_analysis(limit=limit, forecaster_name=forecaster_name)
    if not rows:
        return {
            "forecaster": forecaster_name,
            "total": 0,
            "overpayment_val": 0,
            "overpayment_perc": 0.0,
            "underpayment_val": 0,
            "underpayment_perc": 0.0,
            "within_val": 0,
            "within_perc": 0.0,
            "lower_bound_label": "p25",
            "upper_bound_label": "p75",
            "window": limit,
            "avg_block_coverage": None,
            "avg_high_fee_incl_ratio": None,
        }

    lower_bound_key = "p25_feerate"
    upper_bound_key = "p75_feerate"

    overpaid = underpaid = within = 0
    sample_size = 0

    coverage_vals: List[float] = []
    high_fee_incl_vals: List[float] = []
    for row in rows:
        predicted = row.get("predicted_feerate")
        lower_bound = row.get(lower_bound_key) or row.get("min_feerate")
        upper_bound = row.get(upper_bound_key) or row.get("max_feerate")
        cov = row.get("block_coverage")
        if cov is not None:
            coverage_vals.append(cov)
        hf = row.get("high_fee_incl_ratio")
        if hf is not None:
            high_fee_incl_vals.append(hf)

        if predicted is None or lower_bound is None or upper_bound is None:
            continue

        sample_size += 1
        if predicted > upper_bound:
            overpaid += 1
        elif predicted < lower_bound:
            underpaid += 1
        else:
            within += 1

    if sample_size == 0:
        sample_size = len(rows)

    def perc(value: int) -> float:
        if sample_size == 0:
            return 0.0
        return round((value / sample_size) * 100.0, 2)

    return {
        "forecaster": forecaster_name,
        "total": sample_size,
        "overpayment_val": overpaid,
        "overpayment_perc": perc(overpaid),
        "underpayment_val": underpaid,
        "underpayment_perc": perc(underpaid),
        "within_val": within,
        "within_perc": perc(within),
        "lower_bound_label": "p25",
        "upper_bound_label": "p75",
        "window": limit,
        "avg_block_coverage": round(sum(coverage_vals) / len(coverage_vals), 4) if coverage_vals else None,
        "avg_high_fee_incl_ratio": round(sum(high_fee_incl_vals) / len(high_fee_incl_vals), 4) if high_fee_incl_vals else None,
    }

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
