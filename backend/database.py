# hey what do u think of having database??


import sqlite3

DATABASE_NAME = 'fee_analysis.db'

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
    conn.commit()
    conn.close()

def insert_analysis(block_height, min_feerate, max_feerate, predicted_feerate, forecaster_name="OurModelV1"):
    """Inserts one record of block analysis into the database."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT OR IGNORE INTO fee_analysis (block_height, min_feerate, max_feerate, predicted_feerate, forecaster_name)
            VALUES (?, ?, ?, ?, ?)
        """, (block_height, min_feerate, max_feerate, predicted_feerate, forecaster_name))
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

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
