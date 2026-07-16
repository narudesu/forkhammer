import { createEffect } from "effector";
import { JiraArtifactSchema } from "../operations-artifact/operations-artifact-protocol";
import { publishArtifact } from "../operations-artifact/operations-artifact-publisher";
import type { WorkerContext } from "../context/types";

export const effectFetchArtifact = createEffect(
  async (opts: { ctx: WorkerContext }) => {
    const { ctx } = opts;

    ctx.log.debug("effect fetch Jira artifact");
    const issues = await ctx.jira.getJiraInboxIssues();
    await publishArtifact(ctx, {
      type: "jira",
      content: issues,
      schema: JiraArtifactSchema,
    });
  },
);
