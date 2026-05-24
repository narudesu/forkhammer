import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProjectFromIssueKey } from "./queue";
import type { Config } from "../config";

describe("queue project resolution", () => {
  const config = {
    project: {
      alpha: {
        root: "/work/alpha",
        key: "ALPHA",
      },
    },
  } satisfies Partial<Config>;

  it("resolves a project from the issue key prefix", () => {
    assert.deepEqual(resolveProjectFromIssueKey(config as Config, "ALPHA-123"), {
      name: "alpha",
      key: "ALPHA",
      root: "/work/alpha",
    });
  });

  it("throws when the issue key does not match a configured project", () => {
    assert.throws(
      () => resolveProjectFromIssueKey(config as Config, "BETA-123"),
      /project-not-found-for-issue:BETA-123/,
    );
  });
});
