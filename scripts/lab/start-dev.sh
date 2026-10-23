#!/usr/bin/env bash
# Starts the local Worker (wrangler dev, :8787) and the UI (next dev, :3000) in the background
# against the running local Supabase, waits until both answer, and writes logs to $LOG_DIR.
# Run `npx vite-node scripts/lab/write-local-env.ts` first. `npm run build` overwrites the UI's
# .next directory, so restart this after a build. WORKER_RUNTIME=node serves the same Worker
# from Node (scripts/lab/node-worker-server.ts), which can reach LLM providers through an egress
# proxy that local workerd ignores.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
log_dir="${LOG_DIR:-${TMPDIR:-/tmp}/scout-lab}"
mkdir -p "$log_dir"

stop_port() {
  fuser -k "$1/tcp" >/dev/null 2>&1 || true
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
if [ "${WORKER_RUNTIME:-wrangler}" = "node" ]; then
  (cd "$root" && nohup npx vite-node scripts/lab/node-worker-server.ts >"$log_dir/worker.log" 2>&1 &)
else
  (cd "$root/apps/worker" && nohup npx wrangler dev --local --port 8787 --ip 127.0.0.1 >"$log_dir/worker.log" 2>&1 &)
fi
(cd "$root/apps/web" && nohup npx next dev -p 3000 >"$log_dir/next.log" 2>&1 &)
wait_for http://127.0.0.1:8787/health worker
wait_for http://127.0.0.1:3000/ web
