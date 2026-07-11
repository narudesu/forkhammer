# PeerResolver JSON-RPC and CLI

## Context
- `src/peer-protocol/peer-resolver.ts` currently declares four placeholder handlers (`get-config`, `list-worktrees`, `list-sessions`, `get-session`) against the custom `PeerClient` message registry.
- The existing `PeerClient`/`peer-protocol.ts` transport is PeerJS-oriented and does not yet carry JSON-RPC requests/responses.
- Goal: define a `PeerResolverTarget`, register it with a `WorkerContext`, implement the messages using JSON-RPC 2.0, expose a direct CLI path using the same target, and retain a PeerJS registration path.

## Approach
- Define the shared target/API contract in a self-contained `peer-protocol.ts` using TypeBox schemas, exporting JSON schemas plus TypeScript types inferred with `Static<typeof schema>` so the file can be copied into the browser repository with minimal alteration.
- Define the target contract and concrete resolver behavior separately from transport.
- Use the PI package's session-management APIs (especially `SessionManager.list`/`open` where supported) to discover and read sessions; only fall back to filesystem access if the package cannot expose the required messages.
- Adapt the PeerJS client to register/serve JSON-RPC 2.0 messages, with request correlation, errors, and async handlers handled by `json-rpc-2.0`. Expose a request/response API for UI clients as well as server registration.
- Build a local/direct target-backed CLI command that invokes the same methods without creating a WebRTC connection, using human-readable output.
- Update worker peer setup to pass/register the target and keep the shared protocol contract independent of worker implementation details.

### Draft `PeerResolverTarget` contract
These are proposed shapes for review, designed for a web UI's current-state browser:

```ts
interface PeerResolverTarget {
  getConfig(): Promise<{
    projects: Array<{ name: string; key?: string; root: string }>;
  }>;
  listWorktrees(params: { project: string }): Promise<{
    project: string;
    worktrees: Array<{ path: string; branch: string; name?: string }>;
  }>;
  listSessions(params: { project: string; worktreePath: string }): Promise<{
    project: string;
    worktreePath: string;
    sessions: Array<{
      path: string;
      id: string;
      cwd: string;
      createdAt: string;
      modifiedAt: string;
      name?: string;
      messageCount: number;
      firstMessage?: string;
    }>;
  }>;
  getSession(params: { sessionPath: string }): Promise<{
    path: string;
    id?: string;
    messages: Array<{
      id: string;
      parentId: string | null;
      timestamp: string;
      type: string;
      message?: unknown;
      [key: string]: unknown;
    }>;
  }>;
}
```

The JSON-RPC method names would initially be `get-config`, `list-worktrees`, `list-sessions`, and `get-session`, with the corresponding parameter objects/results above. `get-config` returns only UI-safe project metadata and never credentials or other secrets. Session result details will be aligned with the PI package's public types after inspection.

## Files to modify
- `src/peer-protocol/peer-resolver.ts` — target interface, resolver registration, JSON-RPC handlers.
- `src/peer-protocol/peer-client.ts` — JSON-RPC transport and PeerJS registration/request support.
- `src/peer-protocol/peer-protocol.ts` — self-contained, browser-copyable API contract using TypeBox schemas and `Static<typeof schema>` inferred TypeScript types; this file must not depend on worker/server modules.
- `src/worker/peer/peer-store.ts` — construct/pass the target during worker setup.
- `src/run-cli.ts` plus a new peer CLI command module — direct resolver CLI commands and output/error handling.
- `package.json`/`bun.lock` — add `json-rpc-2.0` and TypeBox.

## Reuse
- `createWorkerContext` in `src/worker/context.ts` and `WorkerContext` in `src/worker/context/types.ts`.
- Existing configuration loading in `src/worker/config.ts` and direct CLI context pattern in `src/cli-commands/run-queue-commands.ts`.
- Existing project/worktree and Pi session implementations in `src/pi/pi-worktree.ts`, `src/pi/pi-session.ts`, plus worker event/store data for session metadata.

## Steps
- [x] Review and finalize the draft target method signatures/results, including UI-facing session/message fields. Session listings mirror PI `SessionInfo`; session contents expose PI `SessionEntry` data with JSON-safe message payloads.
- [x] Confirm the PI package APIs for listing/opening sessions and map their metadata/messages into stable resolver results. `SessionManager.list(cwd)` supplies metadata and `SessionManager.open(path).getEntries()` supplies entries without application-level file reads.
- [x] Add `json-rpc-2.0` and replace placeholder/custom peer messages with JSON-RPC request/response handling.
- [x] Implement the `PeerResolverTarget` and register it against a worker context.
- [x] Add the direct CLI commands (`peer get-config`, `peer list-worktrees <project>`, `peer list-sessions <project> <worktree-path>`, and `peer get-session <session-path>`) with human-readable output.
- [x] Wire the PeerJS worker path to register the same target and expose request/response calls.
- [x] Add CLI help text and document the shared contract/copying boundary as appropriate; defer automated tests for now.

## Verification
- Exercise each resolver method through the direct CLI and through a PeerJS/data-connection smoke path, including malformed requests, unknown methods, handler errors, and concurrent request correlation.
- Run type-check and the repository CLI/build verification (`bun run ts` and the applicable CLI build command if present); automated tests are intentionally out of scope for this change.
