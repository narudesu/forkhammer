import { Command } from "commander";
import { commandNew } from "./commands/new";

async function runCli() {
  const program = new Command()
    .name("forkhammer")
    .description(
      "Validate Jira issues against a codebase and create OpenCode worktrees",
    )
    .version("0.1.0");

  commandNew(program);

  await program.parseAsync();
}

runCli();
