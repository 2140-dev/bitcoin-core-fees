from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal
import requests
import numpy as np

app = FastAPI(title="Bitcoin Fee Stats API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", # frontend local host
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BLOCK_INTERVAL = 1000
URL_API = "https://bitcoincorefeerate.com/fees/2/economical/2"

# Response models
class BlockStat(BaseModel):
    height: int
    p25: float
    p75: float
    avgFee: float
    status: Literal["overpaid", "underpaid", "within_range"]


class SummaryItem(BaseModel):
    count: int
    percent: float


class StatsResponse(BaseModel):
    start_height: int
    end_height: int
    latest_block_height: int
    blocks: List[BlockStat]
    summary: dict

# Helpers function

def classify_block(avg_fee, p25, p75):
    if avg_fee > p75:
        return "overpaid"
    elif avg_fee < p25:
        return "underpaid"
    return "within_range"

#routes
@app.get("/stats", response_model=StatsResponse)
def get_stats(start_height: int = Query(..., ge=0)):
    end_height = start_height + BLOCK_INTERVAL

    # Fetch data from api url
    try:
        r = requests.get(URL_API, timeout=30)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL API: {str(e)}"
        )

    mempool_stats = data.get("mempool_health_statistics", [])

    # Group ratios per block height
    block_ratios = {}
    for entry in mempool_stats:
        h = entry["block_height"]
        ratio = entry["ratio"]
        if h not in block_ratios:
            block_ratios[h] = []
        block_ratios[h].append(ratio)

    # Compute percentiles, average, and classification
    blocks = []
    counts = {"overpaid": 0, "underpaid": 0, "within_range": 0}

    for height in range(start_height, end_height):
        ratios = block_ratios.get(height, [])
        if not ratios:
            continue  # skips blocks with no data

        arr = np.array(ratios)
        p25 = float(np.percentile(arr, 25))
        p75 = float(np.percentile(arr, 75))
        avg = float(arr.mean())
        status = classify_block(avg, p25, p75)
        counts[status] += 1

        blocks.append(
            BlockStat(height=height, p25=p25, p75=p75, avgFee=avg, status=status)
        )

    total_blocks = len(blocks)
    summary = {
        "overpaid": {"count": counts["overpaid"], "percent": round(counts["overpaid"] / total_blocks * 100, 2) if total_blocks else 0},
        "underpaid": {"count": counts["underpaid"], "percent": round(counts["underpaid"] / total_blocks * 100, 2) if total_blocks else 0},
        "within": {"count": counts["within_range"], "percent": round(counts["within_range"] / total_blocks * 100, 2) if total_blocks else 0},
    }

    latest_block_height = max([b.height for b in blocks], default=start_height)

    return {
        "start_height": start_height,
        "end_height": end_height,
        "latest_block_height": latest_block_height,
        "blocks": blocks,
        "summary": summary,
    }
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)