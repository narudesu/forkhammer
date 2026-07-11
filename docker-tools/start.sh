#!/usr/bin/env bash
set -eu

cd /app/forkhammer
bun run /app/forkhammer/src/run-cli.ts start-worker &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" 2>/dev/null || true
  wait "$WORKER_PID" 2>/dev/null || true
}

trap cleanup INT TERM

wait -n "$WORKER_PID"
cleanup
