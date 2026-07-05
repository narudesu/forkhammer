import type {
  Message,
  Part,
  Project,
  Session,
  SessionStatus,
} from "@opencode-ai/sdk/v2";
import {
  createDefaultOpencodeClient,
  unwrapOpencodeData,
} from "src/opencode/opencode";
import type {
  OpencodeAgent,
  OpencodeProjectStatus,
  OpencodeSessionMessageStatus,
  OpencodeSessionStatus,
  PeerMessage,
} from "src/peer-protocol/peer-protocol";

export async function handleOpencodeStatus(
  msg: PeerMessage,
  sendResponse: (msg: PeerMessage) => void,
  metadata?: OpencodeSessionStatusMetadata,
): Promise<void> {
  if (msg.type !== "opencode.status") {
    return;
  }

  try {
    const status = await getOpencodeStatus(metadata);
    sendResponse({
      id: msg.id,
      type: "opencode.status_response",
      status,
    });
  } catch (error) {
    sendResponse({
      id: msg.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getOpencodeStatus(
  metadata?: OpencodeSessionStatusMetadata,
): Promise<{
  projects: OpencodeProjectStatus[];
}> {
  const client = createDefaultOpencodeClient();
  const [projects, sessionStatuses] = await Promise.all([
    client.project.list().then(unwrapOpencodeData),
    client.session.status().then(unwrapOpencodeData),
  ]);

  return {
    projects: await Promise.all(
      projects.map((project) =>
        mapProject(client, project, sessionStatuses, metadata),
      ),
    ),
  };
}

async function mapProject(
  client: ReturnType<typeof createDefaultOpencodeClient>,
  project: Project,
  sessionStatuses: Record<string, SessionStatus>,
  metadata?: OpencodeSessionStatusMetadata,
): Promise<OpencodeProjectStatus> {
  return {
    id: project.id,
    worktree: project.worktree,
    name: project.name,
    sandboxes: await Promise.all(
      project.sandboxes.map(async (sandbox) => ({
        directory: sandbox,
        name: getSandboxName(project.id, sandbox),
        sessions: await listSandboxSessions(
          client,
          sandbox,
          sessionStatuses,
          metadata,
        ),
      })),
    ),
  };
}

async function listSandboxSessions(
  client: ReturnType<typeof createDefaultOpencodeClient>,
  sandbox: string,
  sessionStatuses: Record<string, SessionStatus>,
  metadata?: OpencodeSessionStatusMetadata,
): Promise<OpencodeSessionStatus[]> {
  const sessions = await client.session
    .list({ directory: sandbox })
    .then(unwrapOpencodeData);

  return Promise.all(
    sessions.map(async (session) => {
      const sessionStatus = sessionStatuses[session.id];

      return {
        id: session.id,
        slug: session.slug,
        title: session.title,
        directory: session.directory,
        processing: isSessionProcessing(sessionStatus),
        processingStatus: sessionStatus?.type ?? null,
        issueKey: metadata?.issueKeys[session.id] ?? null,
        agent: metadata?.agents[session.id] ?? null,
        model: session.model,
        tokens: session.tokens,
        summary: session.summary
          ? {
              additions: session.summary.additions,
              deletions: session.summary.deletions,
              files: session.summary.files,
            }
          : undefined,
        messages: await listSessionMessages(client, session),
      };
    }),
  );
}

export type OpencodeSessionStatusMetadata = {
  issueKeys: Record<string, string>;
  agents: Record<string, OpencodeAgent>;
};

async function listSessionMessages(
  client: ReturnType<typeof createDefaultOpencodeClient>,
  session: Session,
): Promise<OpencodeSessionMessageStatus[]> {
  const response = await client.session
    .messages({ sessionID: session.id, limit: 100 })
    .then(unwrapOpencodeData);

  return response.flatMap(mapMessage);
}

function mapMessage(message: {
  info: Message;
  parts: Array<Part>;
}): OpencodeSessionMessageStatus[] {
  if (message.info.role === "user") {
    return message.parts.flatMap((part) =>
      part.type === "text" ? [{ role: "user", text: part.text }] : [],
    );
  }
  // message is from assistant

  const stopPart = message.parts.find(
    (part) => part.type === "step-finish" && part.reason === "stop",
  );
  const outputPart = message.parts.find(
    (part): part is Extract<Part, { type: "tool" }> =>
      part.type === "tool" && part.tool === "StructuredOutput",
  );

  if (!stopPart && !outputPart) {
    return [];
  }

  const stepFinishText = stopPart
    ? message.parts
        .map((part) => (part.type === "text" ? part.text : null))
        .filter((x) => !!x)
        .join("\n\n")
    : null;

  return [
    {
      role: "assistant",
      stepFinishText: stepFinishText || undefined,
      structuredOutputInput: outputPart?.state.input,
    },
  ];
}

function getSandboxName(
  projectId: string,
  sandbox: string,
): string | undefined {
  return sandbox.split(projectId)[1]?.replace(/^\//, "");
}

function isSessionProcessing(
  sessionStatus: SessionStatus | undefined,
): boolean {
  return sessionStatus?.type === "busy" || sessionStatus?.type === "retry";
}
