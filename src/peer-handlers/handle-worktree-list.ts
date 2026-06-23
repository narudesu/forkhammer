import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { unwrapOpencodeData } from "src/opencode";
import type { PeerMessage, WorktreeInfo } from "src/peer-protocol";

export async function handleWorktreeList(
  msg: PeerMessage,
  sendResponse: (msg: PeerMessage) => void,
): Promise<void> {
  if (msg.type !== "worktree.list") {
    return;
  }
  try {
    const worktrees = await listWorktrees();
    sendResponse({
      id: msg.id,
      type: "worktree.list_response",
      worktrees,
    });
  } catch (error) {
    sendResponse({
      id: msg.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listWorktrees(): Promise<WorktreeInfo[]> {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:8000",
  });
  const worktrees = await client.worktree.list().then(unwrapOpencodeData);
  return worktrees.map((wt) => {
    if (typeof wt === "string") {
      return { path: wt, branch: wt };
    }
    const record = wt as Record<string, unknown>;
    return {
      path: (record.directory as string) ?? (wt as string),
      branch: (record.branch as string) ?? (wt as string),
      name: record.name as string | undefined,
    };
  });
}
