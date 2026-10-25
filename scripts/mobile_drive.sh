#!/usr/bin/env bash
# Runs the mobile app against a throwaway backend on this machine's LAN address, so a phone on the
# same Wi-Fi can drive it. The real database is never touched.
#
#   bash scripts/mobile_drive.sh start   # backend + Expo dev server, prints login and the open command
#   bash scripts/mobile_drive.sh stop    # stops both and deletes the throwaway database
#
# Needs backend/.venv and mobile/node_modules (see AGENTS.md). Override with LAN_IP, API_PORT, METRO_PORT.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
state=${MOBILE_DRIVE_STATE:-${TMPDIR:-/tmp}/wt-mobile-drive}
api_port=${API_PORT:-8000}
metro_port=${METRO_PORT:-8082}
ip=${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}

# Pids listening on a port whose command line matches a glob, so another session's server on the
# same port is never touched. The backend is found by its --host argument (its command line has no
# path), Expo by this checkout's path.
ours() { # port glob
  local pid
  for pid in $(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null); do
    # shellcheck disable=SC2254 # $2 is a glob on purpose
    case "$(ps -o command= -p "$pid")" in $2) echo "$pid" ;; esac
  done
}
api_pids() { ours "$api_port" "*uvicorn main:app --host $ip *"; }
metro_pids() { ours "$metro_port" "*$root*"; }

wait_for() { # url
  for _ in $(seq 1 60); do
    curl -fs "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "timed out waiting for $1; see $state/*.log" >&2
  return 1
}

stop() {
  local pid
  for pid in $(api_pids) $(metro_pids); do kill "$pid" && echo "stopped $pid"; done
  rm -r "$state" 2>/dev/null || true
}

start() {
  [ -n "$ip" ] || { echo "no LAN address found; set LAN_IP" >&2; exit 1; }
  [ -x "$root/backend/.venv/bin/python" ] || { echo "missing backend/.venv" >&2; exit 1; }
  [ -d "$root/mobile/node_modules" ] || { echo "missing mobile/node_modules" >&2; exit 1; }
  [ -z "$(api_pids)$(metro_pids)" ] || { echo "already running; run stop first" >&2; exit 1; }

  mkdir -p "$state"
  local password db="$state/drive.db"
  password="drive-$(openssl rand -hex 6)"

  # The redirect is on the subshell and the server is exec'd, so no shell is left holding the
  # caller's output open after start returns.
  (cd "$root/backend" && DATABASE_URL="$db" exec .venv/bin/python -m uvicorn main:app \
    --host "$ip" --port "$api_port") >"$state/backend.log" 2>&1 </dev/null &
  wait_for "http://$ip:$api_port/api/health"

  (cd "$root" && DATABASE_URL="$db" PASSWORD="$password" backend/.venv/bin/python - <<'PY'
import os, sys
sys.path.insert(0, 'backend')
import main
with main.db() as conn:
    conn.execute("UPDATE profiles SET password_hash = ? WHERE username = 'kapekost'",
                 (main.hash_password(os.environ['PASSWORD']),))
    conn.commit()
PY
  )

  (cd "$root/mobile" && EXPO_PUBLIC_API_URL="http://$ip:$api_port" REACT_NATIVE_PACKAGER_HOSTNAME="$ip" \
    EXPO_NO_TELEMETRY=1 exec npx expo start --lan --port "$metro_port") >"$state/expo.log" 2>&1 </dev/null &
  wait_for "http://$ip:$metro_port/status"

  cat <<EOF
Backend  http://$ip:$api_port  (throwaway database)
Metro    exp://$ip:$metro_port
Login    kapekost / $password

Open it on an Android phone (USB debugging on, Expo Go matching the SDK):
  npx agent-device open host.exp.exponent exp://$ip:$metro_port --platform android --foreground
Stop with: bash scripts/mobile_drive.sh stop
EOF
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
