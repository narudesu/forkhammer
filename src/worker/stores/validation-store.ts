import chalk from "chalk";
import {
  createEffect,
  createEvent,
  createStore,
  type Scope,
  sample,
  scopeBind,
} from "effector";
import { produce } from "immer";
import type { WorkerContext } from "src/worker/context/types";
import { getIssueKey } from "src/worker/domain";
import type { UltrafeedEventData } from "src/worker/events";
import { parseUltrafeedEventData } from "src/worker/events";
import { reconcileRequested } from "src/worker/events/store-events";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import { HydratableStore } from "src/worker/snapshot/effector-snapshots";
import {
  type EventCursor,
  isAfterCurrentCursor,
} from "src/worker/stores/types";

type IssueState = {
  requestEventId: string | null;
  started: boolean;
  completed: boolean;
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
};

export type ValidationStoreState = {
  issues: Record<string, IssueState>;
  cursor: EventCursor | null;
};

type ValidationRuntimeStoreState = {
  dispatchedValidationRequestIds: Record<string, true>;
  dispatchedPromptRequestIds: Record<string, true>;
  validationDispatchErrors: Record<string, string>;
  promptDispatchErrors: Record<string, string>;
};

type ValidationDispatchRequest = {
  ctx: WorkerContext;
  issueKey: string;
  requestEventId: string;
};

type PromptDispatchRequest = {
  ctx: WorkerContext;
  issueKey: string;
  promptRequest: PromptRequestState;
};

