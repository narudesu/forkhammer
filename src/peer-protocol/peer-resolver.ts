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
  return {
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
