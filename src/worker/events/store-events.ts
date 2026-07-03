import { createEvent } from "effector";
import type { ExecutionContext } from "src/worker/context";

export interface ReconcileRequestedEventData {
  ctx: ExecutionContext;
}

export const reconcileRequested = createEvent<ReconcileRequestedEventData>();
