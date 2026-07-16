import { describe, expect, test } from "bun:test";
import { HealthchecksArtifactSchema } from "./operations-artifact-protocol";
import { publishArtifact } from "./operations-artifact-publisher";
import { createTestContext } from "../test/test-context";

describe("operations artifact publisher", () => {
  test("publishes one current artifact per user and type", async () => {
    const context = createTestContext({
      supabase: {
        rows: {
          user_artifacts: [
            { id: "old", user_id: "user-1", type: "healthcheck" },
            { id: "other-user", user_id: "user-2", type: "healthcheck" },
            { id: "other-type", user_id: "user-1", type: "jira" },
          ],
        },
      },
    });

    const id = await publishArtifact(context.getContext(), {
      type: "healthcheck",
      content: [],
      schema: HealthchecksArtifactSchema,
    });

    expect(id).toBeString();
    expect(
      context
        .testSupabaseClient()
        .getInserts()
        .find((insert) => insert.table === "user_artifacts")?.rows[0],
    ).toMatchObject({
      user_id: "user-1",
      type: "healthcheck",
      content: [],
    });
    expect(
      context
        .testSupabaseClient()
        .getInserts()
        .some((insert) => insert.table === "events"),
    ).toBe(true);
  });
});
