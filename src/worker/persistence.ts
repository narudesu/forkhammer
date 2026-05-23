import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { FeedEvent } from "./types";
import type { EventCursor, StoreSnapshot } from "./stores/types";

const STATE_STORE_DIR = "forkhammer/state-store";

export function getStateStoreDir() {
  const forkhammerStateDir = process.env.FORKHAMMER_STATE_DIR?.trim();
  const base =
    forkhammerStateDir && forkhammerStateDir.length > 0
      ? forkhammerStateDir
      : join(homedir(), ".local", "state", "forkhammer");

  return join(base, "state-store");
}

export function getStoreSnapshotPath(storeName: string) {
  return join(getStateStoreDir(), `${storeName}.json`);
}

export function compareEventCursor(left: EventCursor, right: EventCursor) {
  if (left.created_at === right.created_at) {
    return left.id.localeCompare(right.id);
  }

  return left.created_at.localeCompare(right.created_at);
}

export function isAfterCursor(event: FeedEvent, cursor: EventCursor | null) {
  if (!cursor) {
    return true;
  }

  return (
    compareEventCursor({ created_at: event.created_at, id: event.id }, cursor) >
    0
  );
}

export function getMinimumCursor(cursors: Array<EventCursor | null>) {
  const filtered = cursors.filter((cursor): cursor is EventCursor =>
    Boolean(cursor),
  );
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((minimum, cursor) =>
    compareEventCursor(cursor, minimum) < 0 ? cursor : minimum,
  );
}

export async function readStoreSnapshot<TState>(
  storeName: string,
): Promise<StoreSnapshot<TState> | null> {
  try {
    const raw = await readFile(getStoreSnapshotPath(storeName), "utf8");
    return parseStoreSnapshot<TState>(raw);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeStoreSnapshot<TState>(
  storeName: string,
  snapshot: StoreSnapshot<TState>,
) {
  const snapshotPath = getStoreSnapshotPath(storeName);
  await mkdir(dirname(snapshotPath), { recursive: true });

  const tmpPath = `${snapshotPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(snapshot, null, 2));
  await rename(tmpPath, snapshotPath);
}

export function parseStoreSnapshot<TState>(raw: string) {
  const parsed = JSON.parse(raw) as Partial<StoreSnapshot<TState>>;
  if (parsed.version !== 1) {
    throw new Error("invalid-store-snapshot-version");
  }

  return parsed as StoreSnapshot<TState>;
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
