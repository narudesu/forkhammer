import type { Config } from "src/config/config";
import { JiraClient } from "src/jira/jira";
import type { WorkerContext } from "src/worker/context/types";
import {
  TestJiraClient,
  type CreateTestJiraClientOptions,
} from "src/worker/test/test-jira-client";
import {
  TestSupabaseClient,
  type CreateTestSupabaseClientOptions,
} from "src/worker/test/test-supabase-client";

interface CreateTextContextOptions {
  empty?: true;
  jira?: CreateTestJiraClientOptions;
  supabase?: CreateTestSupabaseClientOptions;
}

export abstract class TestWorkerContext {
  abstract getContext: () => WorkerContext;
  abstract testJiraClient: () => TestJiraClient;
  abstract testSupabaseClient: () => TestSupabaseClient;

  static create = createTestContext;
}

export function createTestContext(
  options: CreateTextContextOptions,
): TestWorkerContext {
  const jiraConfig: NonNullable<Config["jira"]> = {
    url: "https://example.atlassian.net",
    auth: "user:token",
    filters: {
      inbox: {
        filter_id: "10000",
      },
    },
  };
  const testJiraClient = options.jira
    ? TestJiraClient.createMocked(options.jira)
    : null;
  const testSupabaseClient = TestSupabaseClient.createMocked(options.supabase);
  const jira = testJiraClient?.getJiraClient() ?? JiraClient.create(jiraConfig);

  const workerContext: WorkerContext = {
    jira,
    workerConfig: {
      project: {},
      jira: jiraConfig,
      supabase: {
        url: "https://example.supabase.co",
        anon_key: "anon-key",
        table: "events",
        auth: {
          type: "secret_string",
          secret_string: "secret",
          function_url: "https://example.supabase.co/functions/v1/auth",
        },
      },
      worker: {
        snapshots: {
          directory: "/tmp/forkhammer-test-snapshots",
        },
      },
    },
    supabase: testSupabaseClient.getSupabaseClient(),
    auth: {
      activeTokenOrFail: () => ({
        getUserId: () => "user-1",
      }),
    } as WorkerContext["auth"],
    writer: {} as WorkerContext["writer"],
    pi: {} as WorkerContext["pi"],
    stores: [],
    peerClient: {} as WorkerContext["peerClient"],
    snapshots: {} as WorkerContext["snapshots"],
    log: {
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  return {
    testJiraClient: () => {
      if (testJiraClient) {
        return testJiraClient;
      }
      throw new Error("test-jira-client-not-configured");
    },
    testSupabaseClient: () => testSupabaseClient,
    getContext: () => workerContext,
  };
}
