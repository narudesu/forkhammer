import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import {
  type AgentSession,
  createAgentSession,
  type SessionManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { Config } from "src/config/config";
import { resolvePiAgentDir } from "src/pi/pi-agent-dir";
import type { SubmitImplementationPlanTool } from "src/pi/tools/submit-implementation-plan-tool";

export abstract class PiSessionGateway {
  abstract session: AgentSession;
  abstract init(): Promise<void>;

  static async create(opts: {
    directory: string;
    agentConfig?: Config["agent"];
    planTool?: SubmitImplementationPlanTool;
    sessionManager?: SessionManager;
  }): Promise<PiSessionGateway> {
    const cwd = opts.directory;

    const agentDir = resolvePiAgentDir();

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [(pi) => opts.planTool?.register(pi)],
    });

    await resourceLoader.reload();

    const model = getBuiltinModel(
      // @ts-expect-error
      opts.agentConfig?.default_provider_id ?? "openai-codex",
      opts.agentConfig?.default_model_id ?? "gpt-5.6-luna",
    );

    const { session } = await createAgentSession({
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls", opts?.planTool?.toolName].filter(
        (item) => item != null,
      ),
      agentDir,
      cwd,
      resourceLoader,
      sessionManager: opts.sessionManager,
      model,
    });

    return {
      session,
      async init() {
        await session.prompt("Hi.");
      },
    };
  }
}
