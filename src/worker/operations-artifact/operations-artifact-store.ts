import { createStore, sample } from "effector";
import { produce } from "immer";
import { parseUltrafeedEventData } from "../events";
import { reconcileRequested } from "../events/store-events";
import type { ArtifactType } from "./operations-artifact-protocol";
import { effectRefreshArtifact } from "./effect-refresh-artifact";
import { operationsArtifactEventReceived } from "./operations-artifact-events";
import { HydratableStore } from "../snapshot/effector-snapshots";
import { isAfterCurrentCursor, type EventCursor } from "../stores/types";

export interface OperationsArtifactStoreState {
  pending: Partial<Record<ArtifactType, boolean>>;
  cursor: EventCursor | null;
}

export const $operationsArtifactStore =
  createStore<OperationsArtifactStoreState>(
    { pending: {}, cursor: null },
    { sid: "operations-artifact-requests" },
  );

export const hydratableOperationsArtifactStore =
  HydratableStore.fromEffectorStore($operationsArtifactStore);

$operationsArtifactStore.on(operationsArtifactEventReceived, (state, event) =>
  produce(state, (next) => {
    if (!isAfterCurrentCursor(next.cursor, event)) return;
    next.cursor = { id: event.id, created_at: event.created_at };

    if (event.event_type === "artifact_refresh_requested") {
      const data = parseUltrafeedEventData(event.event_type, event.data);

      if (data && "type" in data && data.type) {
        next.pending[data.type] = true;
      }
      return;
    }
    if (event.event_type === "inserted_artifact") {
      const data = parseUltrafeedEventData(event.event_type, event.data);
      if (data && "artifactType" in data && data.artifactType) {
        delete next.pending[data.artifactType];
      }
    }
  }),
);

sample({
  clock: reconcileRequested,
  source: {
    pending: effectRefreshArtifact.pending,
    requests: $operationsArtifactStore,
  },
  filter: ({ pending, requests }) =>
    !pending && Object.values(requests.pending).some(Boolean),
  fn: ({ requests }, payload) => ({
    ctx: payload.ctx,
    type: (Object.entries(requests.pending).find(([, value]) => value)?.[0] ??
      "jira") as ArtifactType,
  }),
  target: effectRefreshArtifact,
});
