"""
Bitcoin Core JSON-RPC client.

RpcClient wraps a single Bitcoin Core node.  It handles authentication,
request serialisation, and all node-specific queries including block-stats
caching and performance analysis.
"""

import itertools
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

# Human-readable chain names used in logs and API responses.
CHAIN_DISPLAY_NAMES: Dict[str, str] = {
    "main": "MAINNET",
    "test": "TESTNET",
    "testnet4": "TESTNET4",
    "signet": "SIGNET",
    "regtest": "REGTEST",
}

DEFAULT_TIMEOUT_SECONDS = 30

# Shared monotonically-increasing counter for JSON-RPC request IDs.
# itertools.count is thread-safe in CPython (GIL protects __next__).
_rpc_id_counter = itertools.count(1)


def _clamp_target(target: int) -> int:
    """Bitcoin Core treats confirmation targets ≤ 1 identically to 2."""
    return max(2, target)


class RpcClient:
    """Stateful JSON-RPC connection to a single Bitcoin Core node.

    One instance is created per configured node and held in RpcRegistry.
    All public methods are safe to call from multiple threads (see
    _fetch_block_stats_parallel for details).
    """

    # Maximum worker threads for parallel getblockstats calls.
    # Bitcoin Core's default rpcthreads=16; we leave headroom for the
    # background collector and any concurrent API requests.
    _BLOCK_FETCH_WORKERS = 8

    def __init__(self, url: str, user: Optional[str] = None, password: Optional[str] = None):
        self._url = url
        self._user = user
        self._password = password
        self._session = requests.Session()
        self._chain: Optional[str] = None
        # None = untested, True = node accepts 3rd options arg, False = standard 2-param only
        self._extended_smartfee: Optional[bool] = None

    # ------------------------------------------------------------------
    # Chain identity
    # ------------------------------------------------------------------

    @property
    def chain(self) -> str:
        """Return the chain name, resolving it via getblockchaininfo on first access."""
        if self._chain is None:
            info = self.get_blockchain_info()
            self._chain = info["chain"]
        return self._chain

    @property
    def chain_display(self) -> str:
        return CHAIN_DISPLAY_NAMES.get(self.chain, self.chain.upper())

    # ------------------------------------------------------------------
    # Core RPC transport
    # ------------------------------------------------------------------

    def rpc_call(self, method: str, params: List[Any]) -> Any:
        """Send a JSON-RPC request and return the result field.

        Raises RuntimeError on RPC errors or network failures so callers
        get a consistent exception type regardless of the underlying cause.
        """
        payload = json.dumps({
            "method": method,
            "params": params,
            "id": next(_rpc_id_counter),
        })
        auth = (self._user, self._password) if (self._user and self._password) else None
        try:
            response = self._session.post(
                self._url, data=payload, auth=auth, timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            data = response.json()
            if data.get("error"):
                raise RuntimeError(f"RPC Error ({method}): {data['error']}")
            return data.get("result")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"RPC call '{method}' failed: {type(e).__name__}") from e

    # ------------------------------------------------------------------
    # Node queries
    # ------------------------------------------------------------------

    def get_block_count(self) -> int:
        return self.rpc_call("getblockcount", [])

    def get_blockchain_info(self) -> Dict[str, Any]:
        """Return chain name, display name, and current block count."""
        result = self.rpc_call("getblockchaininfo", [])
        if not result:
            raise RuntimeError("getblockchaininfo returned empty result — cannot determine chain")
        chain = result.get("chain", "main")
        blocks = result.get("blocks", self.get_block_count())
        display = CHAIN_DISPLAY_NAMES.get(chain, chain.upper())
        return {"chain": chain, "chain_display": display, "blockcount": blocks}

    def _call_estimatesmartfee(self, conf_target: int, mode: str, options: Optional[Dict[str, Any]] = None) -> Any:
        """Call estimatesmartfee with automatic fallback for standard nodes.

        Nodes running a custom build accept a 3rd *options* dict (verbosity,
        fee_rate_estimator).  Standard Bitcoin Core only accepts two positional
        args.  On the first call we probe the node; once we know we cache the
        result in ``_extended_smartfee`` so subsequent calls skip the probe.
        """
        if self._extended_smartfee is False or options is None:
            return self.rpc_call("estimatesmartfee", [conf_target, mode])

        try:
            result = self.rpc_call("estimatesmartfee", [conf_target, mode, options])
            self._extended_smartfee = True
            return result
        except RuntimeError as exc:
            # When the node doesn't recognise the 3rd parameter it returns
            # error code -1 with the help text.  Only that specific case
            # should permanently disable the extended call.
            msg = str(exc)
            if "RPC Error (estimatesmartfee)" in msg and "conf_target" in msg:
                logger.info("Node %s does not support extended estimatesmartfee — using standard call", self._url)
                self._extended_smartfee = False
                return self.rpc_call("estimatesmartfee", [conf_target, mode])
            raise

    def estimate_smart_fee(
        self,
        conf_target: int,
        mode: str = "unset",
        verbosity: int = 2,
        block_policy_only: bool = False,
    ) -> Dict[str, Any]:
        """Call estimatesmartfee and annotate the result with sat/vB conversion.

        The raw feerate is BTC/kvB.  Conversion:
            BTC/kvB × 100,000,000 sat/BTC ÷ 1,000 vB/kvB = sat/vB × 100,000

        With block_policy_only=False (our default) the node may use additional
        estimators and returns an ``estimator`` field naming the one chosen.
        """
        effective_target = _clamp_target(conf_target)
        fee_rate_estimator = "block_policy" if block_policy_only else "auto"
        result = self._call_estimatesmartfee(
            effective_target, mode,
            {"verbosity": verbosity, "fee_rate_estimator": fee_rate_estimator},
        )
        if result and "feerate" in result:
            result["feerate_sat_per_vb"] = result["feerate"] * 100_000
        if result is not None:
            result["chain"] = self.chain
        return result

    def get_mempool_health_statistics(self) -> List[Dict[str, Any]]:
        """Return per-block mempool health stats via estimatesmartfee verbosity 2.

        verbosity=2 includes mempool_health_statistics in the response, but only
        when block_policy_only=False.  Standard nodes don't support this — returns
        an empty list in that case.
        """
        result = self._call_estimatesmartfee(2, "unset", {"verbosity": 2})
        if not result:
            return []
        raw_stats = result.get("mempool_health_statistics", [])
        stats = []
        for entry in raw_stats:
            block_weight = entry.get("block_weight", 0)
            mempool_txs_weight = entry.get("mempool_txs_weight", 0)
            ratio = min(1.0, mempool_txs_weight / block_weight) if block_weight > 0 else 0.0
            stats.append({
                "block_height": entry["block_height"],
                "block_weight": block_weight,
                "mempool_txs_weight": mempool_txs_weight,
                "ratio": ratio,
            })
        return stats

    # ------------------------------------------------------------------
    # Block-stats cache + parallel fetch
    # ------------------------------------------------------------------

    @lru_cache(maxsize=2000)
    def _get_single_block_stats_cached(self, height: int) -> str:
        result = self.rpc_call("getblockstats", [
            height, ["height", "feerate_percentiles", "minfeerate", "maxfeerate", "total_weight"],
        ])
        return json.dumps(result)

    def get_single_block_stats(self, height: int) -> Dict[str, Any]:
        return json.loads(self._get_single_block_stats_cached(height))

    def _fetch_block_stats_parallel(self, heights: List[int]) -> Dict[int, Any]:
        """Fetch getblockstats for a list of heights in parallel.

        Returns a dict mapping height → parsed stats for every height that
        succeeded.  Heights that fail (node unavailable, not yet mined, etc.)
        are omitted — callers must handle missing keys gracefully.

        Thread-safety:
        - lru_cache on _get_single_block_stats_cached is safe in CPython: the
          GIL serialises dict reads/writes.  A cache stampede on an uncached
          height is harmless because getblockstats is idempotent.
        - requests.Session: session-level state (auth, headers) is never
          mutated after construction, so concurrent POSTs are safe — urllib3's
          connection pool handles concurrency internally.
        """
        if not heights:
            return {}

        results: Dict[int, Any] = {}

        def _fetch(h: int) -> tuple[int, Any]:
            return h, self.get_single_block_stats(h)

        with ThreadPoolExecutor(max_workers=min(self._BLOCK_FETCH_WORKERS, len(heights))) as pool:
            futures = {pool.submit(_fetch, h): h for h in heights}
            for future in as_completed(futures):
                h = futures[future]
                try:
                    _, stats = future.result()
                    results[h] = stats
                except Exception:
                    logger.debug("Skipping block stats for height %d — RPC unavailable", h)

        return results

    # Blocks within this many of the tip aren't persisted to the block_stats
    # cache — a reorg could still change their feerate_percentiles.
    _REORG_BUFFER = 6

    def _block_ranges(self, heights: List[int], tip_height: Optional[int] = None, persist: bool = False) -> Dict[int, tuple]:
        """Return {height: (p10, p90)} for the given heights.

        Reads from the persistent block_stats cache first; any misses are
        fetched via getblockstats (in parallel). Misses buried deeper than
        _REORG_BUFFER below the tip are written back *only* when persist=True.

        To keep SQLite writes single-writer (the app's design — only the
        background job and collector write), persist=True is used solely by the
        primary worker's all-time summary job. Request paths read the cache and
        fetch misses live without writing, so concurrent API traffic across
        workers never writes to the DB.
        """
        import services.database_service as db_service

        heights = list(heights)
        if not heights:
            return {}

        ranges = db_service.get_block_ranges(self.chain, heights)
        missing = [h for h in heights if h not in ranges]
        if not missing:
            return ranges

        if tip_height is None:
            try:
                tip_height = self.get_block_count()
            except Exception:
                tip_height = None

        fetched = self._fetch_block_stats_parallel(missing)
        to_store: Dict[int, tuple] = {}
        for h, stats in fetched.items():
            p = stats.get("feerate_percentiles", [0, 0, 0, 0, 0])
            rng = (p[0], p[4])
            ranges[h] = rng
            if persist and (tip_height is None or h <= tip_height - self._REORG_BUFFER):
                to_store[h] = rng
        if persist:
            db_service.save_block_ranges(self.chain, to_store)
        return ranges

    # ------------------------------------------------------------------
    # Mempool feerate diagram
    # ------------------------------------------------------------------

    def get_mempool_feerate_diagram_analysis(self) -> Dict[str, Any]:
        """Analyse getmempoolfeeratediagram output into feerate windows.

        The diagram returns (cumulative_weight_WU, cumulative_fee_BTC) pairs
        ordered highest-feerate first.  Fee values are in BTC (converted from
        CAmount satoshis via ValueFromAmount in the node).

        Segment feerate conversion:
            (delta_fee_BTC / delta_weight_WU) × 400,000,000
            = sat/vB  (1 BTC = 1e8 sat, 4 WU = 1 vB → factor = 1e8 / 4 = 25e6,
              but cumulative weight is in WU so fee/weight × 4e8 / 1e3 = × 4e5,
              combined: × 100,000 × 4 = × 400,000,000 for sat-per-virtual-byte)

        Because the diagram packs transactions highest-feerate first, weight
        position p corresponds to feerate percentile (1 − p): the first 5% of
        weight (p=0.05) carries the top 5% most expensive transactions, i.e.
        feerate percentile 95.
        """
        raw_points = self.rpc_call("getmempoolfeeratediagram", [])
        if not raw_points:
            return {"raw": [], "windows": {}}

        BLOCK_WEIGHT = 4_000_000
        max_weight = raw_points[-1]["weight"]

        segments = []
        for i, p in enumerate(raw_points):
            if i == 0:
                fr = (p["fee"] / p["weight"]) * 400_000_000 if p["weight"] > 0 else 0
            else:
                prev = raw_points[i - 1]
                dw = p["weight"] - prev["weight"]
                df = p["fee"] - prev["fee"]
                fr = (df / dw) * 400_000_000 if dw > 0 else 0
            segments.append({"w": p["weight"], "fr": fr})

        def _feerate_at_weight(w_target: float) -> float:
            for seg in segments:
                if seg["w"] >= w_target:
                    return seg["fr"]
            return segments[-1]["fr"] if segments else 0

        def _window_percentiles(weight_limit: int) -> Dict[str, float]:
            actual_limit = min(weight_limit, max_weight)
            # Weight position p → feerate percentile label (1−p)×100
            # so that p5 = cheap (like getblockstats) and p95 = expensive.
            return {
                str(int((1 - p) * 100)): _feerate_at_weight(p * actual_limit)
                for p in (0.05, 0.25, 0.50, 0.75, 0.95)
            }

        windows = {
            "1": _window_percentiles(BLOCK_WEIGHT),
            "2": _window_percentiles(BLOCK_WEIGHT * 2),
            "3": _window_percentiles(BLOCK_WEIGHT * 3),
            "all": _window_percentiles(max_weight),
        }

        return {
            "raw": raw_points,
            "windows": windows,
            "total_weight": max_weight,
            "total_fee": raw_points[-1]["fee"],
        }

    # ------------------------------------------------------------------
    # Performance analysis (requires database_service)
    # ------------------------------------------------------------------

    def get_performance_data(self, start_height: int, count: int = 100, target: int = 2) -> Dict[str, Any]:
        """Return block fee-rate ranges and stored estimates over a height window.

        Queries the local SQLite database for fee estimates recorded at each
        block height, then fetches the corresponding getblockstats for the
        p10/p90 fee-rate range.  Block stats are fetched in parallel.
        """
        import services.database_service as db_service

        effective_target = _clamp_target(target)
        end_height = start_height + count

        # One line per (estimator x mode). block_policy_only False = the auto
        # estimator (mempool_policy on this build); True = legacy block_policy.
        series_defs = [
            ("mempool_policy_economical", False, "economical", "mempool_policy"),
            ("block_policy_economical", True, "economical", "block_policy"),
            ("mempool_policy_conservative", False, "conservative", "mempool_policy"),
            ("block_policy_conservative", True, "conservative", "block_policy"),
        ]
        series = []
        for key, block_policy_only, mode, estimator in series_defs:
            rows = db_service.get_estimates_in_range(
                start_height, end_height, effective_target, chain=self.chain,
                block_policy_only=block_policy_only, mode=mode,
            )
            rate_map = {row["poll_height"]: row["estimate_feerate"] for row in rows}
            points = [{"height": h, "rate": rate_map[h]} for h in sorted(rate_map)]
            series.append({"key": key, "estimator": estimator, "mode": mode, "points": points})

        heights = list(range(start_height, end_height))
        ranges = self._block_ranges(heights)
        blocks = []
        for h in heights:
            rng = ranges.get(h)
            if rng is None:
                continue
            low, high = rng
            blocks.append({"height": h, "low": low, "high": high})

        # Back-compat keys (economical series) kept alongside the full `series`.
        by_key = {s["key"]: s["points"] for s in series}
        return {
            "blocks": blocks,
            "series": series,
            "estimates": by_key["mempool_policy_economical"],
            "block_policy_estimates": by_key["block_policy_economical"],
        }

    def calculate_local_summary(self, target: int = 2, start_height: Optional[int] = None, all_time: bool = False, mode: str = "economical", block_policy_only: bool = False) -> Dict[str, Any]:
        """Classify stored fee estimates as within-range, overpaid, or underpaid.

        An estimate is:
        - within-range  if it fell inside p10–p90 of at least one block in the
                        confirmation window
        - overpaid      if it exceeded p90 of every block in the window
        - underpaid     if it stayed below p10 of every block in the window

        The classification loop is serial because the is_under / is_over state
        is updated across multiple blocks per row.  Block stats are pre-warmed
        into the lru_cache in a parallel burst before the serial loop to avoid
        repeated RPC round-trips.
        """
        import services.database_service as db_service

        effective_target = _clamp_target(target)
        current_h = self.get_block_count()
        if all_time:
            # Full history: start at the earliest recorded estimate for this
            # mode/estimator, bypassing the per-request range cap (only the
            # background job calls this).
            height_range = db_service.get_db_height_range(
                effective_target, chain=self.chain, mode=mode, block_policy_only=block_policy_only,
            )
            start_h = height_range[0] if height_range and height_range[0] is not None else current_h - 1000
        else:
            start_h = start_height if start_height is not None else current_h - 1000
        db_rows = db_service.get_estimates_in_range(
            start_h, current_h, effective_target, chain=self.chain, enforce_cap=not all_time,
            mode=mode, block_policy_only=block_policy_only,
        )

        valid_rows = []
        needed_heights: set[int] = set()
        for row in db_rows:
            window_end = row["poll_height"] + row["target"]
            if window_end > current_h:
                continue
            valid_rows.append(row)
            needed_heights.update(range(row["poll_height"] + 1, window_end + 1))

        # Persist to the block_stats cache only from the background all-time job
        # (single-writer); the live /fees-sum range path reads/fetches without writing.
        ranges = self._block_ranges(sorted(needed_heights), tip_height=current_h, persist=all_time)

        total = over = under = within = 0

        for row in valid_rows:
            poll_h = row["poll_height"]
            target_val = row["target"]
            est = row["estimate_feerate"]
            window_end = poll_h + target_val

            is_under = True
            is_over = False
            total += 1

            for h in range(poll_h + 1, window_end + 1):
                rng = ranges.get(h)
                if rng is None:
                    continue
                low, high = rng
                if est >= low:
                    is_under = False
                if est > high:
                    is_over = True

            if is_under:
                under += 1
            elif is_over:
                over += 1
            else:
                within += 1

        return {
            "total": total,
            "within_val": within,
            "within_perc": within / total if total > 0 else 0,
            "overpayment_val": over,
            "overpayment_perc": over / total if total > 0 else 0,
            "underpayment_val": under,
            "underpayment_perc": under / total if total > 0 else 0,
            "first_height": start_h,
        }
