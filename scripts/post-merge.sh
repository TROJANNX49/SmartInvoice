#!/bin/bash
set -e

# Runs automatically after every task merge.
# Must be idempotent and non-interactive (stdin is closed).

echo "→ Installing dependencies..."
cd project && npm install --no-fund --no-audit
echo "✓ Done"
