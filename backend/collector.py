import time
import random
import os
from database import init_db, insert_analysis
from json_rpc_request import (
    get_block_count, 
    get_block_tx_details, 
    get_raw_mempool, 
    get_block_template, 
    get_estimated_fee_rate_satvb
)

# Configuration for the collector loop
COLLECTOR_SLEEP_TIME = 30  # for a new block every 30 seconds
LAST_PROCESSED_HEIGHT = 0
INITIAL_HISTORY_DEPTH = 1000 # The number of blocks to fetch initially

# custom fee logic

def get_custom_fee_prediction_asap() -> float:
    """
    CRITICAL: This is the placeholder where your custom, robust fee estimation 
    logic must be implemented. It should use the latest RPC data to make a prediction.
    
    Returns: A single ASAP feerate prediction in sat/vB.
    """
    try:
        # 1. Fetch real-time data from the node
        # These are available for your custom logic:
        # mempool_data = get_raw_mempool(verbose=False) 
        # block_template = get_block_template() 

        #  A SIMPLE, TEMPORARY MODEL BASED ON Core's 1-Block Estimate 
        # REPLACE THIS WITH YOUR CUSTOM LOGIC (Feerate Bucketing, Resting Time Analysis, etc.)
        
        # We use Core's estimate as a reliable temporary proxy for demonstration
        core_estimate = get_estimated_fee_rate_satvb(conf_target=1, mode='conservative')
        predicted_fee = core_estimate.get('feerate_sat_per_vb')

        if predicted_fee is None or predicted_fee < 1.0:
            # Fallback for when estimatesmartfee fails
            print("Warning: estimatesmartfee failed. Using a random prediction.")
            return round(random.uniform(5.0, 15.0), 2)
        
        # Add a small random jitter to simulate a model slightly different from Core
        jitter = random.uniform(-0.5, 1.5)
        return max(1.0, predicted_fee + jitter)
        
    except Exception as e:
        print(f"Prediction Error: {e}. Returning fallback fee.")
        return 10.0 # Safe fallback fee

# block processing 

def process_block(height: int):
    """
    Fetches actual block data, runs prediction, and stores the result.
    """
    try:
        # 1. Run the Prediction Logic (What would we have predicted for this block?)
        # Since we are processing blocks sequentially, we use the current prediction 
        # as a proxy for the prediction we would have made just before the block was found.
        predicted_fee = get_custom_fee_prediction_asap()

        # 2. Get Actuals (Ground Truth) for the MINED block
        block_details = get_block_tx_details(height)
        
        if block_details and block_details.get('min_fee') is not None:
            min_fee = block_details['min_fee']
            max_fee = block_details['max_fee']
            
            # 3. Store the result
            insert_analysis(height, min_fee, max_fee, predicted_fee)
            print(f"[COLLECTOR] Processed Block {height}: Actual Min={min_fee}, Predicted={predicted_fee}")
            return True
        else:
            # This happens if the block is still being processed or is empty/invalid
            print(f"[COLLECTOR] Skipped Block {height}: No valid fee details found.")
            return False
            
    except Exception as e:
        print(f"[COLLECTOR] Error processing block {height}: {e}")
        return False

def run_collector_cycle(initial_population: bool = False):
    """
    Executes one cycle: detects and processes new blocks since the last check.
    """
    global LAST_PROCESSED_HEIGHT
    
    current_height = get_block_count()
    if current_height is None:
        return

    if LAST_PROCESSED_HEIGHT == 0:
        # On first run, set the last processed height to the current height minus one
        LAST_PROCESSED_HEIGHT = current_height - 1 

    
    if initial_population:
        # For initial run, process a large range of historical blocks
        start_height = max(1, current_height - INITIAL_HISTORY_DEPTH)
        print(f"\n[COLLECTOR] Starting initial population from Block {start_height} to {current_height}...")
    else:
        # For continuous run, process only new blocks
        start_height = LAST_PROCESSED_HEIGHT + 1
        
    
    blocks_to_process = range(start_height, current_height + 1)
    
    for height in blocks_to_process:
        if height > LAST_PROCESSED_HEIGHT:
            if process_block(height):
                LAST_PROCESSED_HEIGHT = height
        else:
             # Skip blocks already processed during initial population
             continue


def start_collector():
    """Main function to run the collector indefinitely."""
    print("--- Starting Fee Estimation Collector ---")
    
    # 1. Initial Historical Population (fills the database)
    run_collector_cycle(initial_population=True)
    
    print("\nInitial historical population complete. Monitoring for new blocks...")
    
    # 2. Continuous Monitoring Loop
    while True:
        try:
            run_collector_cycle(initial_population=False)
        except Exception as e:
            print(f"[COLLECTOR] Critical main loop error: {e}. Retrying in {COLLECTOR_SLEEP_TIME}s.")
        
        time.sleep(COLLECTOR_SLEEP_TIME)

if __name__ == '__main__':
    init_db()
    start_collector()
