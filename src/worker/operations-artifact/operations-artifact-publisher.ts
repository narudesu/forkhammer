import { type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ArtifactType } from "./operations-artifact-protocol";
import type { WorkerContext } from "../context/types";

export async function publishArtifact(
  ctx: WorkerContext,
  opts: {
    type: ArtifactType;
    content: unknown;
    schema: TSchema;
  },
): Promise<string> {
  if (!Value.Check(opts.schema, opts.content)) {
    throw new Error(`artifact-schema-invalid:${opts.type}`);
  }

  const userId = ctx.auth.activeTokenOrFail().getUserId();
  const id = crypto.randomUUID();
  const { error: artifactError } = await ctx.supabase
    .from("user_artifacts")
    .upsert([{ id, user_id: userId, type: opts.type, content: opts.content }], {
      onConflict: "user_id,type",
    });

  if (artifactError) {
    throw new Error(
      `artifact-insert-failed:${opts.type}:${artifactError.message}`,
    );
  }

  const { error: eventError } = await ctx.supabase
    .from(ctx.workerConfig.supabase.table)
    .insert([
      {
        event_type: "inserted_artifact",
        data: { artifactType: opts.type, artifactId: id },
      },
    ]);

  if (eventError) {
    throw new Error(`artifact-event-failed:${opts.type}:${eventError.message}`);
  }

  ctx.log.debug(`published ${opts.type} artifact`);
  return id;
}
