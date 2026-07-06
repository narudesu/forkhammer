import test from "node:test";
import type { Config } from "src/config/config";
import { JiraClient } from "src/jira/jira";
import type { WorkerContext } from "src/worker/context/types";
import {
  TestJiraClient,
  type CreateTestJiraClientOptions,
} from "src/worker/test/test-jira-client";

interface CreateTextContextOptions {
  empty?: true;
  jira?: CreateTestJiraClientOptions;
}

interface TableInsert {
  table: string;
  rows: unknown[];
}

export abstract class TestWorkerContext {
  abstract getContext: () => WorkerContext;
  abstract getInserts: () => TableInsert[];
  abstract testJiraClient: () => TestJiraClient;

  static create = createTestContext;
}

export function createTestContext(
  options: CreateTextContextOptions,
): TestWorkerContext {
  const inserts: TableInsert[] = [];

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
  const jira = testJiraClient?.getJiraClient() ?? JiraClient.create(jiraConfig);

  const workerContext: WorkerContext = {
    jira,
    workerConfig: {
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
    supabase: {
      from: (table: string) => ({
        insert: async (rows: unknown[]) => {
          inserts.push({ table, rows });
          return { data: rows, error: null };
        },
      }),
    } as unknown as WorkerContext["supabase"],
    auth: {
      activeTokenOrFail: () => ({
        getUserId: () => "user-1",
      }),
    } as WorkerContext["auth"],
    writer: {} as WorkerContext["writer"],
    stores: [],
    peerClient: {} as WorkerContext["peerClient"],
    validation: {} as WorkerContext["validation"],
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
    getContext: () => workerContext,
    getInserts: () => inserts,
  };
}
