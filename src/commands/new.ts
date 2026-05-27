import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import chalk from "chalk";
import { execa } from "execa";
import path from "node:path";
import { loadConfig, type Config } from "../config";
import { formatIssueContext, getIssueContext } from "../jira";
import { unwrapOpencodeData } from "../opencode";
import { printValidationResult } from "./validation-format";
import {
  validationStructuredResultSchema,
  type UltrafeedEventData,
  type ValidationStructuredResult,
} from "../worker/events";

type ResolvedProject = {
  name: string;
  key: string;
  root: string;
};

type ResolvedWorktree = {
  name: string;
  branch: string;
  directory: string;
};

type ValidationIdentifiers = {
  issueKey: string;
  projectKey: string;
  projectName: string;
  projectId: string;
  sessionId: string;
  worktreeName: string;
  worktreeBranch: string;
  worktreeDirectory: string;
};

type ValidationEventIdentifiers = {
  issue_key: string;
  project_key: string;
  project_name: string;
  project_id: string;
  session_id: string;
  worktree_name: string;
  worktree_branch: string;
  worktree_directory: string;
};

type ModelConfig = {
  providerID: string;
  modelID: string;
};

type ValidationEventHooks = {
  onStarted?: (
    payload: UltrafeedEventData<"validate_issue_started">,
  ) => Promise<void> | void;
  onPromptCompleted?: (
    payload: UltrafeedEventData<"validate_issue_prompt_completed">,
  ) => Promise<void> | void;
  onPromptFailed?: (
    payload: UltrafeedEventData<"validate_issue_prompt_failed">,
  ) => Promise<void> | void;
  onSucceeded?: (
    payload: UltrafeedEventData<"issue_validated">,
  ) => Promise<void> | void;
  onFailed?: (
    payload: UltrafeedEventData<"issue_validation_failed">,
  ) => Promise<void> | void;
};

type ValidationRunResult = {
  issueKey: string;
  projectKey: string;
  projectName: string;
  projectId: string;
  jiraSummary: string;
  sessionId: string;
  worktreeName: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  result: ValidationStructuredResult;
};

const VALIDATION_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            relatedFilePath: { type: "string" },
          },
        },
      },
      summary: { type: "string" },
      todos: {
        type: "array",
        items: { type: "string" },
      },
      relatedFiles: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            note: { type: "string" },
          },
        },
      },
      clarity: {
        type: "number",
        minimum: 0,
        maximum: 10,
      },
    },
  },
};

export async function runIssueValidation(input: {
  key: string;
  project?: string;
  streamEvents?: boolean;
  hooks?: ValidationEventHooks;
}): Promise<ValidationRunResult> {
  let issueKey = input.key;

  try {
    const config = await loadConfig();
    const model = resolveDefaultModel(config);
    const project = resolveProject(config, input.key, input.project);
    const gitRoot = await resolveGitRoot(project.root, process.cwd());

    const issue = await getIssueContext(config, input.key);
    issueKey = issue.key;
    const context = formatIssueContext(issue);

    const rootClient = createOpencodeClient({
      baseUrl: "http://localhost:8000",
      directory: gitRoot,
    });
    const worktree = await createOrGetWorktree(rootClient, issue.key);

    const worktreeClient = createOpencodeClient({
      baseUrl: "http://localhost:8000",
      directory: worktree.directory,
    });
    const session = await worktreeClient.session
      .create({
        directory: worktree.directory,
        title: `${issue.key} - ${issue.summary}`,
      })
      .then(unwrapOpencodeData);

    const identifiers = toValidationEventIdentifiers({
      issueKey: issue.key,
      projectKey: project.key,
      projectName: project.name,
      projectId: session.projectID,
      sessionId: session.id,
      worktreeName: worktree.name,
      worktreeBranch: worktree.branch,
      worktreeDirectory: worktree.directory,
    });

    await input.hooks?.onStarted?.({
      ...identifiers,
      issue_summary: issue.summary,
      jira_description: issue.description,
      issue_comments: issue.comments,
    });

    const controller = new AbortController();
    const eventLoop = input.streamEvents
      ? streamSessionEvents(worktreeClient, controller.signal)
      : Promise.resolve();

    const result = await promptValidationSession(worktreeClient, {
      sessionId: session.id,
      context,
      model,
    });

    controller.abort();
    await eventLoop;

    const structured = extractValidationResult(result);

    await input.hooks?.onSucceeded?.({
      ...identifiers,
      source: "forkhammer",
      jira_summary: issue.summary,
      ...structured,
    });

    if (input.streamEvents) {
      printValidationResult(structured, {
        worktreeDirectory: worktree.directory,
      });
    }

    console.log(
      `Created OpenCode session ${chalk.green(session.id)} for ${chalk.green(project.name)} (${chalk.gray(project.root)})`,
    );

    return {
      issueKey: issue.key,
      projectKey: project.key,
      projectName: project.name,
      projectId: session.projectID,
      jiraSummary: issue.summary,
      sessionId: session.id,
      worktreeName: worktree.name,
      worktreeBranch: worktree.branch,
      worktreeDirectory: worktree.directory,
      result: structured,
    };
  } catch (error) {
    await Promise.resolve(
      input.hooks?.onFailed?.({
        issue_key: issueKey,
        error: toErrorMessage(error),
      }),
    ).catch(() => {});
    throw error;
  }
}

