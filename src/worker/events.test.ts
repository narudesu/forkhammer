import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ultrafeedEventDefinitions, parseUltrafeedEventData } from "./events";

describe("ultrafeed events", () => {
  it("documents the used event set", () => {
    assert.deepEqual(
      ultrafeedEventDefinitions.map((event) => event.eventType),
      [
        "validate_issue_requested",
        "validate_issue_started",
        "validate_issue_prompt_requested",
        "validate_issue_prompt_completed",
        "validate_issue_prompt_failed",
        "issue_validated",
        "issue_validation_failed",
        "browser_peer_ready",
        "artifact_refresh_requested",
      ],
    );
  });

  it("strips unknown keys while parsing", () => {
    assert.deepEqual(
      parseUltrafeedEventData("validate_issue_requested", {
        issue_key: "AT-123",
        extra: "ignored",
      }),
      {
        issue_key: "AT-123",
      },
    );
  });

  it("parses started payloads", () => {
    assert.deepEqual(
      parseUltrafeedEventData("validate_issue_started", {
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
        issue_comments: [
          {
            author: "Ada",
            body: "Please check this",
            createdAt: "2026-01-01T00:00:00.000Z",
            extra: "ignored",
          },
        ],
      }),
      {
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
        issue_comments: [
          {
            author: "Ada",
            body: "Please check this",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    );
  });

  it("parses prompt completion payloads", () => {
    assert.deepEqual(
      parseUltrafeedEventData("validate_issue_prompt_completed", {
        issue_key: "AT-123",
        project_key: "at",
        project_name: "Alpha Team",
        project_id: "project-1",
        session_id: "session-1",
        worktree_name: "AT-123",
        worktree_branch: "AT-123",
        worktree_directory: "/work/alpha/AT-123",
        request_event_id: "evt-1",
        prompt: "Add a follow up note",
        response: { ok: true },
      }),
      {
        issue_key: "AT-123",
        project_key: "at",
        project_name: "Alpha Team",
        project_id: "project-1",
        session_id: "session-1",
        worktree_name: "AT-123",
        worktree_branch: "AT-123",
        worktree_directory: "/work/alpha/AT-123",
        request_event_id: "evt-1",
        prompt: "Add a follow up note",
        response: { ok: true },
      },
    );
  });

  it("parses artifact refresh requests", () => {
    assert.deepEqual(
      parseUltrafeedEventData("artifact_refresh_requested", {
        type: "jira_inbox",
        extra: "ignored",
      }),
      {
        type: "jira_inbox",
      },
    );
  });
});
