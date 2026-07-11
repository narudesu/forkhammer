import type { OpencodeClient, Project, Session } from "@opencode-ai/sdk/v2";
import { unwrapOpencodeData } from "src/opencode/opencode";
import { OpencodeSessionGateway } from "src/opencode/session";

export abstract class OpencodeSandboxGateway {
  abstract project: Project;
  abstract createSession: (
    opts: CreateSessionOptions,
  ) => Promise<OpencodeSessionGateway>;

  static ofSandbox = createGatewayOfSandbox;
}

interface CreateGatewayOfSandboxOptions {
  client: OpencodeClient;
  project: Project;
  sandboxPath: string;
}

interface CreateSessionOptions {
  title: string;
}

async function createGatewayOfSandbox(
  opts: CreateGatewayOfSandboxOptions,
): Promise<OpencodeSandboxGateway> {
  const { sandboxPath, client, project } = opts;

  return {
    project,
    createSession: async (opts) => {
      const session = await client.session
        .create({
          directory: sandboxPath,
          title: opts.title,
        })
        .then(unwrapOpencodeData);

      return OpencodeSessionGateway.wrap(session);
    },
  };
}
