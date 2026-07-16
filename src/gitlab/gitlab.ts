import type { Config } from "../config/config";
import type {
  MergeRequest,
  PipelineJob,
  PipelineSnapshot,
} from "../worker/operations-artifact/operations-artifact-protocol";
import type { GitlabClient } from "./gitlab-types";
import { matchesJiraKey } from "../worker/operations-artifact/gitlab-artifact";

type GitlabConfig = NonNullable<Config["gitlab"]>;

type JsonRecord = Record<string, any>;

export function createGitlabClient(config: GitlabConfig): GitlabClient {
  const request = async (path: string, params?: Record<string, string>) => {
    const url = new URL(`/api/v4${path}`, config.url);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": config.token },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`gitlab-request-failed:${response.status}:${body}`);
    }
    return body.length > 0 ? (JSON.parse(body) as unknown) : null;
  };

  return {
    async listMergeRequests(opts) {
      const raw = await request(
        `/projects/${encode(opts.projectId)}/merge_requests`,
        {
          state: opts.state,
          ...(opts.mergedAfter ? { merged_after: opts.mergedAfter } : {}),
          per_page: "100",
        },
      );
      if (!Array.isArray(raw)) throw new Error("gitlab-invalid-merge-requests");

      // `merged_after` is supported by GitLab, but some GitLab versions and
      // proxies have been observed to ignore it. Keep the boundary enforced
      // locally as well so stale MRs cannot end up in the artifact.
      const cutoff = opts.mergedAfter
        ? Date.parse(opts.mergedAfter)
        : undefined;
      const filtered =
        cutoff === undefined || Number.isNaN(cutoff)
          ? raw
          : raw.filter((item) => {
              const mergedAt = Date.parse(
                String((item as JsonRecord).merged_at ?? ""),
              );
              return !Number.isNaN(mergedAt) && mergedAt >= cutoff;
            });
      return filtered.map((item) => normalizeMergeRequest(item as JsonRecord));
    },
    async getLatestPipeline(opts) {
      const raw = await request(
        `/projects/${encode(opts.projectId)}/pipelines`,
        {
          ref: opts.branch,
          per_page: "1",
        },
      );
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(
          `gitlab-pipeline-missing:${opts.projectId}:${opts.branch}`,
        );
      }
      return normalizePipeline(raw[0] as JsonRecord, opts.branch);
    },
    async getPipelineHistory(opts) {
      const raw = await request(
        `/projects/${encode(opts.projectId)}/pipelines`,
        {
          ref: opts.branch,
          per_page: "100",
        },
      );
      if (!Array.isArray(raw))
        throw new Error("gitlab-invalid-pipeline-history");
      return raw.map((item) =>
        normalizePipeline(item as JsonRecord, opts.branch),
      );
    },
    async getNonSuccessfulJobs(opts) {
      const pipelineId = opts.pipelineUrl.split("/").pop();
      if (!pipelineId) throw new Error("gitlab-pipeline-id-missing");
      const raw = await request(
        `/projects/${encode(opts.projectId)}/pipelines/${encode(pipelineId)}/jobs`,
        { per_page: "100" },
      );
      if (!Array.isArray(raw)) throw new Error("gitlab-invalid-pipeline-jobs");
      return raw
        .filter((item) => item.status !== "success")
        .map((item) => ({
          name: String(item.name ?? "unknown"),
          status: String(item.status ?? "unknown"),
        }));
    },
    async searchMergeRequests(opts) {
      const [opened, merged] = await Promise.all([
        request(`/projects/${encode(opts.projectId)}/merge_requests`, {
          state: "opened",
          per_page: "100",
        }),
        request(`/projects/${encode(opts.projectId)}/merge_requests`, {
          state: "merged",
          per_page: "100",
        }),
      ]);
      if (!Array.isArray(opened) || !Array.isArray(merged)) {
        throw new Error("gitlab-invalid-merge-request-search");
      }
      return [...opened, ...merged]
        .filter((item) =>
          matchesJiraKey(
            `${String(item.title ?? "")}\n${String(item.description ?? "")}`,
            opts.key,
          ),
        )
        .map((item) => normalizeMergeRequest(item as JsonRecord));
    },
  };
}

function normalizeMergeRequest(item: JsonRecord): MergeRequest {
  const url = String(item.web_url);
  return {
    iid: Number(item.iid),
    title: String(item.title ?? ""),
    project: item.references?.full?.toLowerCase().includes("frontend")
      ? "Frontend"
      : "Backend",
    author: String(item.author?.name ?? item.author?.username ?? "unknown"),
    assignee: String(item.assignees?.[0]?.name ?? "unassigned"),
    sourceBranch: String(item.source_branch ?? ""),
    targetBranch: String(item.target_branch ?? ""),
    state: item.state === "merged" ? "merged" : "opened",
    updatedAt: String(item.updated_at ?? ""),
    url,
    pipeline: normalizePipeline(
      item.pipeline ?? {},
      String(item.target_branch ?? "main"),
      url,
    ),
  };
}

function normalizePipeline(
  item: JsonRecord,
  branch: string,
  fallbackUrl?: string,
): PipelineSnapshot {
  const rawStatus = String(item.status ?? "running");
  const status =
    rawStatus === "success"
      ? "success"
      : rawStatus === "failed" || rawStatus === "canceled"
        ? "failed"
        : "running";
  return {
    status,
    branch,
    url: String(
      item.web_url ?? fallbackUrl ?? "https://gitlab.invalid/pipeline",
    ),
    updatedAt: String(item.updated_at ?? item.created_at ?? ""),
  };
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
