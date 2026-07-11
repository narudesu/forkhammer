import chalk from "chalk";
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
    if (session.firstMessage)
      console.log(`    First message: ${session.firstMessage}`);
  }
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
