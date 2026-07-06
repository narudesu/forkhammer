import { createEffect } from "effector";
import type { WorkerContext } from "src/worker/context/types";

export const effectFetchArtifact = createEffect(
  async (opts: { ctx: WorkerContext }) => {
    const { ctx } = opts;

    ctx.log.debug("effect fetch artifact");
    const userId = ctx.auth.activeTokenOrFail().getUserId();
    const issues = await ctx.jira.getJiraInboxIssues();

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

    const { data: artifactEvents } = await ctx.supabase
      .from(ctx.workerConfig.supabase.table)
      .select("data")
      .eq("event_type", "inserted_artifact")
      .eq("data->>artifactType", "jira_inbox");

    const oldArtifactIds = (artifactEvents ?? [])
      .map((event) => getArtifactId(event.data))
      .filter((artifactId) => artifactId !== null && artifactId !== id);

    if (oldArtifactIds.length > 0) {
      await ctx.supabase
        .from("jira_artifacts")
        .delete()
        .in("id", oldArtifactIds);
    }

    ctx.log.debug(`published Jira inbox snapshot`);
  },
);

function getArtifactId(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "artifactId" in data &&
    typeof data.artifactId === "string"
  ) {
    return data.artifactId;
  }

  return null;
}
