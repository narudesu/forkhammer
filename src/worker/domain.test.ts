import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getIssueKey,
  isSupportedRequestEventType,
  isWorkerEmittedEventType,
  parseLoginResponse,
} from "./domain";
import { parseUltrafeedEventData } from "./events";

describe("worker domain", () => {
  it("detects worker emitted event types", () => {
    assert.equal(isWorkerEmittedEventType("issue_validated"), true);
    assert.equal(isWorkerEmittedEventType("validate_issue_requested"), false);
  });

  it("detects supported request event type", () => {
    assert.equal(isSupportedRequestEventType("validate_issue_requested"), true);
    assert.equal(
      isSupportedRequestEventType("artifact_refresh_requested"),
      true,
    );
    assert.equal(isSupportedRequestEventType("other"), false);
  });

  it("parses event data from json string", () => {
    assert.deepEqual(
      parseUltrafeedEventData(
        "validate_issue_requested",
        '{"issue_key":"AT-123"}',
      ),
      {
        issue_key: "AT-123",
      },
    );
  });

  it("drops extra event fields", () => {
    assert.deepEqual(
      parseUltrafeedEventData("issue_validation_failed", {
        issue_key: "AT-123",
        error: "boom",
        extra: "ignored",
      }),
      {
        issue_key: "AT-123",
        error: "boom",
      },
    );
  });

  it("returns null for invalid event data", () => {
    assert.equal(
      parseUltrafeedEventData("validate_issue_requested", "not-json"),
      null,
    );
    assert.equal(
      parseUltrafeedEventData("validate_issue_requested", null),
      null,
    );
    assert.equal(
      parseUltrafeedEventData("validate_issue_requested", ["x"]),
      null,
    );
  });

  it("extracts issue key from event", () => {
    assert.equal(
      getIssueKey({
        id: "1",
        created_at: "2026-01-01",
        event_type: "validate_issue_requested",
        data: { issue_key: "AT-123" },
      }),
      "AT-123",
    );
  });

  it("returns null when issue key is missing", () => {
    assert.equal(
      getIssueKey({
        id: "1",
        created_at: "2026-01-01",
        event_type: "validate_issue_requested",
        data: {},
      }),
      null,
    );
  });

  it("parses artifact refresh payloads", () => {
    assert.deepEqual(
      parseUltrafeedEventData("artifact_refresh_requested", {
        type: "jira_inbox",
      }),
      {
        type: "jira_inbox",
      },
    );
  });

  it("parses login response with token", () => {
    assert.deepEqual(parseLoginResponse('{"token":"abc"}', true), {
      responseOk: true,
      token: "abc",
      payloadError: null,
      payloadMessage: null,
      rawBody: '{"token":"abc"}',
    });
  });
});
