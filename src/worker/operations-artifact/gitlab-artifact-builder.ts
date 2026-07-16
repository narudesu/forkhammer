import type { Config } from "../../config/config";
import type {
  GitlabArtifact,
  MergeRequest,
  PipelineSnapshot,
  PipelineSummary,
  ProjectActivity,
} from "./operations-artifact-protocol";
import { selectPipelineInvestigation } from "./gitlab-artifact";
import type { GitlabClient } from "../../gitlab/gitlab-types";

type GitlabConfig = NonNullable<Config["gitlab"]>;

export async function buildGitlabArtifact(opts: {
  config: GitlabConfig;
  client: GitlabClient;
  now?: Date;
}): Promise<GitlabArtifact> {
  const now = opts.now ?? new Date();
  const mergedAfter = new Date(
    now.getTime() - 1 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const frontend = await buildProjectActivity({
    name: "Frontend",
    project: opts.config.projects.frontend,
    client: opts.client,
    mergedAfter,
  });
  const backend = await buildProjectActivity({
    name: "Backend",
    project: opts.config.projects.backend,
    client: opts.client,
    mergedAfter,
  });
  return { createdAt: now.toISOString(), frontend, backend };
}

async function buildProjectActivity(opts: {
  name: "Frontend" | "Backend";
  project: { id: string; branches: string[] };
  client: GitlabClient;
  mergedAfter: string;
}): Promise<ProjectActivity> {
  const [open, merged, pipelines] = await Promise.all([
    opts.client.listMergeRequests({
      projectId: opts.project.id,
      state: "opened",
    }),
    opts.client.listMergeRequests({
      projectId: opts.project.id,
      state: "merged",
      mergedAfter: opts.mergedAfter,
    }),
    Promise.all(
      opts.project.branches.map((branch) =>
        buildBranchPipeline(opts.client, opts.project.id, branch),
      ),
    ),
  ]);

  return {
    name: opts.name,
    openMergeRequests: open.map((mr) => ({ ...mr, project: opts.name })),
    recentlyMerged: merged.map((mr) => ({ ...mr, project: opts.name })),
    pipelines,
  };
}

async function buildBranchPipeline(
  client: GitlabClient,
  projectId: string,
  branch: string,
): Promise<PipelineSummary> {
  const latest = await client.getLatestPipeline({ projectId, branch });
  if (latest.status !== "failed") return latest;

  const history = await client.getPipelineHistory({ projectId, branch });
  const investigation = selectPipelineInvestigation(
    history.map((pipeline) => ({ ...pipeline, id: pipeline.url })),
    { ...latest, id: latest.url },
  );
  const jobs = await client.getNonSuccessfulJobs({
    projectId,
    pipelineUrl: latest.url,
  });
  return {
    ...latest,
    baseline: findSnapshot(history, investigation.baseline?.id),
    firstFailure: findSnapshot(history, investigation.firstFailure?.id),
    nonSuccessfulJobs: jobs,
  };
}

function findSnapshot(
  snapshots: PipelineSnapshot[],
  url: string | number | undefined,
): PipelineSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.url === url);
}

export function asMergeRequestPipeline(mr: MergeRequest): PipelineSummary {
  return mr.pipeline;
}
