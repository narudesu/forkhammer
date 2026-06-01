import chalk from "chalk";
import { getJiraInboxIssues } from "../../jira";
import type { ExecutionContext } from "../context";
import { parseUltrafeedEventData } from "../events";
import type { FeedEvent } from "../types";
import type { EventCursor, StoreSnapshot, WorkerStore } from "./types";

type JiraArtifactStoreState = {
  requests: Record<
    string,
    {
      eventId: string;
      dispatched: boolean;
      error: string | null;
    }
  >;
};

const storeLabel = chalk.cyan.bold("[jira-artifact]");

export function createJiraArtifactStore(
  ctx: ExecutionContext,
): WorkerStore<JiraArtifactStoreState> {
  const state: JiraArtifactStoreState = {
    requests: {},
  };

  let reducedEventsSinceSnapshot = 0;
  let forceSnapshot = false;

  return {
    name: "jira-artifact",
    reduce(event: FeedEvent, cursor: EventCursor | null) {
      if (event.event_type !== "artifact_refresh_requested") {
        return false;
      }

      if (!isAfterCurrentCursor(cursor, event)) {
        return false;
      }

      const parsed = parseUltrafeedEventData(event.event_type, event.data);
      if (!parsed || !("type" in parsed) || parsed.type !== "jira_inbox") {
        return false;
      }

      if (state.requests[event.id]) {
        return false;
      }

      state.requests[event.id] = {
        eventId: event.id,
        dispatched: false,
        error: null,
      };

      reducedEventsSinceSnapshot += 1;
      return true;
    },
    async reconcile() {
      let mutated = false;
      const dispatches: Array<Promise<void>> = [];
      let userIdPromise: Promise<string> | null = null;

      for (const request of Object.values(state.requests)) {
        if (request.dispatched) {
          continue;
        }

        const jiraConfig = ctx.jira;
        const filterId = jiraConfig?.filters?.inbox?.filter_id;

        if (!jiraConfig || !filterId) {
          request.dispatched = true;
          request.error = "jira-filter-id-missing";
          mutated = true;
          ctx.log.warn(
            `${storeLabel} skipping Jira inbox refresh request ${chalk.white(request.eventId)} because jira.filters.inbox.filter_id is unset`,
          );
          continue;
        }

        request.dispatched = true;
        mutated = true;

        dispatches.push(
          (async () => {
            try {
              userIdPromise ??= ctx.supabase.getUserId();
              const userId = await userIdPromise;
              const issues = await getJiraInboxIssues(
                jiraConfig,
                ctx.runtime.fetch,
              );

              const { error } = await ctx.supabase.client
                .from("jira_artifacts")
                .insert([
                  {
                    id: request.eventId,
                    user_id: userId,
                    content: issues,
                  },
                ]);

              if (error) {
                if (isDuplicateInsertError(error.message)) {
                  request.error = null;
                  ctx.log.debug(
                    `${storeLabel} duplicate Jira inbox snapshot ignored for ${chalk.white(request.eventId)}`,
                  );
                  return;
                }

                throw new Error(error.message);
              }

              request.error = null;
              ctx.log.debug(
                `${storeLabel} published Jira inbox snapshot for ${chalk.white(request.eventId)} with ${chalk.green(String(issues.length))} issues`,
              );
            } catch (error) {
              request.error =
                error instanceof Error ? error.message : String(error);
              ctx.log.error(
                `${storeLabel} failed to publish Jira inbox snapshot for ${chalk.white(request.eventId)}: ${chalk.red(request.error)}`,
              );
            }
          })(),
        );
      }

      if (dispatches.length > 0) {
        await Promise.all(dispatches);
      }

      if (mutated) {
        forceSnapshot = true;
      }

      return mutated;
    },
    hydrate(snapshot: StoreSnapshot<JiraArtifactStoreState> | null) {
      state.requests = snapshot?.state.requests ?? {};
      reducedEventsSinceSnapshot = snapshot?.reducedEventsSinceSnapshot ?? 0;
      forceSnapshot = false;
    },
    snapshot() {
      return {
        version: 1 as const,
        reducedEventsSinceSnapshot,
        state,
      };
    },
    needsSnapshot() {
      return forceSnapshot || reducedEventsSinceSnapshot >= 1;
    },
    markSnapshotPersisted() {
      reducedEventsSinceSnapshot = 0;
      forceSnapshot = false;
    },
  };
}

function isAfterCurrentCursor(cursor: EventCursor | null, event: FeedEvent) {
  if (!cursor) {
    return true;
  }

  if (event.created_at !== cursor.created_at) {
    return event.created_at > cursor.created_at;
  }

  return event.id > cursor.id;
}

function isDuplicateInsertError(message: string) {
  return message.includes("duplicate key") || message.includes("23505");
}
