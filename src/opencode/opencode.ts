import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2";
import { OpencodeSandboxGateway } from "src/opencode/sandbox";

type OpencodeResponse<TData> = { data: TData | undefined; error: unknown };

export function unwrapOpencodeData<TData>(response: OpencodeResponse<TData>) {
  if (response.error) {
    throw response.error;
  }
  if (!response.data) {
    throw new Error("data-not-found");
  }
  return response.data;
}

export function createDefaultOpencodeClient() {
  return createOpencodeClient({
    baseUrl: "http://localhost:8000",
  });
}

export abstract class OpencodeGateway {
  abstract client: OpencodeClient;
  abstract sandbox(
    options: CreateSandboxGatewayOptions,
  ): Promise<OpencodeSandboxGateway>;

  static createDefault = createDefaultOpencodeGateway;
}

interface CreateSandboxGatewayOptions {
  projectId: string;
  sandboxName: string;
}

function createDefaultOpencodeGateway(): OpencodeGateway {
  const client = createDefaultOpencodeClient();

  return {
    client,
    async sandbox(opts) {
      const projects = await client.project.list().then(unwrapOpencodeData);
      const project = projects.find((it) => it.id === opts.projectId);

      if (!project) {
        throw new Error("project-not-found");
      }

      const sandboxPath = project.sandboxes.find((candidate) =>
        candidate.endsWith(opts.sandboxName),
      );

      if (!sandboxPath) {
        throw new Error("sandbox-not-found");
      }

      return OpencodeSandboxGateway.ofSandbox({
        project,
        sandboxPath,
        client,
      });
    },
  };
}
