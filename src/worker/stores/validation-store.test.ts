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
      data: {
        issue_key: "AT-123",
        project_key: "at",
        project_name: "Alpha Team",
        project_id: "project-1",
        session_id: "session-1",
        worktree_name: "AT-123",
        worktree_branch: "AT-123",
        worktree_directory: "/work/alpha/AT-123",
        issue_summary: "Fix the thing",
        jira_description: "Longer description",
        issue_comments: [],
      },
    });

    await store.reconcile();

    assert.deepEqual(calls, []);
  });

  it("dispatches prompt requests once", async () => {
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
      event_type: "validate_issue_prompt_requested",
      data: {
        issue_key: "AT-123",
        project_key: "at",
        project_name: "Alpha Team",
        project_id: "project-1",
        session_id: "session-1",
        worktree_name: "AT-123",
        worktree_branch: "AT-123",
        worktree_directory: "/work/alpha/AT-123",
        prompt: "Add a follow up note",
      },
    });

    await store.reconcile();
    await store.reconcile();

    assert.deepEqual(calls, [
      "runIssuePrompt:AT-123",
      "runIssueValidation:AT-123",
    ]);
  });

  it("starts validation while a prompt is still pending", async () => {
    const calls: string[] = [];
    let releasePrompt: () => void = () => {};
    const promptStarted = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });
    const ctx = createTestExecutionContext(calls, {
      validation: {
        runIssuePrompt: async ({ issueKey }: { issueKey: string }) => {
          calls.push(`prompt:start:${issueKey}`);
          await promptStarted;
          calls.push(`prompt:done:${issueKey}`);
        },
        runIssueValidation: async ({ key }: { key: string }) => {
          calls.push(`validation:start:${key}`);
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
    store.reduce({
      id: "2",
      created_at: "2026-01-01",
      event_type: "validate_issue_prompt_requested",
      data: {
        issue_key: "AT-123",
        project_key: "at",
        project_name: "Alpha Team",
        project_id: "project-1",
        session_id: "session-1",
        worktree_name: "AT-123",
        worktree_branch: "AT-123",
        worktree_directory: "/work/alpha/AT-123",
        prompt: "Add a follow up note",
      },
    });

    const reconcile = store.reconcile();
    await Promise.resolve();

    assert.deepEqual(calls, ["prompt:start:AT-123", "validation:start:AT-123"]);

    releasePrompt();
    await reconcile;
  });

  it("captures validation failure without retrying immediately", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls, {
      validation: {
        runIssueValidation: async () => {
          calls.push("runIssueValidation:AT-123");
          throw new Error("validation failed");
        },
        runIssuePrompt: async () => {
          calls.push("runIssuePrompt:AT-123");
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

  it("starts multiple validations in parallel", async () => {
    const calls: string[] = [];
    let releaseFirst: () => void = () => {};
    let releaseSecond: () => void = () => {};
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const ctx = createTestExecutionContext(calls, {
      validation: {
        runIssueValidation: async ({ key }: { key: string }) => {
          calls.push(`validation:start:${key}`);

          if (key === "AT-123") {
            await firstStarted;
          } else {
            await secondStarted;
          }

          calls.push(`validation:done:${key}`);
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
    store.reduce({
      id: "2",
      created_at: "2026-01-01",
      event_type: "validate_issue_requested",
      data: { issue_key: "AT-124" },
    });

    const reconcile = store.reconcile();
    await Promise.resolve();

    assert.deepEqual(calls, [
      "validation:start:AT-123",
      "validation:start:AT-124",
    ]);

    releaseFirst();
    releaseSecond();
    await reconcile;

    assert.deepEqual(calls, [
      "validation:start:AT-123",
      "validation:start:AT-124",
      "validation:done:AT-123",
      "validation:done:AT-124",
    ]);
  });
});

function stripAnsi(value: string): string {
  return value.replace(new RegExp("\\x1B\\[[0-9;]*m", "g"), "");
}
