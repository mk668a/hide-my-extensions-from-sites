#!/usr/bin/env bash
# Build loadable zips of the extension into dist/ — one per browser. Unzip and load
# the folder:
#   Chrome :  chrome://extensions → Developer mode → "Load unpacked"
#   Firefox:  about:debugging#/runtime/this-firefox → "Load Temporary Add-on"
# The two builds share identical src/ and icons/; only the manifest differs (see
# tools/firefox-manifest.ts for the why).
#
# Needs dev dependencies installed (`npm install`): it shells out to the local
# tsc and tsx to compile src/ and generate the Firefox manifest.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
BASE="hide-my-extensions-from-sites"

# Icons are generated artifacts; make sure they exist before packing.
if [ ! -f icons/icon128.png ]; then
  python3 tools/make_icons.py
fi

mkdir -p dist

# The shipped src/ is TypeScript-authored; src/*.js is compiled output. Compile
# it here so the zips contain browser-ready JS — this is the single compile on
# the `npm run build` path, and keeps `bash tools/pack.sh` self-contained.
npx tsc -p tsconfig.src.json

# Chrome: manifest.json is already the Chrome manifest. Authored *.ts (and the
# *.d.ts ambient types) are excluded — only the compiled *.js ships.
CHROME_ZIP="dist/${BASE}-chrome-${VERSION}.zip"
rm -f "$CHROME_ZIP"
zip -r -q "$CHROME_ZIP" manifest.json src icons -x '*.DS_Store' -x '*.ts'
echo "built $CHROME_ZIP"

# Firefox: stage a build dir with the generated Firefox manifest at the root.
FF_ZIP="dist/${BASE}-firefox-${VERSION}.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
npx tsx tools/firefox-manifest.ts manifest.json "$STAGE/manifest.json"
cp -R src icons "$STAGE/"
rm -f "$FF_ZIP"
( cd "$STAGE" && zip -r -q "$OLDPWD/$FF_ZIP" manifest.json src icons -x '*.DS_Store' -x '*.ts' )
echo "built $FF_ZIP"