export async function runIssuePrompt(input: {
  issueKey: string;
  requestEventId: string;
  prompt: string;
  projectKey: string;
  projectName: string;
  projectId: string;
  sessionId: string;
  worktreeName: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  hooks?: ValidationEventHooks;
}): Promise<void> {
  try {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:8000",
      directory: input.worktreeDirectory,
    });

    const session = await client.session
      .get({
        sessionID: input.sessionId,
        directory: input.worktreeDirectory,
      })
      .then(unwrapOpencodeData);

    if (session.projectID !== input.projectId) {
      throw new Error(
        `session-project-mismatch:${input.sessionId}:${session.projectID}:${input.projectId}`,
      );
    }

    if (session.directory !== input.worktreeDirectory) {
      throw new Error(
        `session-directory-mismatch:${input.sessionId}:${session.directory}:${input.worktreeDirectory}`,
      );
    }

    const response = await client.session
      .prompt({
        sessionID: input.sessionId,
        directory: input.worktreeDirectory,
        parts: [
          {
            type: "text",
            text: input.prompt,
          },
        ],
      })
      .then(unwrapOpencodeData);

    await input.hooks?.onPromptCompleted?.({
      ...toValidationEventIdentifiers({
        issueKey: input.issueKey,
        projectKey: input.projectKey,
        projectName: input.projectName,
        projectId: input.projectId,
        sessionId: input.sessionId,
        worktreeName: input.worktreeName,
        worktreeBranch: input.worktreeBranch,
        worktreeDirectory: input.worktreeDirectory,
      }),
      request_event_id: input.requestEventId,
      prompt: input.prompt,
      response,
    });
  } catch (error) {
    await Promise.resolve(
      input.hooks?.onPromptFailed?.({
        ...toValidationEventIdentifiers({
          issueKey: input.issueKey,
          projectKey: input.projectKey,
          projectName: input.projectName,
          projectId: input.projectId,
          sessionId: input.sessionId,
          worktreeName: input.worktreeName,
          worktreeBranch: input.worktreeBranch,
          worktreeDirectory: input.worktreeDirectory,
        }),
        request_event_id: input.requestEventId,
        prompt: input.prompt,
        error: toErrorMessage(error),
      }),
    ).catch(() => {});
    throw error;
  }
}

async function resolveGitRoot(
  primaryDirectory: string,
  fallbackDirectory: string,
) {
  const fromPrimary = await getGitRoot(primaryDirectory);
  if (fromPrimary) {
    return fromPrimary;
  }

  const fromFallback = await getGitRoot(fallbackDirectory);
  if (fromFallback) {
    return fromFallback;
  }

  throw new Error(
    `git-root-not-found: tried ${primaryDirectory} and ${fallbackDirectory}`,
  );
}

