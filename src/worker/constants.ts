import {
  ultrafeedRequestEventType,
  ultrafeedRequestEventTypes,
  ultrafeedWorkerEmittedEventTypes,
} from "./events";

export const WORKER_EMITTED_EVENT_TYPES = new Set<string>(
  ultrafeedWorkerEmittedEventTypes,
);

export const REQUEST_EVENT_TYPE = ultrafeedRequestEventType;
export const REQUEST_EVENT_TYPES = new Set<string>(ultrafeedRequestEventTypes);
export const RETRY_DELAY_MS = 3000;
export const REALTIME_CHANNEL_NAME = "app:supabase-worker";
