import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import {
  ArtifactTypeSchema,
  BlockersArtifactSchema,
  HealthchecksArtifactSchema,
  TicketReferenceSchema,
} from "./operations-artifact-protocol";

describe("operations artifact protocol", () => {
  test("accepts the four user artifact types", () => {
    for (const type of ["jira", "gitlab", "healthcheck", "blocker"]) {
      expect(Value.Check(ArtifactTypeSchema, type)).toBe(true);
    }
  });

  test("allows missing Jira metadata while retaining configured reference fields", () => {
    expect(
      Value.Check(TicketReferenceSchema, {
        team: "fe",
        key: "AT-1146",
        title: null,
        status: null,
        url: "https://cleevio.atlassian.net/browse/AT-1146",
      }),
    ).toBe(true);
  });

  test("keeps empty blocker and healthcheck payloads valid", () => {
    expect(Value.Check(BlockersArtifactSchema, [])).toBe(true);
    expect(Value.Check(HealthchecksArtifactSchema, [])).toBe(true);
  });
});
