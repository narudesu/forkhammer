import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createValidationStore } from "./validation-store";
import { createTestExecutionContext } from "../test-utils";

describe("validation store", () => {
  it("dispatches validation once for a pending request", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls);
    const store = createValidationStore(ctx);

    store.reduce({
      id: "1",
      created_at: "2026-01-01",
      event_type: "validate_issue_requested",
      data: { issue_key: "AT-123" },
    });

    await store.reconcile();
    await store.reconcile();

    assert.deepEqual(calls, ["runIssueValidation:AT-123"]);
  });

  it("does not dispatch after validation has already started", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls);
    const store = createValidationStore(ctx);

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

    assert.deepEqual(calls, []);
  });

  it("captures validation failure without retrying immediately", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls, {
      validation: {
        runIssueValidation: async () => {
          calls.push("runIssueValidation:AT-123");
          throw new Error("validation failed");
        },
      },
      log: {
        debug: () => {},
        warn: () => {},
        error: (...args: unknown[]) => {
          calls.push(`error:${args.join(" ")}`);
        },
      },
    });
    const store = createValidationStore(ctx);

    store.reduce({
      id: "1",
      created_at: "2026-01-01",
      event_type: "validate_issue_requested",
      data: { issue_key: "AT-123" },
    });

    await store.reconcile();
    await store.reconcile();

    assert.deepEqual(calls.map(stripAnsi), [
      "runIssueValidation:AT-123",
      "error:[validation] failure validation for AT-123: validation failed",
    ]);
  });
});

function stripAnsi(value: string): string {
  return value.replace(new RegExp("\\x1B\\[[0-9;]*m", "g"), "");
}
