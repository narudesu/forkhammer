export interface WorktreeInfo {
  path: string;
  branch: string;
  name?: string;
}

export type PeerMessage =
  | { id: string; type: "worktree.list" }
  | { id: string; type: "worktree.list_response"; worktrees: WorktreeInfo[] }
  | { id: string; type: "error"; message: string }
  | { id: string; type: "peer.disconnected" };

export type PeerMessageType = PeerMessage["type"];

export type MessageHandlerRegistry = Partial<
  Record<PeerMessageType, (msg: PeerMessage) => void>
>;

export function createMessageHandlerRegistry(
  handlers: MessageHandlerRegistry,
): MessageHandlerRegistry {
  return { ...handlers };
}

export function registerHandler(
  registry: MessageHandlerRegistry,
  type: PeerMessageType,
  handler: (msg: PeerMessage) => void,
): MessageHandlerRegistry {
  return { ...registry, [type]: handler };
}

export function createPeerMessage<T extends PeerMessage["type"]>(
  type: T,
  id: string,
  data: Omit<PeerMessage & { type: T }, "id" | "type"> extends never
    ? { id?: never }
    : Omit<PeerMessage & { type: T }, "id" | "type">,
): PeerMessage {
  return { id, type, ...data } as PeerMessage;
}

export function applyHandlers(
  registry: MessageHandlerRegistry,
  msg: PeerMessage,
): boolean {
  const handler = registry[msg.type];
  if (handler) {
    handler(msg);
    return true;
  }
  return false;
}

export function createPeerMessage<T extends PeerMessage["type"]>(
  type: T,
  id: string,
  data: Omit<PeerMessage & { type: T }, "id" | "type"> extends never
    ? { id?: never }
    : Omit<PeerMessage & { type: T }, "id" | "type">,
): PeerMessage {
  return { id, type, ...data } as PeerMessage;
}
