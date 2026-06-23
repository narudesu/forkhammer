import {
  createDefaultOpencodeClientV2,
  unwrapOpencodeData,
} from "src/opencode";
import type {
  OpencodeProjectStatus,
  OpencodeSessionMessageStatus,
  OpencodeSessionStatus,
  PeerMessage,
} from "src/peer-protocol";
import type {
  Project,
  Session,
  SessionMessage,
  SessionStatus,
} from "@opencode-ai/sdk/v2";

export async function handleOpencodeStatus(
  msg: PeerMessage,
  sendResponse: (msg: PeerMessage) => void,
): Promise<void> {
  if (msg.type !== "opencode.status") {
    return;
  }

  try {
    const status = await getOpencodeStatus();
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

export async function getOpencodeStatus(): Promise<{
  projects: OpencodeProjectStatus[];
}> {
  const client = createDefaultOpencodeClientV2();
  const [projects, sessionStatuses] = await Promise.all([
    client.project.list().then(unwrapOpencodeData),
    client.session.status().then(unwrapOpencodeData),
  ]);

  return {
    projects: await Promise.all(
      projects.map((project) => mapProject(client, project, sessionStatuses)),
    ),
  };
}

async function mapProject(
  client: ReturnType<typeof createDefaultOpencodeClientV2>,
  project: Project,
  sessionStatuses: Record<string, SessionStatus>,
): Promise<OpencodeProjectStatus> {
  return {
    id: project.id,
    worktree: project.worktree,
    name: project.name,
    sandboxes: await Promise.all(
      project.sandboxes.map(async (sandbox) => ({
        directory: sandbox,
        name: getSandboxName(project.id, sandbox),
        sessions: await listSandboxSessions(client, sandbox, sessionStatuses),
      })),
    ),
  };
}

async function listSandboxSessions(
  client: ReturnType<typeof createDefaultOpencodeClientV2>,
  sandbox: string,
  sessionStatuses: Record<string, SessionStatus>,
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
        processingStatus: sessionStatus?.type,
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

async function listSessionMessages(
  client: ReturnType<typeof createDefaultOpencodeClientV2>,
  session: Session,
): Promise<OpencodeSessionMessageStatus[]> {
  const response = await client.v2.session
    .messages({ sessionID: session.id, order: "asc" })
    .then(unwrapOpencodeData);

  return response.items.flatMap(mapMessage);
}

function mapMessage(message: SessionMessage): OpencodeSessionMessageStatus[] {
  if (message.type === "user") {
    const text = message.text.trim();

    return text ? [{ role: "user", text }] : [];
  }

  if (message.type !== "assistant") {
    return [];
  }

  const stepFinishText = message.finish === "stop"
    ? message.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n")
        .trim()
    : "";
  const outputPart = message.content.find(
    (
      item,
    ): item is Extract<(typeof message.content)[number], { type: "tool" }> =>
      item.type === "tool" && item.name === "StructuredOutput",
  );

  if (!stepFinishText && !outputPart) {
    return [];
  }

  return [
    {
      role: "assistant",
      stepFinishText: stepFinishText || undefined,
      structuredOutputInput: outputPart?.state.input,
    },
  ];
}

function getSandboxName(projectId: string, sandbox: string): string | undefined {
  return sandbox.split(projectId)[1]?.replace(/^\//, "");
}

function isSessionProcessing(sessionStatus: SessionStatus | undefined): boolean {
  return sessionStatus?.type === "busy" || sessionStatus?.type === "retry";
}
