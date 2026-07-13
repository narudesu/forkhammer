import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { execa } from "execa";
import type {
  GetConfigResult,
  GetSessionResult,
  ListRecentProjectSessionsParams,
  ListRecentProjectSessionsResult,
  ListSessionsParams,
  ListSessionsResult,
  ListWorktreesParams,
  ListWorktreesResult,
  PeerResolverTarget,
  Project,
  PromptSessionMode,
  SessionEvent,
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
  type AgentSession = Awaited<
    ReturnType<typeof PiSessionGateway.create>
  >["session"];
  const sessions = new Map<string, AgentSession>();
  const subscriptions = new Map<
    string,
    {
      unsubscribe: () => void;
      session: AgentSession;
      mode: PromptSessionMode;
      onEvent?: (event: SessionEvent) => void;
      lastActive: boolean;
    }
  >();

  function isSessionActive(sessionPath: string): boolean {
    return sessions.get(sessionPath)?.isStreaming ?? false;
  }

  function emitActiveChange(
    subscription: (typeof subscriptions extends Map<string, infer T> ? T : never),
    sessionPath: string,
  ): void {
    const active = subscription.session.isStreaming;
    if (active === subscription.lastActive) return;
    subscription.lastActive = active;
    subscription.onEvent?.({
      sessionPath,
      event: { type: "active_changed", active },
    });
  }

  async function unsubscribeSession(sessionPath: string): Promise<boolean> {
    const subscription = subscriptions.get(sessionPath);
    if (!subscription) return false;
    // Detach event delivery, but let any in-flight prompt continue running.
    subscription.unsubscribe();
    subscriptions.delete(sessionPath);
    return true;
  }

  function dispose(): void {
    for (const subscription of subscriptions.values()) {
      // Disconnecting the peer stops event delivery without cancelling sessions.
      subscription.unsubscribe();
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
          active: isSessionActive(session.path),
        })),
      };
    },

    async listRecentProjectSessions(
      params: ListRecentProjectSessionsParams,
    ): Promise<ListRecentProjectSessionsResult> {
      const project = getProject(context, params.project);
      const result = await execa("git", [
        "-C",
        project.root,
        "worktree",
        "list",
        "--porcelain",
      ]);
      const worktrees = parseWorktrees(result.stdout);
      const sessions = (
        await Promise.all(
          worktrees.map((worktree) =>
            SessionManager.list(
              worktree.path,
              resolvePiSessionDir(worktree.path),
            ),
          ),
        )
      )
        .flat()
        .map((session) => ({
          path: session.path,
          id: session.id,
          cwd: session.cwd,
          createdAt: session.created.toISOString(),
          modifiedAt: session.modified.toISOString(),
          name: session.name,
          messageCount: session.messageCount,
          firstMessage: session.firstMessage || undefined,
          active: isSessionActive(session.path),
        }))
        .sort(
          (left, right) =>
            Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt),
        );

      return { project: params.project, sessions };
    },

    async getSession(params): Promise<GetSessionResult> {
      const manager = SessionManager.open(params.sessionPath);
      const header = manager.getHeader();
      return {
        path: params.sessionPath,
        id: header?.id,
        messages: manager.getEntries() as GetSessionResult["messages"],
        active: isSessionActive(params.sessionPath),
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
      if (params.name) manager.appendSessionInfo(params.name);

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
      const session =
        sessions.get(params.sessionPath) ??
        (
          await PiSessionGateway.create({
            directory: manager.getCwd(),
            agentConfig: context.workerConfig.agent,
            sessionManager: manager,
            mode: "read",
          })
        ).session;
      sessions.set(params.sessionPath, session);
      const subscription = {
        unsubscribe: () => {},
        session,
        mode: "read" as const,
        onEvent,
        lastActive: session.isStreaming,
      };
      subscription.unsubscribe = session.subscribe((event) => {
        if (event.type === "message_end") {
          onEvent?.({
            sessionPath: params.sessionPath,
            event: { message: event.message },
          });
        }
        if (
          event.type === "agent_start" ||
          event.type === "agent_end" ||
          event.type === "agent_settled"
        ) {
          emitActiveChange(subscription, params.sessionPath);
        }
      });
      subscriptions.set(params.sessionPath, subscription);
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
      const mode = params.mode ?? "read";
      let subscription = subscriptions.get(params.sessionPath);
      let ownedSession = false;
      if (!subscription || subscription.mode !== mode) {
        const previous = subscription;
        const manager = SessionManager.open(params.sessionPath);
        const session = (
          await PiSessionGateway.create({
            directory: manager.getCwd(),
            agentConfig: context.workerConfig.agent,
            sessionManager: manager,
            mode,
          })
        ).session;
        sessions.set(params.sessionPath, session);
        if (previous) {
          previous.unsubscribe();
          previous.session.dispose();
          const nextSubscription = {
            unsubscribe: () => {},
            session,
            mode,
            onEvent: previous.onEvent,
            lastActive: session.isStreaming,
          };
          nextSubscription.unsubscribe = session.subscribe((event) => {
            if (event.type === "message_end") {
              previous.onEvent?.({
                sessionPath: params.sessionPath,
                event: { message: event.message },
              });
            }
            if (
              event.type === "agent_start" ||
              event.type === "agent_end" ||
              event.type === "agent_settled"
            ) {
              emitActiveChange(nextSubscription, params.sessionPath);
            }
          });
          subscription = nextSubscription;
          subscriptions.set(params.sessionPath, subscription);
        } else {
          subscription = {
            unsubscribe: () => {},
            session,
            mode,
            lastActive: session.isStreaming,
          };
          ownedSession = true;
        }
      }
      try {
        await subscription.session.prompt(params.prompt);
        return { sessionPath: params.sessionPath };
      } finally {
        if (ownedSession) {
          subscription.session.dispose();
          sessions.delete(params.sessionPath);
        }
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
