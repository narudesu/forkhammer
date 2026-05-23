#!/usr/bin/env bash
set -eu

opencode serve --hostname "0.0.0.0" --port "8000" &
OPENCODE_PID=$!

forkhammer start-worker &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" "$OPENCODE_PID" 2>/dev/null || true
  wait "$WORKER_PID" "$OPENCODE_PID" 2>/dev/null || true
}

trap cleanup INT TERM

wait -n "$WORKER_PID" "$OPENCODE_PID"
cleanup
