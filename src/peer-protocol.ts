export interface WorktreeInfo {
  path: string;
  branch: string;
  name?: string;
}

export interface OpencodeStatus {
  projects: OpencodeProjectStatus[];
}

export type OpencodeAgent = "plan" | "build";

export interface OpencodeProjectStatus {
  id: string;
  worktree: string;
  name?: string;
  sandboxes: OpencodeSandboxStatus[];
}

export interface OpencodeSandboxStatus {
  directory: string;
  name?: string;
  sessions: OpencodeSessionStatus[];
}

export interface OpencodeSessionStatus {
  id: string;
  slug: string;
  title: string;
  directory: string;
  processing: boolean;
  processingStatus?: "idle" | "busy" | "retry" | null;
  issueKey?: string | null;
  agent?: OpencodeAgent | null;
  model?: {
    id: string;
    providerID: string;
    variant?: string;
  };
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
  messages: OpencodeSessionMessageStatus[];
}

export type OpencodeSessionMessageStatus =
  | {
      role: "user";
      text: string;
    }
  | {
      role: "assistant";
      stepFinishText?: string;
      structuredOutputInput?: unknown;
    };

export type PeerMessage =
  | { id: string; type: "worktree.list" }
  | { id: string; type: "worktree.list_response"; worktrees: WorktreeInfo[] }
  | { id: string; type: "opencode.status" }
  | { id: string; type: "opencode.status_response"; status: OpencodeStatus }
  | {
      id: string;
      type: "opencode.session.create";
      projectId: string;
      worktree: string;
      sandboxName: string;
      prompt: string;
      agent: OpencodeAgent;
      issueKey?: string;
    }
  | {
      id: string;
      type: "opencode.session.create_response";
      accepted: boolean;
      sessionId?: string;
      error?: string;
    }
  | {
      id: string;
      type: "opencode.session.prompt";
      sessionId: string;
      prompt: string;
      delivery?: "immediate" | "deferred";
      agent?: OpencodeAgent;
    }
  | {
      id: string;
      type: "opencode.session.prompt_response";
      sessionId: string;
      accepted: boolean;
      messageId?: string;
    }
  | { id: string; type: "error"; message: string }
  | { id: string; type: "peer.disconnected" };

export type PeerMessageType = PeerMessage["type"];

export type MessageHandlerRegistry = Partial<
  Record<PeerMessageType, (msg: PeerMessage) => void>
>;
