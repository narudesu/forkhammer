import {
  createEvent,
  type EventCallable,
  type Scope,
  scopeBind,
  type StoreWritable,
} from "effector";
import fs from "node:fs/promises";
import path from "node:path";
import { type EventCursor, getEarliestCursor } from "src/worker/stores/types";

interface EffectorStoreSnapshotFile {
  version: 1;
  snapshot: unknown;
}

interface HydratedStoreState {
  cursor?: EventCursor | null;
}

export class EffectorSnapshotRepository {
  private constructor(private readonly directory: string) {}

  static create(opts: { directory: string }) {
    return new EffectorSnapshotRepository(opts.directory);
  }

  async hydrateStores(scope: Scope, stores: HydratableStore<any>[]) {
    const cursors: (EventCursor | null)[] = [];

    for (const store of stores) {
      const snapshot = await this.readStoreSnapshot(store);

      if (snapshot) {
        scopeBind(store.hydrationRequested, { scope })(snapshot);
        cursors.push(snapshot.cursor ?? null);
      }
    }

    return { earliestCursor: getEarliestCursor(cursors) };
  }

  async persistStore(scope: Scope, store: HydratableStore<any>) {
    const state = store.getState(scope);

    if (state === undefined) {
      return;
    }

    await fs.mkdir(this.directory, { recursive: true });

    const filePath = this.snapshotPath(store);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    await fs.writeFile(
      tmpPath,
      `${JSON.stringify({ version: 1, snapshot: state }, null, 2)}\n`,
      "utf-8",
    );

    await fs.rename(tmpPath, filePath);
  }

  private async readStoreSnapshot(
    store: HydratableStore<any>,
  ): Promise<HydratedStoreState | null> {
    try {
      const raw = await fs.readFile(this.snapshotPath(store), "utf-8");
      return parseSnapshot(raw);
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }

  private snapshotPath(store: HydratableStore<any>) {
    return path.resolve(this.directory, `${store.getName()}.json`);
  }
}

function parseSnapshot(raw: string): HydratedStoreState {
  const parsed = JSON.parse(raw) as EffectorStoreSnapshotFile;

  if (
    parsed.version !== 1 ||
    typeof parsed.snapshot !== "object" ||
    parsed.snapshot === null
  ) {
    throw new Error("invalid-effector-snapshot");
  }

  return parsed.snapshot as HydratedStoreState;
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export interface StoreCursor {
  id: string;
  createdAt: string;
}

export abstract class HydratableStore<T> {
  abstract hydrationRequested: EventCallable<T>;
  abstract getState: (scope: Scope) => T;
  abstract getName: () => string;

  static fromEffectorStore = hydratableStoreFromEffectorStore;
}

function hydratableStoreFromEffectorStore<T>(
  $store: StoreWritable<T>,
): HydratableStore<T> {
  const sid = $store.sid;
  if (!sid) {
    throw new Error("sid-required");
  }

  const hydrationRequested = createEvent<T>();

  $store.on(hydrationRequested, (_, action) => action);

  return {
    hydrationRequested,
    getName: () => sid,
    getState: (scope) => scope.getState($store),
  };
}
