#!/usr/bin/env bash
# Runs the mobile app as a web page in a browser, next to the PWA. See ../PREVIEW.md.
# Needs a running backend (BACKEND_URL) with a password set for PREVIEW_USER, and `npm ci` done
# in mobile/. Nothing tracked is edited: the app is run from a scratch copy.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
scratch="${PREVIEW_DIR:-${TMPDIR:-/tmp}/wt-mobile-preview}"
export BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
export PREVIEW_USER="${PREVIEW_USER:-kapekost}"
export PREVIEW_PASSWORD="${PREVIEW_PASSWORD:?set PREVIEW_PASSWORD}"
export PROXY_PORT="${PROXY_PORT:-8001}"
export EXPO_URL="${EXPO_URL:-http://localhost:8081}"
export PWA_URL="${PWA_URL:-http://localhost:5173}"

# First run clones node_modules (copy-on-write on macOS, plain copy elsewhere). Later runs only
# refresh the sources.
if [ ! -d "$scratch/node_modules" ]; then
  mkdir -p "$scratch"
  cp -cR "$here/node_modules" "$scratch/node_modules" 2>/dev/null || cp -R "$here/node_modules" "$scratch/node_modules"
fi
rsync -a --delete --exclude node_modules --exclude .expo --exclude dist --exclude preview-stub.js --exclude metro.config.js "$here/" "$scratch/"

# `server` output renders HTML with no client script, so the page stays blank.
cd "$scratch"
node -e '
const fs = require("fs");
const app = JSON.parse(fs.readFileSync("app.json"));
app.expo.web.output = "single";
fs.writeFileSync("app.json", JSON.stringify(app, null, 2));
'

# expo-secure-store has no web implementation. The proxy supplies the cookie, so an empty store is enough.
cat > "$scratch/preview-stub.js" <<'JS'
const items = {};
export const getItemAsync = async (key) => items[key] ?? null;
export const setItemAsync = async (key, value) => { items[key] = value; };
export const deleteItemAsync = async (key) => { delete items[key]; };
JS
cat > "$scratch/metro.config.js" <<'JS'
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const stub = require('path').join(__dirname, 'preview-stub.js');
config.resolver.resolveRequest = (context, name, platform) =>
  name === 'expo-secure-store'
    ? { type: 'sourceFile', filePath: stub }
    : context.resolveRequest(context, name, platform);
module.exports = config;
JS

node "$here/scripts/preview-proxy.mjs" &
proxy=$!
trap 'kill $proxy' EXIT

EXPO_PUBLIC_API_URL="http://localhost:$PROXY_PORT" npx expo start --web --port "${EXPO_URL##*:}"
