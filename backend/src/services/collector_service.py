import time
import threading
import logging
import services.rpc_service as rpc_service
import services.database_service as db_service

logger = logging.getLogger("collector")
_collector_started = False

def run_collector():
    logger.info("Starting high-resolution fee estimate collector (1s interval)...") 
    # 1 and 2 are the same, so we only poll 2
    targets = [2, 7, 144]

    while True:
        start_time = time.time()
        try:
            current_height = rpc_service.get_block_count()
            
            for t in targets:
                try:
                    res = rpc_service.estimate_smart_fee(t, "unset", 1)
                    if "feerate_sat_per_vb" in res:
                        rate = res["feerate_sat_per_vb"]
                        db_service.save_estimate(current_height, t, rate)
                        # Log as collected for the target
                        logger.info(f"[Collector] SAVED: target={t} height={current_height} rate={rate:.2f} sat/vB")
                except Exception as e:
                    logger.error(f"[Collector] Failed to collect for target {t}: {e}")
            
        except Exception as e:
            logger.error(f"[Collector] Loop error: {e}")

        elapsed = time.time() - start_time
        # Interval between request should be 7 seconds.
        # (https://bitcoin.stackexchange.com/questions/125776/how-long-does-it-take-for-a-transaction-to-propagate-through-the-network)
        sleep_time = max(0, 7 - elapsed)
        time.sleep(sleep_time)

def start_background_collector():
    global _collector_started
    if _collector_started:
        logger.warning("Collector already running, skipping.")
        return
    _collector_started = True 
    thread = threading.Thread(target=run_collector, daemon=True)
    thread.start()
    return thread
