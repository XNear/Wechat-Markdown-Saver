#!/bin/bash
# build.sh — Package the extension for Chrome, Firefox, and Edge
#
# Output: dist/chrome/  dist/firefox/  dist/edge/  (unpacked folders)
#          dist/*.zip                              (store-ready archives)
#
# Usage: bash build.sh [version]
#        If version is omitted, reads from current manifest.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"

# Determine version
if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$ROOT/manifest.json" | head -1)
fi
echo "Building version $VERSION ..."

# Clean
rm -rf "$DIST"
mkdir -p "$DIST"

# Files to include (everything except dist/, build scripts, and source manifests)
SOURCES=(
  background
  content
  icons
  lib
  options
  popup
  shared
  _locales
  offscreen
)

# ── Chrome ──────────────────────────────────────────────────────
echo "  [Chrome] packaging ..."
CHROME_DIR="$DIST/chrome"
mkdir -p "$CHROME_DIR"
for s in "${SOURCES[@]}"; do
  cp -r "$ROOT/$s" "$CHROME_DIR/"
done
cp "$ROOT/manifest.json" "$CHROME_DIR/"
# Update version
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$CHROME_DIR/manifest.json"
cd "$DIST" && zip -rq "wechat-md-saver-chrome-$VERSION.zip" chrome/
echo "  [Chrome] done → dist/wechat-md-saver-chrome-$VERSION.zip"

# ── Firefox ─────────────────────────────────────────────────────
echo "  [Firefox] packaging ..."
FF_DIR="$DIST/firefox"
mkdir -p "$FF_DIR"
for s in "${SOURCES[@]}"; do
  cp -r "$ROOT/$s" "$FF_DIR/"
done
# Use Firefox manifest
cp "$ROOT/manifest.firefox.json" "$FF_DIR/manifest.json"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$FF_DIR/manifest.json"
cd "$DIST" && zip -rq "wechat-md-saver-firefox-$VERSION.zip" firefox/
echo "  [Firefox] done → dist/wechat-md-saver-firefox-$VERSION.zip"

# ── Edge ──────────────────────────────────────────────────────
echo "  [Edge] packaging ..."
EDGE_DIR="$DIST/edge"
mkdir -p "$EDGE_DIR"
for s in "${SOURCES[@]}"; do
  cp -r "$ROOT/$s" "$EDGE_DIR/"
done
cp "$ROOT/manifest.edge.json" "$EDGE_DIR/manifest.json"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$EDGE_DIR/manifest.json"
cd "$DIST" && zip -rq "wechat-md-saver-edge-$VERSION.zip" edge/
echo "  [Edge] done → dist/wechat-md-saver-edge-$VERSION.zip"

echo ""
echo "All packages ready in $DIST"
echo ""
echo "To load in each browser:"
echo "  Chrome : chrome://extensions → 'Load unpacked' → dist/chrome/"
echo "  Firefox: about:debugging#/runtime/this-firefox → 'Load Temporary Add-on' → dist/firefox/manifest.json"
echo "  Edge   : edge://extensions → 'Load unpacked' → dist/edge/"
