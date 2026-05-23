import { Command } from "commander";
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

  await program.parseAsync();
}

runCli();
