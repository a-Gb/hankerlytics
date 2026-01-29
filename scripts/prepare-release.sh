#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== HN Thread Atlas Release Check ==="
echo ""

# Check JavaScript syntax
echo "Checking JavaScript syntax..."
node --check app.js
for f in modules/*.js modules/layouts/*.js; do
  node --check "$f"
done
echo "✓ All JavaScript files pass syntax check"

# Check required files
echo ""
echo "Checking required files..."
REQUIRED_FILES=("index.html" "styles.css" "app.js" "README.md" "LICENSE" "CONTRIBUTING.md" "CODE_OF_CONDUCT.md" "SECURITY.md")
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "✗ Missing: $f"
    exit 1
  fi
done
echo "✓ All required files present"

# Summary
echo ""
echo "=== Release Ready ==="
echo "Run: git add . && git commit -m 'Initial release'"
