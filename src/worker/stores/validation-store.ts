import chalk from "chalk";
import type { ExecutionContext } from "../context";
import { getIssueKey, isWorkerEmittedEventType } from "../domain";
import { parseUltrafeedEventData } from "../events";
import type { FeedEvent } from "../types";
import type { StoreSnapshot, WorkerStore } from "./types";

type IssueState = {
  requestEventId: string | null;
  started: boolean;
  completed: boolean;
  dispatchedRequestEventId: string | null;
  lastError: string | null;
};

type ValidationStoreState = {
  issues: Record<string, IssueState>;
};

const VALIDATION_EVENT_TYPES = new Set([
  "validate_issue_requested",
  "validate_issue_started",
  "issue_validated",
  "issue_validation_failed",
]);
const storeLabel = chalk.cyan.bold("[validation]");
const requestLabel = chalk.yellow.bold("request");
const sideEffectLabel = chalk.magenta.bold("side effect");
const successLabel = chalk.green.bold("success");
const failureLabel = chalk.red.bold("failure");

export function createValidationStore(
  ctx: ExecutionContext,
): WorkerStore<ValidationStoreState> {
  const state: ValidationStoreState = {
    issues: {},
  };

  let cursor: StoreSnapshot["cursor"] = null;
  let reducedEventsSinceSnapshot = 0;
  let forceSnapshot = false;

  return {
    name: "validation",
    reduce(event: FeedEvent) {
      if (!VALIDATION_EVENT_TYPES.has(event.event_type)) {
        return false;
      }

      if (!isAfterCurrentCursor(cursor, event)) {
        return false;
      }

      const issueKey = getIssueKey(event);
      if (!issueKey) {
        return false;
      }

      const issue = getOrCreateIssue(state, issueKey);

      if (event.event_type === "validate_issue_requested") {
        ctx.log.debug(
          `${storeLabel} ${requestLabel} received for ${chalk.green(issueKey)} (${chalk.white(event.id)})`,
        );
        issue.requestEventId = event.id;
        issue.started = false;
        issue.completed = false;
        issue.dispatchedRequestEventId = null;
        issue.lastError = null;
      } else if (event.event_type === "validate_issue_started") {
        issue.started = true;
        ctx.log.debug(
          `${storeLabel} ${sideEffectLabel} started for ${chalk.green(issueKey)}`,
        );
      } else if (event.event_type === "issue_validated") {
        issue.completed = true;
        issue.lastError = null;
        ctx.log.debug(
          `${storeLabel} ${successLabel} completed for ${chalk.green(issueKey)}`,
        );
      } else if (event.event_type === "issue_validation_failed") {
        issue.completed = false;
        const parsed = parseUltrafeedEventData(event.event_type, event.data);
        const error = parsed?.error;
        issue.lastError = typeof error === "string" ? error : null;
        ctx.log.debug(
          `${storeLabel} ${failureLabel} for ${chalk.green(issueKey)}: ${chalk.red(issue.lastError ?? "unknown error")}`,
        );
      }

      cursor = { created_at: event.created_at, id: event.id };
      reducedEventsSinceSnapshot += 1;
      return true;
    },
    async reconcile() {
      let mutated = false;

      for (const [issueKey, issue] of Object.entries(state.issues)) {
        if (!issue.requestEventId) {
          continue;
        }

        if (issue.started || issue.completed) {
          continue;
        }

        if (issue.dispatchedRequestEventId === issue.requestEventId) {
          continue;
        }

        issue.dispatchedRequestEventId = issue.requestEventId;
        mutated = true;

        try {
          ctx.log.debug(
            `${storeLabel} ${sideEffectLabel} dispatching validation for ${chalk.green(issueKey)}`,
          );
          await ctx.validation.runIssueValidation({ key: issueKey });
          ctx.log.debug(
            `${storeLabel} ${successLabel} dispatched validation for ${chalk.green(issueKey)}`,
          );
        } catch (error) {
          issue.lastError =
            error instanceof Error ? error.message : String(error);
          ctx.log.error(
            `${storeLabel} ${failureLabel} validation for ${chalk.green(issueKey)}: ${chalk.red(issue.lastError)}`,
          );
        }
      }

      if (mutated) {
        forceSnapshot = true;
      }

      return mutated;
    },
    hydrate(snapshot: StoreSnapshot<ValidationStoreState> | null) {
      state.issues = snapshot?.state.issues ?? {};
      cursor = snapshot?.cursor ?? null;
      reducedEventsSinceSnapshot = snapshot?.reducedEventsSinceSnapshot ?? 0;
      forceSnapshot = false;
    },
    snapshot() {
      return {
        version: 1 as const,
        cursor,
        reducedEventsSinceSnapshot,
        state,
      };
    },
    needsSnapshot() {
      return forceSnapshot || reducedEventsSinceSnapshot >= 10;
    },
    markSnapshotPersisted() {
      reducedEventsSinceSnapshot = 0;
      forceSnapshot = false;
    },
    getCursor() {
      return cursor;
    },
  };
}

function getOrCreateIssue(
  state: ValidationStoreState,
  issueKey: string,
): IssueState {
  const existing = state.issues[issueKey];
  if (existing) {
    return existing;
  }

  const created: IssueState = {
    requestEventId: null,
    started: false,
    completed: false,
    dispatchedRequestEventId: null,
    lastError: null,
  };
  state.issues[issueKey] = created;
  return created;
}

function isAfterCurrentCursor(
  cursor: StoreSnapshot["cursor"],
  event: FeedEvent,
) {
  if (!cursor) {
    return true;
  }

  if (event.created_at !== cursor.created_at) {
    return event.created_at > cursor.created_at;
  }

  return event.id > cursor.id;
}
