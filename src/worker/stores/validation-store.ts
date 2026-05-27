import chalk from "chalk";
import type { ExecutionContext } from "../context";
import { getIssueKey } from "../domain";
import { parseUltrafeedEventData } from "../events";
import type { UltrafeedEventData } from "../events";
import type { FeedEvent } from "../types";
import type { StoreSnapshot, WorkerStore } from "./types";

type IssueState = {
  requestEventId: string | null;
  started: boolean;
  completed: boolean;
  dispatchedRequestEventId: string | null;
  lastError: string | null;
  promptRequests: Record<string, PromptRequestState>;
  lastPromptRequestEventId: string | null;
  lastPromptError: string | null;
};

type PromptRequestState = {
  requestEventId: string;
  issueKey: string;
  prompt: string;
  projectKey: string;
  projectName: string;
  projectId: string;
  sessionId: string;
  worktreeName: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  dispatched: boolean;
};

type ValidationStoreState = {
  issues: Record<string, IssueState>;
};

const VALIDATION_EVENT_TYPES = new Set([
  "validate_issue_requested",
  "validate_issue_started",
  "validate_issue_prompt_requested",
  "validate_issue_prompt_completed",
  "validate_issue_prompt_failed",
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
        issue.promptRequests = {};
        issue.lastPromptRequestEventId = null;
        issue.lastPromptError = null;
      } else if (event.event_type === "validate_issue_started") {
        issue.started = true;
        ctx.log.debug(
          `${storeLabel} ${sideEffectLabel} started for ${chalk.green(issueKey)}`,
        );
      } else if (event.event_type === "validate_issue_prompt_requested") {
        const parsed = parseUltrafeedEventData(
          event.event_type,
          event.data,
        ) as UltrafeedEventData<"validate_issue_prompt_requested"> | null;
        if (!parsed) {
          return false;
        }

        issue.promptRequests[event.id] = {
          requestEventId: event.id,
          issueKey: parsed.issue_key,
          prompt: parsed.prompt,
          projectKey: parsed.project_key,
          projectName: parsed.project_name,
          projectId: parsed.project_id,
          sessionId: parsed.session_id,
          worktreeName: parsed.worktree_name,
          worktreeBranch: parsed.worktree_branch,
          worktreeDirectory: parsed.worktree_directory,
          dispatched: false,
        };
        issue.lastPromptError = null;
        ctx.log.debug(
          `${storeLabel} ${requestLabel} prompt queued for ${chalk.green(issueKey)} (${chalk.white(event.id)})`,
        );
      } else if (event.event_type === "validate_issue_prompt_completed") {
        const parsed = parseUltrafeedEventData(
          event.event_type,
          event.data,
        ) as UltrafeedEventData<"validate_issue_prompt_completed"> | null;
        if (!parsed) {
          return false;
        }

        delete issue.promptRequests[parsed.request_event_id];
        issue.lastPromptRequestEventId = parsed.request_event_id;
        issue.lastPromptError = null;
        ctx.log.debug(
          `${storeLabel} ${successLabel} prompt completed for ${chalk.green(issueKey)} (${chalk.white(parsed.request_event_id)})`,
        );
      } else if (event.event_type === "validate_issue_prompt_failed") {
        const parsed = parseUltrafeedEventData(
          event.event_type,
          event.data,
        ) as UltrafeedEventData<"validate_issue_prompt_failed"> | null;
        if (!parsed) {
          return false;
        }

        delete issue.promptRequests[parsed.request_event_id];
        issue.lastPromptRequestEventId = parsed.request_event_id;
        issue.lastPromptError = parsed.error;
        ctx.log.debug(
          `${storeLabel} ${failureLabel} prompt for ${chalk.green(issueKey)} (${chalk.white(parsed.request_event_id)}): ${chalk.red(parsed.error)}`,
        );
      } else if (event.event_type === "issue_validated") {
        issue.completed = true;
        issue.lastError = null;
        ctx.log.debug(
          `${storeLabel} ${successLabel} completed for ${chalk.green(issueKey)}`,
        );
      } else if (event.event_type === "issue_validation_failed") {
        issue.completed = false;
        const parsed = parseUltrafeedEventData(
          event.event_type,
          event.data,
        ) as UltrafeedEventData<"issue_validation_failed"> | null;
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
      const dispatches: Array<Promise<void>> = [];

      for (const [issueKey, issue] of Object.entries(state.issues)) {
        for (const promptRequest of Object.values(issue.promptRequests)) {
          if (promptRequest.dispatched) {
            continue;
          }

          promptRequest.dispatched = true;
          mutated = true;

          dispatches.push(
            (async () => {
              try {
                ctx.log.debug(
                  `${storeLabel} ${sideEffectLabel} dispatching prompt for ${chalk.green(issueKey)} (${chalk.white(promptRequest.requestEventId)})`,
                );
                await ctx.validation.runIssuePrompt({
                  issueKey,
                  requestEventId: promptRequest.requestEventId,
                  prompt: promptRequest.prompt,
                  projectKey: promptRequest.projectKey,
                  projectName: promptRequest.projectName,
                  projectId: promptRequest.projectId,
                  sessionId: promptRequest.sessionId,
                  worktreeName: promptRequest.worktreeName,
                  worktreeBranch: promptRequest.worktreeBranch,
                  worktreeDirectory: promptRequest.worktreeDirectory,
                });
                ctx.log.debug(
                  `${storeLabel} ${successLabel} dispatched prompt for ${chalk.green(issueKey)} (${chalk.white(promptRequest.requestEventId)})`,
                );
              } catch (error) {
                issue.lastPromptError =
                  error instanceof Error ? error.message : String(error);
                ctx.log.error(
                  `${storeLabel} ${failureLabel} prompt for ${chalk.green(issueKey)} (${chalk.white(promptRequest.requestEventId)}): ${chalk.red(issue.lastPromptError)}`,
                );
              }
            })(),
          );
        }

        if (!issue.requestEventId || issue.started || issue.completed) {
          continue;
        }

        if (issue.dispatchedRequestEventId === issue.requestEventId) {
          continue;
        }

        issue.dispatchedRequestEventId = issue.requestEventId;
        mutated = true;

        dispatches.push(
          (async () => {
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
    hydrate(snapshot: StoreSnapshot<ValidationStoreState> | null) {
      state.issues = Object.fromEntries(
        Object.entries(snapshot?.state.issues ?? {}).map(
          ([issueKey, issue]) => [issueKey, normalizeIssueState(issue)],
        ),
      );
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
    return normalizeIssueState(existing);
  }

  const created: IssueState = {
    requestEventId: null,
    started: false,
    completed: false,
    dispatchedRequestEventId: null,
    lastError: null,
    promptRequests: {},
    lastPromptRequestEventId: null,
    lastPromptError: null,
  };
  state.issues[issueKey] = created;
  return created;
}

function normalizeIssueState(issue: Partial<IssueState>): IssueState {
  issue.requestEventId ??= null;
  issue.started ??= false;
  issue.completed ??= false;
  issue.dispatchedRequestEventId ??= null;
  issue.lastError ??= null;
  issue.promptRequests ??= {};
  issue.lastPromptRequestEventId ??= null;
  issue.lastPromptError ??= null;

  return issue as IssueState;
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
