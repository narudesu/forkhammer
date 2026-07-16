import type {
  MergeRequest,
  PipelineJob,
  PipelineSnapshot,
} from "../worker/operations-artifact/operations-artifact-protocol";

export interface GitlabProject {
  id: string;
  name: "Frontend" | "Backend";
  branches: string[];
}

export interface GitlabClient {
  listMergeRequests(opts: {
    projectId: string;
    state: "opened" | "merged";
    mergedAfter?: string;
  }): Promise<MergeRequest[]>;
  getLatestPipeline(opts: {
    projectId: string;
    branch: string;
  }): Promise<PipelineSnapshot>;
  getPipelineHistory(opts: {
    projectId: string;
    branch: string;
  }): Promise<PipelineSnapshot[]>;
  getNonSuccessfulJobs(opts: {
    projectId: string;
    pipelineUrl: string;
  }): Promise<PipelineJob[]>;
  searchMergeRequests(opts: {
    projectId: string;
    key: string;
  }): Promise<MergeRequest[]>;
}
