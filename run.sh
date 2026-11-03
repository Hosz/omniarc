#!/usr/bin/env bash
# run.sh - Inicializador do OmniArc no Linux (CachyOS / Arch / Ubuntu)
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f "$DIR/.venv/bin/python3" ]; then
    PYTHON="$DIR/.venv/bin/python3"
else
    PYTHON="python3"
fi

export PYTHONPATH="$DIR"
exec "$PYTHON" "$DIR/main.py" "$@"
