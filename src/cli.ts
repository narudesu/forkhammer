import { Command } from "commander";
import { runQueueAdd, runQueueList, runQueueRead } from "./commands/queue";
import { runWorker } from "./worker";

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
