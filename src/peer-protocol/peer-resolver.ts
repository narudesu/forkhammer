import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { execa } from "execa";
import type {
  GetConfigResult,
  GetSessionResult,
  ListSessionsParams,
  ListSessionsResult,
  ListWorktreesParams,
  ListWorktreesResult,
  PeerResolverTarget,
  Project,
} from "src/peer-protocol/peer-protocol";
import { resolvePiSessionDir } from "src/pi/pi-agent-dir";
import { PiSessionGateway } from "src/pi/pi-session";
import type { WorkerContext } from "src/worker/context/types";

export type { PeerResolverTarget } from "src/peer-protocol/peer-protocol";

export abstract class PeerResolver {
  static register(context: WorkerContext, target: PeerResolverTarget): void {
    context.peerClient.registerTarget(target);
  }
}

export function createPeerResolverTarget(
  context: WorkerContext,
): PeerResolverTarget {
  const subscriptions = new Map<
    string,
    {
      unsubscribe: () => void;
      session: Awaited<ReturnType<typeof PiSessionGateway.create>>["session"];
    }
  >();

  async function unsubscribeSession(sessionPath: string): Promise<boolean> {
    const subscription = subscriptions.get(sessionPath);
    if (!subscription) return false;
    subscription.unsubscribe();
    subscription.session.dispose();
    subscriptions.delete(sessionPath);
    return true;
  }

  function dispose(): void {
    for (const subscription of subscriptions.values()) {
      subscription.unsubscribe();
      subscription.session.dispose();
    }
    subscriptions.clear();
  }

  return {
    dispose,
    async getConfig(): Promise<GetConfigResult> {
      const projects: Project[] = Object.entries(
        context.workerConfig.project,
      ).map(([name, config]) => ({ name, key: config.key, root: config.root }));
      return { projects };
    },

    async listWorktrees(
      params: ListWorktreesParams,
    ): Promise<ListWorktreesResult> {
      const project = getProject(context, params.project);
      const result = await execa("git", [
        "-C",
        project.root,
        "worktree",
        "list",
        "--porcelain",
      ]);
      return {
        project: params.project,
        worktrees: parseWorktrees(result.stdout),
      };
    },

    async listSessions(
      params: ListSessionsParams,
    ): Promise<ListSessionsResult> {
      getProject(context, params.project);

      const sessions = await SessionManager.list(
        params.worktreePath,
        resolvePiSessionDir(params.worktreePath),
      );

      return {
        project: params.project,
        worktreePath: params.worktreePath,
        sessions: sessions.map((session) => ({
          path: session.path,
          id: session.id,
          cwd: session.cwd,
          createdAt: session.created.toISOString(),
          modifiedAt: session.modified.toISOString(),
          name: session.name,
          messageCount: session.messageCount,
          firstMessage: session.firstMessage || undefined,
        })),
      };
    },

    async getSession(params): Promise<GetSessionResult> {
      const manager = SessionManager.open(params.sessionPath);
      const header = manager.getHeader();
      return {
        path: params.sessionPath,
        id: header?.id,
        messages: manager.getEntries() as GetSessionResult["messages"],
      };
    },

    async createWorktree(params) {
      const project = getProject(context, params.project);
      const gitRoot = (
        await execa("git", ["-C", project.root, "rev-parse", "--show-toplevel"])
      ).stdout.trim();
      const worktreePath = path.resolve(
        process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local/share"),
        "trees",
        params.project,
        params.name,
      );
      const existing = await execa("git", [
        "-C",
        gitRoot,
        "worktree",
        "list",
        "--porcelain",
      ]);
      if (existing.stdout.includes(`worktree ${worktreePath}\n`)) {
        throw new Error(`worktree-exists:${worktreePath}`);
      }
      const branchExists = await execa(
        "git",
        [
          "-C",
          gitRoot,
          "show-ref",
          "--verify",
          "--quiet",
          `refs/heads/${params.name}`,
        ],
        { reject: false },
      );
      if (branchExists.exitCode === 0) {
        throw new Error(`worktree-branch-exists:${params.name}`);
      }
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      await execa("git", [
        "-C",
        gitRoot,
        "worktree",
        "add",
        "-b",
        params.name,
        worktreePath,
      ]);
      return {
        project: params.project,
        name: params.name,
        path: worktreePath,
        branch: params.name,
      };
    },

    async createSession(params) {
      const manager = SessionManager.create(
        params.worktreePath,
        resolvePiSessionDir(params.worktreePath),
      );

      const sessionPath = manager.getSessionFile();

      if (!sessionPath) throw new Error("session-file-not-created");

      const sessionGw = await PiSessionGateway.create({
        directory: manager.getCwd(),
        agentConfig: context.workerConfig.agent,
        sessionManager: manager,
      });

      await sessionGw.init();

      return {
        path: sessionPath,
        id: manager.getSessionId(),
        cwd: params.worktreePath,
      };
    },

    async subscribeSession(params, onEvent) {
      await unsubscribeSession(params.sessionPath);
      const manager = SessionManager.open(params.sessionPath);
      const session = (
        await PiSessionGateway.create({
          directory: manager.getCwd(),
          agentConfig: context.workerConfig.agent,
          sessionManager: manager,
        })
      ).session;
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_end") {
          onEvent?.({
            sessionPath: params.sessionPath,
            event: { message: event.message },
          });
        }
      });
      subscriptions.set(params.sessionPath, { unsubscribe, session });
      return { sessionPath: params.sessionPath, subscribed: true };
    },

    async unsubscribeSession(params) {
      return {
        sessionPath: params.sessionPath,
        unsubscribed: await unsubscribeSession(params.sessionPath),
      };
    },

    async archiveSession(params) {
      await unsubscribeSession(params.sessionPath);
      await fs.rm(params.sessionPath);
      return { sessionPath: params.sessionPath, archived: true };
    },

    async promptSession(params) {
      let subscription = subscriptions.get(params.sessionPath);
      let ownedSession = false;
      if (!subscription) {
        const manager = SessionManager.open(params.sessionPath);
        const session = (
          await PiSessionGateway.create({
            directory: manager.getCwd(),
            agentConfig: context.workerConfig.agent,
            sessionManager: manager,
          })
        ).session;
        subscription = { unsubscribe: () => {}, session };
        ownedSession = true;
      }
      try {
        await subscription.session.prompt(params.prompt);
        return { sessionPath: params.sessionPath };
      } finally {
        if (ownedSession) subscription.session.dispose();
      }
    },
  };
}

function getProject(context: WorkerContext, name: string) {
  const project = context.workerConfig.project[name];
  if (!project) throw new Error(`project-not-found:${name}`);
  return project;
}

function parseWorktrees(output: string) {
  return output.split("\n\n").flatMap((block) => {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (!path) return [];
    return [
      {
        path,
        branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "",
        name: path.split("/").at(-1),
      },
    ];
  });
}