async function getGitRoot(directory: string) {
  try {
    const { stdout } = await execa("git", [
      "-C",
      directory,
      "rev-parse",
      "--show-toplevel",
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

function resolveProject(
  config: Config,
  issueKey: string,
  projectArg?: string,
): ResolvedProject {
  const projects = Object.entries(config.project ?? {}).map(
    ([name, project]) => ({
      name,
      key: project.key ?? name,
      root: project.root,
    }),
  );

  if (!projects.length) {
    throw new Error("project-config-not-found");
  }

  if (projectArg) {
    const selected = projects.find(
      (project) => project.name === projectArg || project.key === projectArg,
    );
    if (!selected) {
      throw new Error(`project-not-found:${projectArg}`);
    }
    return selected;
  }

  const issueProjectKey = issueKey.split("-")[0];
  const projectFromIssue = projects.find(
    (project) => project.key === issueProjectKey,
  );
  if (projectFromIssue) {
    return projectFromIssue;
  }

  const cwd = process.cwd();
  const projectFromCwd = projects.find(
    (project) => !path.relative(project.root, cwd).startsWith(".."),
  );
  if (projectFromCwd) {
    return projectFromCwd;
  }

  throw new Error(`project-not-found-for-issue:${issueKey}`);
}

async function createOrGetWorktree(
  client: ReturnType<typeof createOpencodeClient>,
  issueKey: string,
): Promise<ResolvedWorktree> {
  try {
    const createdWorktree = await client.worktree
      .create({
        worktreeCreateInput: {
          name: issueKey,
        },
      })
      .then(unwrapOpencodeData);

    const normalizedWorktree = normalizeWorktree(createdWorktree, issueKey);
    if (!normalizedWorktree) {
      throw new Error(`worktree-invalid-response:${issueKey}`);
    }

    return normalizedWorktree;
  } catch (error) {
    const worktrees = await client.worktree.list().then(unwrapOpencodeData);
    const existingWorktree = worktrees
      .map((worktree) => normalizeWorktree(worktree))
      .find(
        (worktree) =>
          !!worktree &&
          (worktree.name === issueKey ||
            path.basename(worktree.directory) === issueKey),
      );

    if (existingWorktree) {
      return existingWorktree;
    }

    throw error;
  }
}

function normalizeWorktree(
  worktree: unknown,
  fallbackName?: string,
): ResolvedWorktree | null {
  if (typeof worktree === "string") {
    return {
      name: fallbackName ?? path.basename(worktree),
      branch: fallbackName ?? path.basename(worktree),
      directory: worktree,
    };
  }

  if (!worktree || typeof worktree !== "object") {
    return null;
  }

  const record = worktree as Record<string, unknown>;
  const directory =
    typeof record.directory === "string"
      ? record.directory
      : typeof record.path === "string"
        ? record.path
        : null;

  if (!directory) {
    return null;
  }

  return {
    name:
      typeof record.name === "string"
        ? record.name
        : (fallbackName ?? path.basename(directory)),
    branch:
      typeof record.branch === "string"
        ? record.branch
        : (fallbackName ?? path.basename(directory)),
    directory,
  };
}

function toValidationEventIdentifiers(
  input: ValidationIdentifiers,
): ValidationEventIdentifiers {
  return {
    issue_key: input.issueKey,
    project_key: input.projectKey,
    project_name: input.projectName,
    project_id: input.projectId,
    session_id: input.sessionId,
    worktree_name: input.worktreeName,
    worktree_branch: input.worktreeBranch,
    worktree_directory: input.worktreeDirectory,
  };
}

async function streamSessionEvents(
  client: ReturnType<typeof createOpencodeClient>,
  signal: AbortSignal,
) {
  const events = await client.event.subscribe(undefined, { signal });

  return Promise.resolve(null).then(async () => {
    for await (const event of events.stream) {
      try {
        if (event.type === "message.part.updated") {
          const part = event.properties.part;
          if (part.type === "reasoning" && part.text) {
            const firstLine = part.text.split("\n").slice(0, 1).join("\n");
            console.log(`\n${chalk.red(firstLine).replaceAll("*", "")}`);
          }
          if (part.type === "text") {
            console.log(chalk.gray(part.text));
          }
        }

        if (event.type === "todo.updated") {
          for (const todo of event.properties.todos) {
            console.log(
              `- [${todo.status === "completed" ? "x" : todo.status === "pending" ? "~" : " "}] ${todo.content}`,
            );
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  });
}

async function promptValidationSession(
  client: ReturnType<typeof createOpencodeClient>,
  input: { sessionId: string; context: string; model: ModelConfig },
) {
  return client.session
    .prompt({
      sessionID: input.sessionId,
      tools: {
        question: false,
        explore: false,
      },
      format: VALIDATION_RESPONSE_FORMAT,
      model: input.model,
      agent: "plan",
      parts: [
        {
          type: "text",
          text: buildValidationPrompt(input.context),
        },
      ],
    })
    .then(unwrapOpencodeData);
}

function resolveDefaultModel(config: Config): ModelConfig {
  return {
    providerID: config.opencode?.default_provider_id ?? "openai",
    modelID: config.opencode?.default_model_id ?? "gpt-5.4-mini",
  };
}

function buildValidationPrompt(context: string) {
  return `
### Instructions
- Validate this Jira issue against the current codebase.
- Prepare an implementation plan if the Jira context is clear enough.
- If anything required to implement the issue is unclear, ask focused questions instead of guessing in the form of structured output questions.

### Jira Context

${context}`;
}

function extractValidationResult(result: unknown): ValidationStructuredResult {
  const record =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;

  const info =
    record?.info && typeof record.info === "object"
      ? (record.info as Record<string, unknown>)
      : null;

  const structuredCandidate =
    info?.structured ?? record?.structured ?? parseStructuredFromParts(record);

  const parsed =
    validationStructuredResultSchema.safeParse(structuredCandidate);
  if (!parsed.success) {
    throw new Error("validation-structured-output-missing");
  }

  return parsed.data;
}

function parseStructuredFromParts(
  record: Record<string, unknown> | null,
): unknown {
  const parts = Array.isArray(record?.parts) ? record.parts : null;
  if (!parts) {
    return null;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || typeof part !== "object") {
      continue;
    }

    const candidate = part as Record<string, unknown>;
    if (candidate.type !== "text" || typeof candidate.text !== "string") {
      continue;
    }

    try {
      return JSON.parse(candidate.text);
    } catch {
      continue;
    }
  }

  return null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
