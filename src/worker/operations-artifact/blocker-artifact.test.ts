import { describe, expect, test } from "bun:test";
import {
  buildBlockersArtifact,
  extractJiraKey,
  parseBlockerConfig,
  isBlockerIdentifier,
  getResolutionSuggestion,
} from "./blocker-artifact";

describe("blocker artifact helpers", () => {
  test("extracts a Jira key from a configured browse URL", () => {
    expect(extractJiraKey("https://cleevio.atlassian.net/browse/AT-1146")).toBe(
      "AT-1146",
    );
  });

  test("accepts only lowercase snake_case blocker identifiers", () => {
    expect(isBlockerIdentifier("document_management")).toBe(true);
    expect(isBlockerIdentifier("DocumentManagement")).toBe(false);
    expect(isBlockerIdentifier("document-management")).toBe(false);
  });

  test("accepts an empty blocker file", () => {
    expect(parseBlockerConfig("")).toEqual([]);
  });

  test("keeps a missing Jira ticket with null fetched metadata", async () => {
    const result = await buildBlockersArtifact({
      filePath: "unused",
      readFile: async () => `
        [blockers.api]
        title = "API"
        [[blockers.api.blocked_tickets]]
        team = "fe"
        url = "https://jira.example.com/browse/AT-1"
      `,
      jira: {
        getIssueContext: async () => {
          throw new Error("jira-request-failed:404:not-found");
        },
      } as never,
      searchRelatedMergeRequests: async () => [],
    });

    expect(result[0]?.blockedTickets[0]).toMatchObject({
      key: "AT-1",
      title: null,
      status: null,
    });
  });

  test("reports resolution evidence from Jira and GitLab", () => {
    expect(
      getResolutionSuggestion({
        allJiraResolved: true,
        allMergeRequestsMerged: false,
      }),
    ).toEqual({
      suggestedResolved: true,
      suggestionSources: ["jira"],
      suggestionReason: "All linked Jira tickets are resolved.",
    });
  });
});
