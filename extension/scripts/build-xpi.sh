#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npm run zip
echo
echo "XPI ready at .output/kokocastles-firefox.zip"
echo "To install: open Firefox → about:debugging → This Firefox → Load Temporary Add-on → pick the .zip"
echo
echo "For permanent install, the XPI must be signed via AMO. Self-distribution"
echo "without signing only loads as a temporary add-on (cleared on Firefox restart)."
