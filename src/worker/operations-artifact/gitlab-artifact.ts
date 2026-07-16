export interface PipelineCandidate {
  id: string | number;
  status: "success" | "failed" | "running";
  updatedAt: string;
}

export function matchesJiraKey(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "i").test(
    text,
  );
}

export function deduplicateMergeRequests<
  T extends { project: string; iid: number },
>(mergeRequests: T[]): T[] {
  const seen = new Set<string>();
  return mergeRequests.filter((mergeRequest) => {
    const identity = `${mergeRequest.project}:${mergeRequest.iid}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function selectPipelineInvestigation(
  pipelines: PipelineCandidate[],
  latest: PipelineCandidate,
): {
  baseline?: PipelineCandidate;
  firstFailure?: PipelineCandidate;
} {
  if (latest.status !== "failed") return {};

  const chronological = [...pipelines].sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt),
  );
  const latestIndex = chronological.findIndex(
    (pipeline) => pipeline.id === latest.id,
  );
  const beforeLatest = chronological.slice(0, latestIndex);
  const baseline = [...beforeLatest]
    .reverse()
    .find((pipeline) => pipeline.status === "success");
  const firstFailure = baseline
    ? chronological
        .slice(chronological.indexOf(baseline) + 1, latestIndex + 1)
        .find((pipeline) => pipeline.status === "failed")
    : undefined;

  return { baseline, firstFailure };
}
