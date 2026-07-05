import { createEvent } from "effector";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";

export const feedEventReceived = createEvent<UltrafeedEvent>();
