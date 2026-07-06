import { type Mock, mock } from "bun:test";
import type { JiraClient } from "src/jira/jira";

export interface CreateTestJiraClientOptions {
  fakeIssues: unknown[];
}

export abstract class TestJiraClient {
  abstract getJiraClient: () => JiraClient;
  abstract mocks: {
    getJiraInboxIssues: Mock<() => Promise<unknown[]>>;
  };

  static createMocked = createMocked;
}

function createMocked(options: CreateTestJiraClientOptions): TestJiraClient {
  const getJiraInboxIssues = mock(async () => options.fakeIssues);

  const client: JiraClient = {} as JiraClient;

  Object.assign(client, { getJiraInboxIssues });

  return {
    mocks: {
      getJiraInboxIssues,
    },
    getJiraClient() {
      return client;
    },
  };
}
