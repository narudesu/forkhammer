import { createEffect } from "effector";
import { getJiraInboxIssues } from "src/jira";
import type { ExecutionContext } from "src/worker/context";

export const effectFetchArtifact = createEffect(
  async (opts: { ctx: ExecutionContext }) => {
    const { ctx } = opts;
    const jiraConfig = ctx.jira;

    ctx.log.debug("effect fetch artifact");

    if (jiraConfig == null) {
      throw new Error("jira-config-not-defined");
    }

    const filterId = jiraConfig.filters?.inbox?.filter_id;
    if (filterId == null) {
      throw new Error("filter-not-defined");
    }

    const userId = await ctx.supabase.getUserId();
    const issues = await getJiraInboxIssues(jiraConfig, ctx.runtime.fetch);

    const id = crypto.randomUUID();
    await ctx.supabase.client.from("jira_artifacts").insert([
      {
        id,
        user_id: userId,
        content: issues,
      },
    ]);

    await ctx.supabase.client.from(ctx.config.table).insert([
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
