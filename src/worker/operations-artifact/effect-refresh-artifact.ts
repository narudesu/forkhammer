import { createEffect } from "effector";
import { createGitlabClient } from "../../gitlab/gitlab";
import { buildBlockersArtifact } from "./blocker-artifact";
import { buildGitlabArtifact } from "./gitlab-artifact-builder";
import { buildHealthchecksArtifact } from "./healthcheck-artifact";
import {
  BlockersArtifactSchema,
  GitlabArtifactSchema,
  HealthchecksArtifactSchema,
  JiraArtifactSchema,
  type ArtifactType,
} from "./operations-artifact-protocol";
import { publishArtifact } from "./operations-artifact-publisher";
import type { WorkerContext } from "../context/types";

export const effectRefreshArtifact = createEffect(
  async (opts: { ctx: WorkerContext; type: ArtifactType }) => {
    try {
      const { ctx, type } = opts;
      let content: unknown;
      let schema;

      if (type === "jira_inbox") {
        content = await ctx.jira.getJiraInboxIssues();
        schema = JiraArtifactSchema;
      } else if (type === "gitlab") {
        if (!ctx.workerConfig.gitlab) throw new Error("gitlab-config-missing");
        content = await buildGitlabArtifact({
          config: ctx.workerConfig.gitlab,
          client: createGitlabClient(ctx.workerConfig.gitlab),
        });
        schema = GitlabArtifactSchema;
      } else if (type === "healthcheck") {
        content = await buildHealthchecksArtifact({
          config: ctx.workerConfig.healthchecks ?? {},
        });
        schema = HealthchecksArtifactSchema;
      } else {
        if (!ctx.workerConfig.blockers || !ctx.workerConfig.gitlab) {
          throw new Error("blocker-config-missing");
        }
        const gitlab = createGitlabClient(ctx.workerConfig.gitlab);
        content = await buildBlockersArtifact({
          filePath: ctx.workerConfig.blockers.file,
          jira: ctx.jira,
          searchRelatedMergeRequests: async (key) => {
            const [frontend, backend] = await Promise.all([
              gitlab.searchMergeRequests({
                projectId: ctx.workerConfig.gitlab!.projects.frontend.id,
                key,
              }),
              gitlab.searchMergeRequests({
                projectId: ctx.workerConfig.gitlab!.projects.backend.id,
                key,
              }),
            ]);
            return [
              ...frontend.map((mr) => ({
                project: "Frontend" as const,
                iid: mr.iid,
                title: mr.title,
                state: mr.state,
                url: mr.url,
              })),
              ...backend.map((mr) => ({
                project: "Backend" as const,
                iid: mr.iid,
                title: mr.title,
                state: mr.state,
                url: mr.url,
              })),
            ];
          },
        });
        schema = BlockersArtifactSchema;
      }

      await publishArtifact(ctx, { type, content, schema });
    } catch (error) {
      console.error("refresh artifact error", error);
      throw error;
    }
  },
);
