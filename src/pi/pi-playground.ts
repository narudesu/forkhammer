import { loadWorkerConfig } from "src/worker/config";
import { createWorkerContext } from "src/worker/context";

export async function runPiPlayground() {
  const workerConfig = await loadWorkerConfig();
  const ctx = createWorkerContext(workerConfig, []);

  await ctx.pi.runIssueValidation({
    jiraKey: "AT-1145",
  });
}
