#!/usr/bin/env bash
# Runs the mobile app against a throwaway backend on this machine's LAN address, so a phone on the
# same Wi-Fi can drive it. The real database is never touched.
#
#   bash scripts/mobile_drive.sh start   # backend + Expo dev server, prints login and the open command
#   bash scripts/mobile_drive.sh stop    # stops both and deletes the throwaway database
#
# Needs backend/.venv and mobile/node_modules (see AGENTS.md). Override with LAN_IP, API_PORT,
# METRO_PORT, and MOBILE_DRIVE_BASE (the directory that holds the wt-mobile-drive state folder).
# Both servers speak plain HTTP on the LAN: run it on a trusted network only, and stop it when done.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
state=${MOBILE_DRIVE_BASE:-${TMPDIR:-/tmp}}/wt-mobile-drive
api_port=${API_PORT:-8083}
metro_port=${METRO_PORT:-8082}
ip=${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}
ok=0

listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

# Wait for a URL to answer, failing fast if the server we started has already exited. On a
# timeout, also stop whatever listens on the port: npx is a wrapper, so its pid is not the server's.
wait_for() { # url pid port
  local _
  for _ in $(seq 1 60); do
    curl -fs "$1" >/dev/null 2>&1 && return 0
    kill -0 "$2" 2>/dev/null || { echo "server exited early:" >&2; tail -n 5 "$state"/*.log >&2; return 1; }
    sleep 1
  done
  kill "$2" "$(listening "$3")" 2>/dev/null || true
  echo "timed out waiting for $1:" >&2
  tail -n 5 "$state"/*.log >&2
  return 1
}

# Remember the pid that listens on a port. The ports were free before start, so it is ours. If it
# cannot be seen, stop the server we launched rather than leave one that stop cannot find.
record() { # port pid
  local listener
  listener=$(listening "$1")
  [ -n "$listener" ] || { kill "$2" 2>/dev/null || true; echo "no listener found on port $1" >&2; return 1; }
  echo "$1 $listener" >>"$state/pids"
}

stop() {
  local port pid
  if [ -f "$state/pids" ]; then
    while read -r port pid; do
      # Only a pid that still listens on the port it was recorded for, never a reused one.
      if [ -n "$pid" ] && [ "$(listening "$port")" = "$pid" ]; then kill "$pid" && echo "stopped $pid"; fi
    done <"$state/pids"
  fi
  rm -r "$state" 2>/dev/null || true
}

start() {
  [ -n "$ip" ] && [ "$ip" != 0.0.0.0 ] || { echo "no usable LAN address; set LAN_IP to this machine's Wi-Fi address" >&2; exit 1; }
  [ -x "$root/backend/.venv/bin/python" ] || { echo "missing backend/.venv" >&2; exit 1; }
  [ -d "$root/mobile/node_modules" ] || { echo "missing mobile/node_modules" >&2; exit 1; }
  [ -z "$(listening "$api_port")$(listening "$metro_port")" ] || {
    echo "port $api_port or $metro_port is already in use; set API_PORT or METRO_PORT, or stop the other server" >&2
    exit 1
  }

  # A private directory that must not exist yet, so nobody can pre-create it or swap it for a link.
  umask 077
  mkdir "$state" || { echo "cannot create $state (already running? run stop first)" >&2; exit 1; }
  trap '[ "$ok" = 1 ] || stop' EXIT

  local password db="$state/drive.db"
  password="drive-$(openssl rand -hex 10)"

  # The redirect is on the subshell and the server is exec'd, so no shell is left holding the
  # caller's output open after start returns.
  (cd "$root/backend" && DATABASE_URL="$db" exec .venv/bin/python -m uvicorn main:app \
    --host "$ip" --port "$api_port") >"$state/backend.log" 2>&1 </dev/null &
  api_job=$!
  wait_for "http://$ip:$api_port/api/health" "$api_job" "$api_port"
  record "$api_port" "$api_job"

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
  metro_job=$!
  wait_for "http://$ip:$metro_port/status" "$metro_job" "$metro_port"
  record "$metro_port" "$metro_job"
  ok=1

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
