import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import path from "node:path";
import type { SubmitImplementationPlanTool } from "src/pi/tools/submit-implementation-plan-tool";
import { runBlock } from "src/worker/run-block";

export abstract class PiSessionGateway {
  abstract session: AgentSession;

  static async create(opts: {
    directory: string;
    planTool?: SubmitImplementationPlanTool;
  }): Promise<PiSessionGateway> {
    const cwd = opts.directory;

    const agentDir = runBlock(() => {
      console.log("agent dir");
      const envDir = process.env.FORKHAMMER_STATE_DIR;
      console.log("agent dir", envDir);
      if (envDir) {
        return path.resolve(envDir, "pi-agent");
      }
      return getAgentDir();
    });

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [(pi) => opts.planTool?.register(pi)],
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      thinkingLevel: "off",
      tools: ["read", "grep", "find", "ls", opts?.planTool?.toolName].filter(
        (item) => item != null,
      ),
      agentDir,
      cwd,
      resourceLoader,
      model: getBuiltinModel("openai-codex", "gpt-5.6-luna"),
    });

    return {
      session,
    };
  }
}
