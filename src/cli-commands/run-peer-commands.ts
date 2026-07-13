import chalk from "chalk";
import type { PromptSessionMode } from "src/peer-protocol/peer-protocol";
import {
  createPeerResolverTarget,
  type PeerResolverTarget,
} from "src/peer-protocol/peer-resolver";
import { loadWorkerConfig } from "src/worker/config";
import { createWorkerContext } from "src/worker/context";

async function loadPeerTarget(): Promise<PeerResolverTarget> {
  const config = await loadWorkerConfig();
  return createPeerResolverTarget(createWorkerContext(config, []));
}

export async function runPeerGetConfig(): Promise<void> {
  const result = await (await loadPeerTarget()).getConfig();
  console.log(chalk.green("Projects:"));
  for (const project of result.projects) {
    console.log(`  ${project.name}${project.key ? ` (${project.key})` : ""}`);
    console.log(`    Root: ${project.root}`);
  }
}

export async function runPeerListWorktrees(project: string): Promise<void> {
  const result = await (await loadPeerTarget()).listWorktrees({ project });
  console.log(chalk.green(`Worktrees for ${result.project}:`));
  for (const worktree of result.worktrees) {
    console.log(`  ${chalk.blue(worktree.name ?? "worktree")}`);
    console.log(`    Path = ${worktree.path}`);
    console.log(`    Branch = ${worktree.branch || "(detached)"}`);
  }
}

export async function runPeerListSessions(
  project: string,
  worktreePath: string,
): Promise<void> {
  const result = await (await loadPeerTarget()).listSessions({
    project,
    worktreePath,
  });
  console.log(chalk.green(`Sessions for ${result.worktreePath}:`));
  for (const session of result.sessions) {
    console.log(`  ${session.name ?? session.id}`);
    console.log(`    Path: ${session.path}`);
    console.log(`    Modified: ${session.modifiedAt}`);
    console.log(`    Messages: ${session.messageCount}`);
  }
}

export async function runPeerListRecentProjectSessions(
  project: string,
): Promise<void> {
  const result = await (await loadPeerTarget()).listRecentProjectSessions({
    project,
  });
  console.log(chalk.green(`Recent sessions for ${result.project}:`));
  for (const session of result.sessions) {
    console.log(`  ${session.name ?? session.id}`);
    console.log(`    Path: ${session.path}`);
    console.log(`    Worktree: ${session.cwd}`);
    console.log(`    Modified: ${session.modifiedAt}`);
    console.log(`    Messages: ${session.messageCount}`);
  }
}

export async function runPeerCreateWorktree(
  project: string,
  name: string,
): Promise<void> {
  const result = await (await loadPeerTarget()).createWorktree({
    project,
    name,
  });
  console.log(chalk.green(`Created worktree: ${result.path}`));
}

export async function runPeerCreateSession(
  worktreePath: string,
  options: { name?: string } = {},
): Promise<void> {
  const result = await (await loadPeerTarget()).createSession({
    worktreePath,
    name: options.name,
  });
  console.log(chalk.green(`Created session: ${result.path}`));
}

export async function runPeerArchiveSession(
  sessionPath: string,
): Promise<void> {
  await (await loadPeerTarget()).archiveSession({ sessionPath });
  console.log(chalk.green(`Archived session: ${sessionPath}`));
}

export async function runPeerPromptSession(
  sessionPath: string,
  prompt: string,
  options: { mode?: PromptSessionMode } = {},
): Promise<void> {
  await (await loadPeerTarget()).promptSession({
    sessionPath,
    prompt,
    mode: options.mode,
  });
  console.log(chalk.green(`Prompt completed: ${sessionPath}`));
}

export async function runPeerSubscribeSession(
  sessionPath: string,
): Promise<void> {
  const target = await loadPeerTarget();
  await target.subscribeSession({ sessionPath }, (event) => {
    console.log(JSON.stringify(event));
  });
  await new Promise<void>((resolve) => {
    const stop = () => {
      void target.unsubscribeSession({ sessionPath }).finally(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

export async function runPeerGetSession(sessionPath: string): Promise<void> {
  const result = await (await loadPeerTarget()).getSession({ sessionPath });
  console.log(chalk.green(`Session: ${result.id ?? sessionPath}`));
  console.log(`Path: ${result.path}`);
  console.log(`Messages: ${result.messages.length}`);
  for (const [index, message] of result.messages.entries()) {
    console.log(`\n${index + 1}. ${message.type} (${message.timestamp})`);
    if ("message" in message) {
      console.log(formatValue(message.message));
    } else {
      console.log(formatValue(message));
    }
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
