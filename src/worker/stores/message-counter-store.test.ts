import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestExecutionContext } from "../test-utils";
import { createMessageCounterStore } from "./message-counter-store";

describe("message counter store", () => {
  it("debounces console output across repeated reconciles", async () => {
    const ctx = createTestExecutionContext();
    const store = createMessageCounterStore(ctx);

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalConsoleLog = console.log;

    const timers = new Map<number, () => void>();
    const logs: Array<Array<unknown>> = [];
    let nextTimerId = 1;

    try {
      (globalThis as any).setTimeout = (
        callback: TimerHandler,
        _delay?: number,
      ) => {
        const timerId = nextTimerId++;
        timers.set(timerId, () => {
          if (typeof callback === "function") {
            callback();
          }
        });
        return timerId as unknown as ReturnType<typeof setTimeout>;
      };

      (globalThis as any).clearTimeout = (
        timerId: ReturnType<typeof setTimeout>,
      ) => {
        timers.delete(Number(timerId));
      };

      console.log = (...args: Array<unknown>) => {
        logs.push(args);
      };

      store.reduce({
        id: "1",
        created_at: "2026-01-01",
        event_type: "validate_issue_requested",
        data: { issue_key: "AT-123" },
      });
      store.reduce({
        id: "2",
        created_at: "2026-01-01",
        event_type: "validate_issue_started",
        data: { issue_key: "AT-123" },
      });

      await store.reconcile();

      store.reduce({
        id: "3",
        created_at: "2026-01-01",
        event_type: "issue_validated",
        data: { issue_key: "AT-123" },
      });

      await store.reconcile();

      assert.equal(timers.size, 1);

      const [timer] = timers.values();
      timer();

      assert.equal(logs.length, 1);
      assert.equal(
        stripAnsi(String(logs[0]?.[0])),
        "[message-counter] summary received 3 events; last=3 (issue_validated)",
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      console.log = originalConsoleLog;
    }
  });
});

function stripAnsi(value: string): string {
  return value.replace(new RegExp("\\x1B\\[[0-9;]*m", "g"), "");
}
