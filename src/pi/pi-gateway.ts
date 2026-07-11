import path from "node:path";
import { ProjectConfig } from "src/commands/project-worktree";
import { getIssueContext, type JiraClient } from "src/jira/jira";
import { PiJiraPrompt } from "src/pi/pi-jira-prompt";
import { logPiEvent } from "src/pi/pi-logger";
import { PiSessionGateway } from "src/pi/pi-session";
import { SubmitImplementationPlanTool } from "src/pi/tools/submit-implementation-plan-tool";
import type { WorkerConfig } from "src/worker/config";
import type {
  UltrafeedEventData,
  ValidationStructuredResult,
} from "src/worker/events";

export abstract class PiGateway {
  abstract runIssueValidation(
    opts: RunIssueValidationOptions,
  ): Promise<PiValidationRunResult>;
  static create = createPiGateway;
}

export interface RunIssueValidationOptions {
  jiraKey: string;
  hooks?: PiValidationEventHooks;
}

export type PiValidationEventHooks = {
  onStarted?: (
    data: UltrafeedEventData<"validate_issue_started">,
  ) => Promise<void> | void;
  onSucceeded?: (
    data: UltrafeedEventData<"issue_validated">,
  ) => Promise<void> | void;
  onFailed?: (
    data: UltrafeedEventData<"issue_validation_failed">,
  ) => Promise<void> | void;
};

export type PiValidationRunResult = {
  issueKey: string;
  projectKey: string;
  projectName: string;
  sessionId: string;
  worktreeName: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  piSessionFile?: string;
  result: ValidationStructuredResult;
};

export function createPiGateway(
  jira: JiraClient,
  config: WorkerConfig,
): PiGateway {
  return {
    async runIssueValidation(opts) {
      const issueKey = opts.jiraKey;

      try {
        // Fetch issue from Jira so we can inject it
        const issue = await jira.getIssueContext({ issueKey });

        // Get project configuration so we know where to create worktree
        const project = ProjectConfig.of(config.project).resolveByJiraKey(
          opts.jiraKey,
        );

        // Create worktree
        const worktree = await project.provisionTicketWorktree(opts.jiraKey);

        // Plan tool will the plan for later use
        const planTool = SubmitImplementationPlanTool.create();

        // Prepare plan session
        const { session } = await PiSessionGateway.create({
          directory: worktree.directory,
          planTool,
        });

        const piSessionFile = session.sessionFile
          ? path.basename(session.sessionFile)
          : undefined;

        const identifiers = {
          provider: "pi" as const,
          issue_key: opts.jiraKey,
          project_key: project.config.key,
          project_name: project.config.name,
          session_id: session.sessionId,
          worktree_name: worktree.name,
          worktree_branch: worktree.branch,
          worktree_directory: worktree.directory,
          pi_session_file: session.sessionFile,
        };

        await opts.hooks?.onStarted?.({
          ...identifiers,
          issue_summary: issue.summary,
          jira_description: issue.description,
          issue_comments: issue.comments,
        });

        session.subscribe(logPiEvent);

        await session.prompt(
          await PiJiraPrompt.fromJiraIssue(jira, { jiraKey: opts.jiraKey }),
        );
        const result = await planTool.oncePlan();

        await opts.hooks?.onSucceeded?.({
          ...identifiers,
          source: "forkhammer",
          jira_summary: issue.summary,
          ...result,
        });

        return {
          issueKey: opts.jiraKey,
          projectKey: project.config.key,
          projectName: project.config.name,
          sessionId: session.sessionId,
          worktreeName: worktree.name,
          worktreeBranch: worktree.branch,
          worktreeDirectory: worktree.directory,
          piSessionFile,
          result,
        };
      } catch (error) {
        await opts.hooks?.onFailed?.({
          provider: "pi",
          issue_key: opts.jiraKey,
          error: toErrorMessage(error),
        });
        throw error;
      }
    },
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
