import time
import random
import os
from database import init_db, insert_analysis
from json_rpc_request import (
    get_block_count, 
    get_block_tx_details, 
    get_raw_mempool, 
    get_block_template, 
    get_estimated_fee_rate_satvb,
    get_block_txids
)

# Configuration for the collector loop
COLLECTOR_SLEEP_TIME = 30  # for a new block every 30 seconds
LAST_PROCESSED_HEIGHT = 0
INITIAL_HISTORY_DEPTH = 1000 # The number of blocks to fetch initially
PRE_BLOCK_MEMPOOL_TXIDS = set()
PRE_BLOCK_MEMPOOL_VERBOSE = {}

# custom fee logic

def get_custom_fee_prediction_asap(percentile: int = 50) -> float:
    """
    Returns: A single ASAP feerate prediction in sat/vB using the mempool
    percentile estimator (default p50). Falls back to Core historical estimate.
    """
    try:
        from json_rpc_request import get_mempool_percentile_fee_estimate
        res = get_mempool_percentile_fee_estimate([percentile])
        plist = res.get("percentiles") or []
        if plist:
            fee = plist[0].get("feerate_sat_per_vb")
            if isinstance(fee, (int, float)) and fee > 0:
                return float(fee)

        # Fallback to Core estimator if mempool estimator unavailable
        core_estimate = get_estimated_fee_rate_satvb(conf_target=1, mode='economical')
        predicted_fee = core_estimate.get('feerate_sat_per_vb')
        if isinstance(predicted_fee, (int, float)) and predicted_fee > 0:
            return float(predicted_fee)

        # Last resort fallback to a safe constant
        return 10.0
        
    except Exception as e:
        print(f"Prediction Error: {e}. Returning fallback fee.")
        return 10.0 # Safe fallback fee

# block processing 

def _sat_per_vb_from_entry(entry: dict) -> Optional[float]:
    try:
        # Prefer vsize if present; else use size
        size = entry.get("vsize") or entry.get("size")
        fee_btc = entry.get("fee") or entry.get("fees", {}).get("base")
        if not size or not fee_btc:
            return None
        return (fee_btc * 100_000_000.0) / float(size)
    except Exception:
        return None

def _compute_block_coverage(height: int, pre_block_mempool_txids: set) -> float:
    """
    Compute coverage ratio: fraction of mined block txids that were present
    in our mempool snapshot taken before the block was mined.
    Excludes coinbase (first transaction).
    """
    try:
        txids = get_block_txids(height) or []
        if not txids or len(txids) <= 1:
            return 0.0
        # Exclude coinbase (first tx)
        mined_txids = set(txids[1:])
        if not pre_block_mempool_txids:
            return 0.0
        common = mined_txids.intersection(pre_block_mempool_txids)
        return round(len(common) / len(mined_txids), 4)
    except Exception as e:
        print(f"[COLLECTOR] Coverage compute failed for block {height}: {e}")
        return 0.0

def _compute_high_fee_inclusion_ratio(height: int, pre_verbose: dict, top_percent: float = 0.1) -> float:
    """
    Among top X% high-fee mempool txs (by sat/vB) at snapshot time,
    compute fraction that appear in the mined block.
    """
    try:
        if not pre_verbose:
            return 0.0
        # Build list of (txid, feerate)
        pairs = []
        for txid, entry in pre_verbose.items():
            fr = _sat_per_vb_from_entry(entry)
            if fr is not None:
                pairs.append((txid, fr))
        if not pairs:
            return 0.0
        pairs.sort(key=lambda x: x[1], reverse=True)
        k = max(1, int(len(pairs) * top_percent))
        top_txids = set(txid for txid, _ in pairs[:k])

        txids = get_block_txids(height) or []
        if not txids or len(txids) <= 1:
            return 0.0
        mined_txids = set(txids[1:])  # exclude coinbase

        hits = len(top_txids.intersection(mined_txids))
        return round(hits / len(top_txids), 4)
    except Exception as e:
        print(f"[COLLECTOR] High-fee inclusion compute failed for block {height}: {e}")
        return 0.0

def process_block(height: int, pre_block_mempool_txids: set, pre_verbose: dict):
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
            percentiles = block_details.get('percentiles') or []
            coverage = _compute_block_coverage(height, pre_block_mempool_txids)
            high_fee_incl = _compute_high_fee_inclusion_ratio(height, pre_verbose)
            
            # 3. Store the result
            insert_analysis(
                block_height=height,
                min_feerate=min_fee,
                max_feerate=max_fee,
                predicted_feerate=predicted_fee,
                percentiles=percentiles,
                block_coverage=coverage,
                high_fee_incl_ratio=high_fee_incl
            )
            print(f"[COLLECTOR] Processed Block {height}: Actual Min={min_fee}, Predicted={predicted_fee}, Coverage={coverage}, HighFeeIncl={high_fee_incl}")
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
    
    # Snapshot mempool BEFORE processing blocks
    try:
        # verbose=True to compute sat/vB and top decile metrics
        mem_verbose = get_raw_mempool(verbose=True) or {}
        global PRE_BLOCK_MEMPOOL_TXIDS, PRE_BLOCK_MEMPOOL_VERBOSE
        PRE_BLOCK_MEMPOOL_TXIDS = set(mem_verbose.keys()) if isinstance(mem_verbose, dict) else set(mem_verbose)
        PRE_BLOCK_MEMPOOL_VERBOSE = mem_verbose if isinstance(mem_verbose, dict) else {}
    except Exception as e:
        print(f"[COLLECTOR] Failed to snapshot mempool (verbose): {e}")
        PRE_BLOCK_MEMPOOL_TXIDS = set()
        PRE_BLOCK_MEMPOOL_VERBOSE = {}

    for height in blocks_to_process:
        if height > LAST_PROCESSED_HEIGHT:
            if process_block(height, PRE_BLOCK_MEMPOOL_TXIDS, PRE_BLOCK_MEMPOOL_VERBOSE):
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
