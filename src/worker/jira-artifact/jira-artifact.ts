import { createEffect, createEvent, createStore, sample } from "effector";
import { produce } from "immer";
import { getJiraInboxIssues } from "src/jira";
import { feedEventReceived } from "src/worker/event-processor";
import { ultrafeedEventSchemas } from "src/worker/events";
import createDebug from "debug";
import type { ExecutionContext } from "src/worker/context";

const log = createDebug("app:jira-artifact");

export interface ReconcileRequestedEventData {
  ctx: ExecutionContext;
}

export const reconcileRequested = createEvent<ReconcileRequestedEventData>();

export const hydrateEvent = createEvent<JiraArtifactStoreState>();

export const $jiraArtifactRequests = createStore<JiraArtifactStoreState>({
  isRefetchRequested: false,
});

const inboxRefetchRequested = feedEventReceived.filterMap((item) => {
  if (item.event_type !== "artifact_refresh_requested") {
    return undefined;
  }
  return ultrafeedEventSchemas.artifact_refresh_requested.parse(item.data);
});

const artifactInserted = feedEventReceived.filterMap((item) => {
  if (item.event_type !== "inserted_artifact") {
    return undefined;
  }

  return ultrafeedEventSchemas.inserted_artifact.parse(item.data);
});

$jiraArtifactRequests.watch((state) => {
  log("state", state);
});

$jiraArtifactRequests
  .on(inboxRefetchRequested, (state) =>
    produce(state, (state) => {
      log("inbox refetch requested true");
      state.isRefetchRequested = true;
    }),
  )
  .on(artifactInserted, (state) =>
    produce(state, (state) => {
      log("inbox refetch requested false");
      state.isRefetchRequested = false;
    }),
  )
  .on(hydrateEvent, (state) => state);

export const effectFetchArtifact = createEffect(
  async (opts: ReconcileRequestedEventData) => {
    const { ctx } = opts;
    const jiraConfig = ctx.jira;

    log("effect fetch artifact");

    if (jiraConfig == null) {
      throw new Error("jira-config-not-defined");
    }

    const filterId = jiraConfig.filters?.inbox?.filter_id;
    if (filterId == null) {
      throw new Error("filter-not-defined");
    }

    const userId = await ctx.supabase.getUserId();
    const issues = await getJiraInboxIssues(jiraConfig, ctx.runtime.fetch);

    const id = crypto.randomUUID();
    await ctx.supabase.client.from("jira_artifacts").insert([
      {
        id,
        user_id: userId,
        content: issues,
      },
    ]);

    await ctx.supabase.client.from(ctx.config.table).insert([
      {
        event_type: "inserted_artifact",
        data: {
          artifactType: "jira_inbox",
          artifactId: id,
        },
      },
    ]);

    ctx.log.debug(`published Jira inbox snapshot`);
  },
);

// start fetch effect unless it's already running
sample({
  clock: reconcileRequested,
  filter: (it) => !it.pending && it.requests.isRefetchRequested,
  source: {
    pending: effectFetchArtifact.pending,
    requests: $jiraArtifactRequests,
  },
  fn: (_, payload) => payload,
  target: effectFetchArtifact,
});

export interface JiraArtifactStoreState {
  isRefetchRequested: boolean;
}

export function getJiraInboxArtifactStoreName() {
  return "jira-artifact-store";
}
