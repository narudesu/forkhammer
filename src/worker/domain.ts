import { REQUEST_EVENT_TYPES, WORKER_EMITTED_EVENT_TYPES } from "./constants";
import { parseUltrafeedEventData } from "./events";
import type { FeedEvent } from "./types";

export function isWorkerEmittedEventType(eventType: string) {
  return WORKER_EMITTED_EVENT_TYPES.has(eventType);
}

export function isSupportedRequestEventType(eventType: string) {
  return REQUEST_EVENT_TYPES.has(eventType);
}

export function getIssueKey(event: FeedEvent) {
  const parsed = parseUltrafeedEventData(event.event_type, event.data);
  const value = parsed && "issue_key" in parsed ? parsed.issue_key : null;

  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseLoginResponse(rawBody: string, responseOk: boolean) {
  let payload: unknown = null;
  try {
    payload = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null;
  } catch {
    // no-op
  }

  const token =
    isPlainObject(payload) && typeof payload.token === "string"
      ? payload.token
      : null;

  const payloadError =
    isPlainObject(payload) && typeof payload.error === "string"
      ? payload.error
      : null;
  const payloadMessage =
    isPlainObject(payload) && typeof payload.message === "string"
      ? payload.message
      : null;

  return {
    responseOk,
    token,
    payloadError,
    payloadMessage,
    rawBody,
  };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
