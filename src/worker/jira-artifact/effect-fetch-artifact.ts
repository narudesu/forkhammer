import { createEffect } from "effector";
import { getJiraInboxIssues } from "src/jira/jira";
import type { WorkerContext } from "src/worker/context/types";

export const effectFetchArtifact = createEffect(
  async (opts: { ctx: WorkerContext }) => {
    const { ctx } = opts;
    const jiraConfig = ctx.workerConfig.jira;

    ctx.log.debug("effect fetch artifact");

    if (jiraConfig == null) {
      throw new Error("jira-config-not-defined");
    }

    const filterId = jiraConfig.filters?.inbox?.filter_id;
    if (filterId == null) {
      throw new Error("filter-not-defined");
    }

    const userId = ctx.auth.activeTokenOrFail().getUserId();
    const issues = await getJiraInboxIssues(jiraConfig);

    const id = crypto.randomUUID();
    await ctx.supabase.from("jira_artifacts").insert([
      {
        id,
        user_id: userId,
        content: issues,
      },
    ]);

    await ctx.supabase.from(ctx.workerConfig.supabase.table).insert([
      {
        event_type: "inserted_artifact",
        data: {
          artifactType: "jira_inbox",
          artifactId: id,
        },
      },
    ]);

    ctx.log.debug(`published Jira inbox snapshot`);
  },
);
