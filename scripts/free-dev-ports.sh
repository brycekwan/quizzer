#!/usr/bin/env bash
# Free the local dev ports so a new `npm run dev` can bind them.
#   npm run dev:free
#   bash scripts/free-dev-ports.sh

set -u

ports=(4200 8080)

listeners() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true
}

stop_port() {
  local port="$1"
  local signal="$2"
  local pids
  pids="$(listeners "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  local pid comm
  for pid in $pids; do
    comm="$(ps -p "$pid" -o comm= 2>/dev/null || echo "pid $pid")"
    echo "port $port: sending $signal to $comm ($pid)"
    kill "-$signal" "$pid" 2>/dev/null || true
  done
}

busy=0
for port in "${ports[@]}"; do
  if [[ -z "$(listeners "$port")" ]]; then
    echo "port $port is free"
    continue
  fi
  busy=1
  stop_port "$port" TERM
done

if [[ "$busy" -eq 0 ]]; then
  exit 0
fi

sleep 0.4

for port in "${ports[@]}"; do
  if [[ -n "$(listeners "$port")" ]]; then
    stop_port "$port" KILL
  fi
done

sleep 0.2

status=0
for port in "${ports[@]}"; do
  if [[ -n "$(listeners "$port")" ]]; then
    echo "port $port is still in use"
    status=1
  fi
done

if [[ "$status" -eq 0 ]]; then
  echo "ports 4200 and 8080 are free"
fi

exit "$status"
