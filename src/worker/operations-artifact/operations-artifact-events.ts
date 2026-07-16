import { createEvent, sample } from "effector";
import type { UltrafeedEvent } from "../feed/feed-events";
import { feedEventReceived } from "../jira-artifact/jira-artifact-events";

export const operationsArtifactEventReceived = createEvent<UltrafeedEvent>();

sample({ clock: feedEventReceived, target: operationsArtifactEventReceived });
