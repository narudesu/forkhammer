import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import type { WorkerConfig } from "src/worker/config";

export type ResolvedProject = {
  name: string;
  key: string;
  root: string;
};

export type ResolvedWorktree = {
  name: string;
  branch: string;
  directory: string;
};

const PI_WORKTREE_ROOT = path.resolve(
  process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local/share"),
  "trees",
);

export abstract class ProjectConfig {
  abstract resolveByJiraKey(issueKey: string): ForkhammerProject;

  static of(projectConfig: WorkerConfig["project"]): ProjectConfig {
    return {
      resolveByJiraKey(issueKey) {
        const issueProjectKey = issueKey.split("-")[0];

        for (const [name, project] of Object.entries(projectConfig)) {
          const projectKey = project.key;
          const isMatch = projectKey != null && project.key === issueProjectKey;

          if (isMatch && projectKey) {
            return ForkhammerProject.of({
              name,
              root: project.root,
              key: projectKey,
            });
          }
        }

        throw new Error(`project-not-found:issue-key:${issueKey}`);
      },
    };
  }
}

export abstract class ForkhammerProject {
  abstract config: ResolvedProject;
  abstract provisionTicketWorktree(issueKey: string): Promise<ResolvedWorktree>;

  static of(config: ResolvedProject): ForkhammerProject {
    return {
      config,
      async provisionTicketWorktree(issueKey: string) {
        const branch = `f/${issueKey}`;
        const gitRoot = await getGitRoot(config.root);
        if (!gitRoot) {
          throw new Error("git-root-not-found");
        }
        const directory = path.join(PI_WORKTREE_ROOT, config.name, issueKey);
        const worktrees = await execa("git", [
          "-C",
          gitRoot,
          "worktree",
          "list",
          "--porcelain",
        ]);
        const existing = parseWorktrees(worktrees.stdout).find(
          (worktree) =>
            worktree.directory === directory || worktree.branch === branch,
        );
        if (existing) {
          return {
            name: issueKey,
            branch,
            directory: existing.directory,
          };
        }

        await execa("mkdir", ["-p", path.dirname(directory)]);
        const branchExists = await execa(
          "git",
          [
            "-C",
            gitRoot,
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${branch}`,
          ],
          { reject: false },
        );
        await execa("git", [
          "-C",
          gitRoot,
          "worktree",
          "add",
          ...(branchExists.exitCode === 0 ? [] : ["-b"]),
          ...(branchExists.exitCode === 0 ? [] : [branch]),
          directory,
          ...(branchExists.exitCode === 0 ? [branch] : []),
        ]);
        return { name: issueKey, branch, directory };
      },
    };
  }
}

async function getGitRoot(directory: string) {
  const result = await execa(
    "git",
    ["-C", directory, "rev-parse", "--show-toplevel"],
    { reject: false },
  );
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function parseWorktrees(output: string) {
  return output.split("\n\n").flatMap((block) => {
    const directory = block.match(/^worktree (.+)$/m)?.[1];
    const ref = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    return directory ? [{ directory, branch: ref }] : [];
  });
}
