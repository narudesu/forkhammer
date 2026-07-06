import { createStore, sample } from "effector";
import { produce } from "immer";
import { reconcileRequested } from "src/worker/events/store-events";
import { effectFetchArtifact } from "src/worker/jira-artifact/effect-fetch-artifact";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import { HydratableStore } from "src/worker/snapshot/effector-snapshots";
import {
  type EventCursor,
  isAfterCurrentCursor,
} from "src/worker/stores/types";

export interface JiraArtifactStoreState {
  isRefetchRequested: boolean;
  cursor: EventCursor | null;
}

export const $jiraArtifactRequests = createStore<JiraArtifactStoreState>(
  {
    isRefetchRequested: false,
    cursor: null,
  },
  { sid: "jira-artifact-requests" },
);

export const hydratableArtifactStore = HydratableStore.fromEffectorStore(
  $jiraArtifactRequests,
);

$jiraArtifactRequests.on(feedEventReceived, (state, action) =>
  produce(state, (state) => {
    if (!isAfterCurrentCursor(state.cursor, action)) {
      return;
    }

    state.cursor = { id: action.id, created_at: action.created_at };
    if (action.event_type === "artifact_refresh_requested") {
      state.isRefetchRequested = true;
      return;
    }
    if (action.event_type === "inserted_artifact") {
      state.isRefetchRequested = false;
      return;
    }
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
