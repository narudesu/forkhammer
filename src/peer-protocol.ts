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
