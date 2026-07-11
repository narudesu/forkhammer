import { expect, test } from "bun:test";
import { parseUltrafeedEventData } from "src/worker/events";

test("validation requests default their provider to OpenCode", () => {
  expect(
    parseUltrafeedEventData("validate_issue_requested", { issue_key: "AT-1" }),
  ).toEqual({
    issue_key: "AT-1",
    provider: "opencode",
  });
});

test("Pi validation lifecycle data accepts persisted JSONL metadata", () => {
  const data = parseUltrafeedEventData("issue_validated", {
    provider: "pi",
    issue_key: "AT-1",
    project_key: "AT",
    project_name: "atomika",
    session_id: "session-1",
    worktree_name: "AT-1",
    worktree_branch: "f/AT-1",
    worktree_directory: "/trees/atomika/AT-1",
    pi_session_file: "session.jsonl",
    source: "forkhammer",
    jira_summary: "Summary",
    questions: [],
    summary: "Plan",
    todos: [],
    relatedFiles: [],
    clarity: 10,
  });
  expect(data).toMatchObject({
    provider: "pi",
    pi_session_file: "session.jsonl",
  });
});
