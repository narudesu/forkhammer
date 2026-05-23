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
        "issue_validated",
        "issue_validation_failed",
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
});
