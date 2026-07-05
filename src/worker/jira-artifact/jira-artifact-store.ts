import { createStore, sample } from "effector";
import { produce } from "immer";
import { reconcileRequested } from "src/worker/events/store-events";
import { effectFetchArtifact } from "src/worker/jira-artifact/effect-fetch-artifact";
import {
  artifactInserted,
  inboxRefetchRequested,
} from "src/worker/jira-artifact/jira-artifact-events";

export interface JiraArtifactStoreState {
  isRefetchRequested: boolean;
}

export const $jiraArtifactRequests = createStore<JiraArtifactStoreState>({
  isRefetchRequested: false,
});

$jiraArtifactRequests
  .on(inboxRefetchRequested, (state) =>
    produce(state, (state) => {
      console.log("refetch requested");
      state.isRefetchRequested = true;
    }),
  )
  .on(artifactInserted, (state) =>
    produce(state, (state) => {
      console.log("artifact inserted");
      state.isRefetchRequested = false;
    }),
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

export function getJiraInboxArtifactStoreName() {
  return "jira-artifact-store";
}