type DispatchRequestBatch<T> = {
  requests: T[];
  scope?: Scope;
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
const sideEffectLabel = chalk.magenta.bold("side effect");
const successLabel = chalk.green.bold("success");
const failureLabel = chalk.red.bold("failure");

export const $validationStore = createStore<ValidationStoreState>(
  {
    issues: {},
    cursor: null,
  },
  { sid: "validation" },
);

export const hydratableValidationStore =
  HydratableStore.fromEffectorStore($validationStore);

const $validationRuntimeStore = createStore<ValidationRuntimeStoreState>({
  dispatchedValidationRequestIds: {},
  dispatchedPromptRequestIds: {},
  validationDispatchErrors: {},
  promptDispatchErrors: {},
});

const validationDispatchQueued = createEvent<ValidationDispatchRequest>();
const promptDispatchQueued = createEvent<PromptDispatchRequest>();
const validationDispatchFailed = createEvent<{
  issueKey: string;
  requestEventId: string;
  error: unknown;
}>();
const promptDispatchFailed = createEvent<{
  issueKey: string;
  requestEventId: string;
  error: unknown;
}>();

$validationStore.on(feedEventReceived, (state, event) =>
  produce(state, (state) => {
    if (!VALIDATION_EVENT_TYPES.has(event.event_type)) {
      return;
    }

    if (!isAfterCurrentCursor(state.cursor, event)) {
      return;
    }

    const issueKey = getIssueKey(event);
    if (!issueKey) {
      return;
    }

    const issue = getOrCreateIssue(state, issueKey);

    if (event.event_type === "validate_issue_requested") {
      const parsed = parseUltrafeedEventData(
        event.event_type,
        event.data,
      ) as UltrafeedEventData<"validate_issue_requested"> | null;
      if (!parsed) return;
      issue.requestEventId = event.id;
      issue.started = false;
      issue.completed = false;
      issue.lastError = null;
      issue.promptRequests = {};
      issue.lastPromptRequestEventId = null;
      issue.lastPromptError = null;
    } else if (event.event_type === "validate_issue_started") {
      issue.started = true;
    } else if (event.event_type === "validate_issue_prompt_requested") {
      const parsed = parseUltrafeedEventData(
        event.event_type,
        event.data,
      ) as UltrafeedEventData<"validate_issue_prompt_requested"> | null;
      if (!parsed) {
        return;
      }

      issue.promptRequests[event.id] = {
        requestEventId: event.id,
        issueKey: parsed.issue_key,
        prompt: parsed.prompt,
        projectKey: parsed.project_key,
        projectName: parsed.project_name,
        projectId: parsed.project_id ?? "",
        sessionId: parsed.session_id,
        worktreeName: parsed.worktree_name,
        worktreeBranch: parsed.worktree_branch,
        worktreeDirectory: parsed.worktree_directory,
      };
      issue.lastPromptError = null;
    } else if (event.event_type === "validate_issue_prompt_completed") {
      const parsed = parseUltrafeedEventData(
        event.event_type,
        event.data,
      ) as UltrafeedEventData<"validate_issue_prompt_completed"> | null;
      if (!parsed) {
        return;
      }

      delete issue.promptRequests[parsed.request_event_id];
      issue.lastPromptRequestEventId = parsed.request_event_id;
      issue.lastPromptError = null;
    } else if (event.event_type === "validate_issue_prompt_failed") {
      const parsed = parseUltrafeedEventData(
        event.event_type,
        event.data,
      ) as UltrafeedEventData<"validate_issue_prompt_failed"> | null;
      if (!parsed) {
        return;
      }

      delete issue.promptRequests[parsed.request_event_id];
      issue.lastPromptRequestEventId = parsed.request_event_id;
      issue.lastPromptError = parsed.error;
    } else if (event.event_type === "issue_validated") {
      issue.completed = true;
      issue.lastError = null;
    } else if (event.event_type === "issue_validation_failed") {
      issue.completed = false;
      const parsed = parseUltrafeedEventData(
        event.event_type,
        event.data,
      ) as UltrafeedEventData<"issue_validation_failed"> | null;
      const error = parsed?.error;
      issue.lastError = typeof error === "string" ? error : null;
    }

    state.cursor = { id: event.id, created_at: event.created_at };
  }),
);

$validationRuntimeStore.on(validationDispatchQueued, (state, action) =>
  produce(state, (state) => {
    state.dispatchedValidationRequestIds[action.requestEventId] = true;
    delete state.validationDispatchErrors[action.requestEventId];
  }),
);

$validationRuntimeStore.on(promptDispatchQueued, (state, action) =>
  produce(state, (state) => {
    state.dispatchedPromptRequestIds[action.promptRequest.requestEventId] =
      true;
    delete state.promptDispatchErrors[action.promptRequest.requestEventId];
  }),
);

$validationRuntimeStore.on(validationDispatchFailed, (state, action) =>
  produce(state, (state) => {
    state.validationDispatchErrors[action.requestEventId] = formatError(
      action.error,
    );
  }),
);

$validationRuntimeStore.on(promptDispatchFailed, (state, action) =>
  produce(state, (state) => {
    state.promptDispatchErrors[action.requestEventId] = formatError(
      action.error,
    );
  }),
);

const effectRunIssueValidation = createEffect(
  async ({ ctx, issueKey }: ValidationDispatchRequest) => {
    try {
      ctx.log.debug(
        `${storeLabel} ${sideEffectLabel} dispatching validation for ${chalk.green(issueKey)}`,
      );
      await ctx.pi.runIssueValidation({
        jiraKey: issueKey,
        writer: ctx.writer,
      });
      ctx.log.debug(
        `${storeLabel} ${successLabel} dispatched validation for ${chalk.green(issueKey)}`,
      );
    } catch (error) {
      ctx.log.error(
        `${storeLabel} ${failureLabel} validation for ${chalk.green(issueKey)}: ${chalk.red(formatError(error))}`,
      );
      throw error;
    }
  },
);

const effectQueueValidationDispatches = createEffect(
  async ({
    requests,
    scope,
  }: DispatchRequestBatch<ValidationDispatchRequest>) => {
    const queueDispatch = scope
      ? scopeBind(validationDispatchQueued, { scope })
      : validationDispatchQueued;

    for (const request of requests) {
      queueDispatch(request);
    }
  },
);

const effectQueuePromptDispatches = createEffect(
  async ({ requests, scope }: DispatchRequestBatch<PromptDispatchRequest>) => {
    const queueDispatch = scope
      ? scopeBind(promptDispatchQueued, { scope })
      : promptDispatchQueued;

    for (const request of requests) {
      queueDispatch(request);
    }
  },
);

sample({
  clock: reconcileRequested,
  source: {
    validation: $validationStore,
    runtime: $validationRuntimeStore,
  },
  fn: (state, { ctx, scope }) => ({
    requests: findValidationDispatchRequests(
      state.validation,
      state.runtime,
      ctx,
    ),
    scope,
  }),
  target: effectQueueValidationDispatches,
});

sample({
  clock: reconcileRequested,
  source: {
    validation: $validationStore,
    runtime: $validationRuntimeStore,
  },
  fn: (state, { ctx, scope }) => ({
    requests: findPromptDispatchRequests(state.validation, state.runtime, ctx),
    scope,
  }),
  target: effectQueuePromptDispatches,
});

sample({
  clock: validationDispatchQueued,
  target: effectRunIssueValidation,
});

sample({
  clock: effectRunIssueValidation.fail,
  fn: ({ params, error }) => ({
    issueKey: params.issueKey,
    requestEventId: params.requestEventId,
    error,
  }),
  target: validationDispatchFailed,
});

function findValidationDispatchRequests(
  validation: ValidationStoreState,
  runtime: ValidationRuntimeStoreState,
  ctx: WorkerContext,
): ValidationDispatchRequest[] {
  const requests: ValidationDispatchRequest[] = [];

  for (const [issueKey, issue] of Object.entries(validation.issues)) {
    if (!issue.requestEventId || issue.started || issue.completed) {
      continue;
    }

    if (runtime.dispatchedValidationRequestIds[issue.requestEventId]) {
      continue;
    }

    requests.push({
      ctx,
      issueKey,
      requestEventId: issue.requestEventId,
    });
  }

  return requests;
}

function findPromptDispatchRequests(
  validation: ValidationStoreState,
  runtime: ValidationRuntimeStoreState,
  ctx: WorkerContext,
): PromptDispatchRequest[] {
  const requests: PromptDispatchRequest[] = [];

  for (const [issueKey, issue] of Object.entries(validation.issues)) {
    for (const promptRequest of Object.values(issue.promptRequests)) {
      if (runtime.dispatchedPromptRequestIds[promptRequest.requestEventId]) {
        continue;
      }

      requests.push({ ctx, issueKey, promptRequest });
    }
  }

  return requests;
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
  issue.lastError ??= null;
  issue.promptRequests ??= {};
  issue.lastPromptRequestEventId ??= null;
  issue.lastPromptError ??= null;

  return issue as IssueState;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
