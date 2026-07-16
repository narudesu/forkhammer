import { describe, expect, test } from "bun:test";
import { parseConfig } from "./config";

describe("artifact configuration", () => {
  test("parses GitLab projects, blocker file, and healthchecks", () => {
    const config = parseConfig(`
      [worker.snapshots]
      directory = "/tmp/snapshots"

      [gitlab]
      url = "https://gitlab.example.com"
      token = "secret"

      [gitlab.projects.frontend]
      id = "frontend/project"
      branches = ["main", "staging"]

      [gitlab.projects.backend]
      id = "backend/project"
      branches = ["main", "production"]

      [blockers]
      file = "/tmp/blockers.toml"

      [healthchecks.app]
      name = "App"
      url = "https://app.example.com/health"
    `);

    expect(config.gitlab?.projects.frontend.branches).toEqual([
      "main",
      "staging",
    ]);
    expect(config.blockers?.file).toBe("/tmp/blockers.toml");
    expect(config.healthchecks?.app.name).toBe("App");
  });
});
