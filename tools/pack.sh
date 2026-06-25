#!/usr/bin/env bash
# Build a loadable zip of the extension into dist/. Unzip it and load the folder
# via chrome://extensions → Developer mode → "Load unpacked".
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
NAME="hide-my-extensions-from-sites-${VERSION}"

# Icons are generated artifacts; make sure they exist before packing.
if [ ! -f icons/icon128.png ]; then
  python3 tools/make_icons.py
fi

mkdir -p dist
rm -f "dist/${NAME}.zip"
zip -r -q "dist/${NAME}.zip" manifest.json src icons -x '*.DS_Store'
echo "built dist/${NAME}.zip"
