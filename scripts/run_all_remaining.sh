#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"
PYTHON="$PROJECT_DIR/.venv/bin/python"

echo "=================================================="
echo " OmniArc - Jujutsu Kaisen Master Auto-Translator"
echo "=================================================="

# Check if Season 1 is still being processed
if pgrep -f "batch_translate_all.py --season 1" > /dev/null; then
    echo "Season 1 translation is currently running. Waiting for it to finish..."
    while pgrep -f "batch_translate_all.py --season 1" > /dev/null; do
        sleep 10
    done
    echo "Season 1 translation completed!"
fi

# Run Season 2
echo ">>> Starting Season 2 batch translation (23 episodes)..."
"$PYTHON" "$PROJECT_DIR/scripts/batch_translate_all.py" --season 2 --workers 2

# Run Season 3
echo ">>> Starting Season 3 batch translation (12 episodes)..."
"$PYTHON" "$PROJECT_DIR/scripts/batch_translate_all.py" --season 3 --workers 2

# Run Movie 0 and any remaining
echo ">>> Starting Movie 0 & Remaining..."
"$PYTHON" "$PROJECT_DIR/scripts/batch_translate_all.py" --workers 2

echo "=================================================="
echo " ALL 60 EPISODES AND MOVIES FULLY TRANSLATED!"
echo "=================================================="
