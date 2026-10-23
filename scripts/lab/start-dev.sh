#!/usr/bin/env bash
# Starts the local Worker (wrangler dev, :8787) and the UI (next dev, :3000) in the background
# against the running local Supabase, waits until both answer, and writes logs to $LOG_DIR.
# Run `npx vite-node scripts/lab/write-local-env.ts` first. `npm run build` overwrites the UI's
# .next directory, so restart this after a build.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
log_dir="${LOG_DIR:-${TMPDIR:-/tmp}/scout-lab}"
mkdir -p "$log_dir"

stop_port() {
  local pid
  for pid in $(ss -ltnp 2>/dev/null | awk -v port=":$1" '$4 ~ port"$" {print}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    kill "$pid" 2>/dev/null || true
  done
}

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 90); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" != "000" ]; then
      echo "$name ready: $url"
      return 0
    fi
    sleep 1
  done
  echo "$name did not start; see $log_dir" >&2
  return 1
}

stop_port 8787
stop_port 3000
rm -rf "$root/apps/web/.next"
(cd "$root/apps/worker" && nohup npx wrangler dev --local --port 8787 --ip 127.0.0.1 >"$log_dir/wrangler.log" 2>&1 &)
(cd "$root/apps/web" && nohup npx next dev -p 3000 >"$log_dir/next.log" 2>&1 &)
wait_for http://127.0.0.1:8787/health worker
wait_for http://127.0.0.1:3000/ web
