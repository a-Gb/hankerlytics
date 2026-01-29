#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"

if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "Python not found. Install Python or use a different static server."
  exit 127
fi

echo "Serving on http://${HOST}:${PORT} (Ctrl+C to stop)"
exec "$PY" -m http.server "$PORT" --bind "$HOST"
