import { Command } from "commander";
import { runJiraInbox } from "./cli-commands/run-jira-inbox";
import {
  runPeerGetConfig,
  runPeerGetSession,
  runPeerListSessions,
  runPeerListWorktrees,
} from "./cli-commands/run-peer-commands";
import {
  runQueueAdd,
  runQueueList,
  runQueueRead,
} from "./cli-commands/run-queue-commands";
import { runWorker } from "./run-worker";

async function runCli() {
  const program = new Command()
    .name("forkhammer")
    .description("Validate Jira issues against a codebase and create worktrees")
    .version("0.1.0");

  program
    .command("start-worker", { hidden: true })
    .description("Start the Forkhammer background worker")
    .action(async () => {
      await runWorker();
    });

  const queue = program
    .command("queue")
    .description("Inspect the Supabase event queue");

  const jira = program.command("jira").description("Inspect Jira data");
  const peer = program
    .command("peer")
    .description("Inspect worker state through the PeerResolver API");

  peer
    .command("get-config")
    .description("Show the public project configuration")
    .action(runPeerGetConfig);

  peer
    .command("list-worktrees <project>")
    .description("List Git worktrees for a project")
    .action(runPeerListWorktrees);

  peer
    .command("list-sessions <project> <worktree-path>")
    .description("List PI sessions for a worktree")
    .action(runPeerListSessions);

  peer
    .command("get-session <session-path>")
    .description("Display messages from a PI session")
    .action(runPeerGetSession);

  jira
    .command("inbox")
    .description("Fetch and print the configured Jira inbox issues")
    .action(async () => {
      await runJiraInbox();
    });

  queue
    .command("add <issue-key>")
    .description("Add a Jira issue to the queue")
    .option("--json", "print machine-readable output")
    .action(async (issueKey: string, options: { json?: boolean }) => {
      await runQueueAdd(issueKey, Boolean(options.json));
    });

  queue
    .command("list")
    .description("List recent queue events")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) => {
      await runQueueList(Boolean(options.json));
    });

  queue
    .command("read <issue-key>")
    .description("Read queue events for an issue key")
    .option("--json", "print machine-readable output")
    .action(async (issueKey: string, options: { json?: boolean }) => {
      await runQueueRead(issueKey, Boolean(options.json));
    });

  await program.parseAsync();
}

runCli();
