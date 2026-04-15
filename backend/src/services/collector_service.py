import time
import threading
import logging
import services.rpc_service as rpc_service
import services.database_service as db_service

logger = logging.getLogger("collector")
_collectors_started = False


def _run_collector_for_chain(chain: str):
    """Polling loop for a single chain. Runs forever in a daemon thread."""
    client = rpc_service.get_client(chain)
    display = rpc_service.CHAIN_DISPLAY_NAMES.get(chain, chain.upper())
    logger.info(f"[Collector:{display}] Starting (7s interval)...")
    targets = [2, 7, 144]

    while True:
        start_time = time.time()
        try:
            current_height = client.get_block_count()
            for t in targets:
                try:
                    res = client.estimate_smart_fee(t, "unset", 1)
                    if "feerate_sat_per_vb" in res:
                        rate = res["feerate_sat_per_vb"]
                        db_service.save_estimate(current_height, t, rate, chain=chain)
                        logger.info(
                            f"[Collector:{display}] SAVED: target={t} height={current_height} rate={rate:.2f} sat/vB"
                        )
                except Exception as e:
                    logger.error(f"[Collector:{display}] Failed for target {t}: {e}")
        except Exception as e:
            logger.error(f"[Collector:{display}] Loop error: {e}")

        elapsed = time.time() - start_time
        # Always sleep at least 1 s so a slow or erroring node cannot cause
        # the loop to spin without any backoff.
        sleep_time = max(1, 7 - elapsed)
        time.sleep(sleep_time)


def start_background_collectors():
    """Spawn one collector thread per registered chain."""
    global _collectors_started
    if _collectors_started:
        logger.warning("Collectors already running, skipping.")
        return
    _collectors_started = True

    chains = rpc_service.registry.chains()
    for chain in chains:
        thread = threading.Thread(target=_run_collector_for_chain, args=(chain,), daemon=True)
        thread.start()
        logger.info(f"Collector thread started for {chain}")

