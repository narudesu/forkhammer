import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { type JiraClient } from "src/jira/jira";
import { PiJiraPrompt } from "src/pi/pi-jira-prompt";
import { logPiEvent } from "src/pi/pi-logger";
import { SubmitImplementationPlanTool } from "src/pi/tools/submit-implementation-plan-tool";
import type { WorkerConfig } from "src/worker/config";

export abstract class PiGateway {
  abstract runIssueValidation(opts: RunIssueValidationOptions): Promise<void>;

  static create = createPiGateway;
}

interface RunIssueValidationOptions {
  jiraKey: string;
}

export function createPiGateway(
  jira: JiraClient,
  config: WorkerConfig,
): PiGateway {
  return {
    async runIssueValidation(opts) {
      const session = await createPiSession();

      session.subscribe((event) => {
        logPiEvent(event);
      });

      await session.prompt(
        await PiJiraPrompt.fromJiraIssue(jira, { jiraKey: opts.jiraKey }),
      );

      // TODO: create new worktree in /home/naru/code/forkhammer/trees/<project-name>/
      // TODO: switch the new worktree to branch in format f/KEY-123
      // TODO: run session in the new worktree
      // TODO: create new session in the worktree
      // TODO: prompt with the validation
      // TODO: read the validation result
    },
  };
}

async function createPiSession() {
  const readOnlyTools = ["read", "grep", "find", "ls"];
  const model = getBuiltinModel("openai-codex", "gpt-5.6-luna");

  const planTool = SubmitImplementationPlanTool.create({
    onSubmittedPlan: (plan) => {
      console.log("submitted plan", plan);
    },
  });

  const cwd = "/home/naru/code/forkhammer/atomika-web";
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [(pi) => planTool.register(pi)],
  });

  await resourceLoader.reload();

  const { session } = await createAgentSession({
    thinkingLevel: "off",
    tools: [...readOnlyTools, planTool.toolName],
    resourceLoader,
    model,
    cwd,
  });

  return session;
}
