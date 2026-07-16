import { describe, expect, test } from "bun:test";
import {
  deduplicateMergeRequests,
  matchesJiraKey,
  selectPipelineInvestigation,
} from "./gitlab-artifact";

describe("GitLab artifact helpers", () => {
  test("matches an exact Jira key in MR text", () => {
    expect(matchesJiraKey("Fix AT-12 and update docs", "AT-12")).toBe(true);
    expect(matchesJiraKey("Fix AT-123", "AT-12")).toBe(false);
  });

  test("deduplicates related MRs by project and IID", () => {
    const mrs = [
      { project: "Frontend", iid: 4 },
      { project: "Frontend", iid: 4 },
      { project: "Backend", iid: 4 },
    ];
    expect(deduplicateMergeRequests(mrs)).toEqual([
      { project: "Frontend", iid: 4 },
      { project: "Backend", iid: 4 },
    ]);
  });

  test("selects the latest successful baseline and earliest later failure", () => {
    const result = selectPipelineInvestigation(
      [
        { id: 1, status: "success", updatedAt: "2026-07-10T10:00:00Z" },
        { id: 2, status: "failed", updatedAt: "2026-07-11T10:00:00Z" },
        { id: 3, status: "failed", updatedAt: "2026-07-12T10:00:00Z" },
      ],
      { id: 3, status: "failed", updatedAt: "2026-07-12T10:00:00Z" },
    );

    expect(result.baseline?.id).toBe(1);
    expect(result.firstFailure?.id).toBe(2);
  });
});
