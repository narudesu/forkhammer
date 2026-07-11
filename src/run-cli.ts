import { Command } from "commander";
import { runJiraInbox } from "./commands/jira";
import { runQueueAdd, runQueueList, runQueueRead } from "./commands/queue";
import { runWorker } from "./run-worker";
import { runPiPlayground } from "src/pi/pi-playground";

async function runCli() {
  const program = new Command()
    .name("forkhammer")
    .description(
      "Validate Jira issues against a codebase and create OpenCode worktrees",
    )
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

  queue.command("playground").action(async () => {
    await runPiPlayground();
  });

  await program.parseAsync();
}

runCli();
