#!/usr/bin/env bash
# Download and unpack pre-collected fee estimation data.
#
# Usage:
#   ./scripts/import-data.sh [URL]
#
# Default URL: https://bitcoincorefeerate.com/api/data/snapshot

set -euo pipefail

URL="${1:-https://bitcoincorefeerate.com/api/data/snapshot}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$REPO_ROOT/backend/src/services"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: $TARGET_DIR does not exist." >&2
  exit 1
fi

echo "Downloading and extracting fee data from $URL ..."
curl -fSL --progress-bar "$URL" | tar xzf - -C "$TARGET_DIR"

echo "Done. Database files:"
find "$TARGET_DIR" -name "fee_analysis.db" -exec ls -lh {} \;
