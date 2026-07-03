import { feedEventReceived } from "src/worker/event-processor";
import { ultrafeedEventSchemas } from "src/worker/events";

export const inboxRefetchRequested = feedEventReceived.filterMap((item) => {
  if (item.event_type !== "artifact_refresh_requested") {
    return undefined;
  }
  return ultrafeedEventSchemas.artifact_refresh_requested.parse(item.data);
});

export const artifactInserted = feedEventReceived.filterMap((item) => {
  if (item.event_type !== "inserted_artifact") {
    return undefined;
  }

  return ultrafeedEventSchemas.inserted_artifact.parse(item.data);
});
