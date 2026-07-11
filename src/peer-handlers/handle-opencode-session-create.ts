import {
  createDefaultOpencodeClient,
  OpencodeGateway,
  unwrapOpencodeData,
} from "src/opencode/opencode";
import type {
  OpencodeAgent,
  PeerMessage,
} from "src/peer-protocol/peer-protocol";
import { runBlock } from "src/worker/run-block";

export type OpencodeSessionMetadataStore = {
  setIssueKey: (sessionId: string, issueKey: string) => void;
  setAgent: (sessionId: string, agent: OpencodeAgent) => void;
};

export async function handleOpencodeSessionCreate(
  msg: PeerMessage,
  sendResponse: (msg: PeerMessage) => void,
  metadata?: OpencodeSessionMetadataStore,
): Promise<void> {
  if (msg.type !== "opencode.session.create") {
    return;
  }

  try {
    runBlock(async () => {
      const gateway = OpencodeGateway.createDefault();
      const sandbox = await gateway.sandbox({
        projectId: msg.projectId,
        sandboxName: msg.sandboxName,
      });
      const sessionTitle = msg.issueKey
        ? `${msg.issueKey} - Workbench`
        : "Workbench";

      const session = await sandbox.createSession({
        title: sessionTitle,
      });

      await session.agent().text("");
    });

    const client = createDefaultOpencodeClient();
    const projects = await client.project.list().then(unwrapOpencodeData);
    const project = projects.find(
      (candidate) => candidate.id === msg.projectId,
    );

    if (!project) {
      throw new Error(`opencode-project-not-found:${msg.projectId}`);
    }

    if (project.worktree !== msg.worktree) {
      throw new Error(`opencode-worktree-not-found:${msg.worktree}`);
    }

    const sandbox = project.sandboxes.find(
      (candidate) =>
        candidate === msg.sandboxName ||
        getSandboxName(project.id, candidate) === msg.sandboxName,
    );

    if (!sandbox) {
      throw new Error(`opencode-sandbox-not-found:${msg.sandboxName}`);
    }

    const session = await client.session
      .create({
        directory: sandbox,
        title: msg.issueKey ? `${msg.issueKey} - Workbench` : "Workbench",
        agent: msg.agent,
      })
      .then(unwrapOpencodeData);

    await client.session
      .prompt({
        sessionID: session.id,
        agent: msg.agent,
        parts: [{ type: "text", text: msg.prompt }],
      })
      .then(unwrapOpencodeData);

    metadata?.setAgent(session.id, msg.agent);
    if (msg.issueKey) {
      metadata?.setIssueKey(session.id, msg.issueKey);
    }

    sendResponse({
      id: msg.id,
      type: "opencode.session.create_response",
      accepted: true,
      sessionId: session.id,
    });
  } catch (error) {
    sendResponse({
      id: msg.id,
      type: "opencode.session.create_response",
      accepted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getSandboxName(
  projectId: string,
  sandbox: string,
): string | undefined {
  return sandbox.split(projectId)[1]?.replace(/^\//, "");
}
