import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import chalk from "chalk";
import { execa } from "execa";
import path from "node:path";
import { loadConfig, type Config } from "../config";
import { formatIssueContext, getIssueContext } from "../jira";
import { unwrapOpencodeData } from "../opencode";
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
  directory: string;
};

type ModelConfig = {
  providerID: string;
  modelID: string;
};

type ValidationEventHooks = {
  onStarted?: (
    payload: UltrafeedEventData<"validate_issue_started">,
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
  jiraSummary: string;
  sessionId: string;
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

    await input.hooks?.onStarted?.({
      issue_key: issue.key,
      issue_summary: issue.summary,
      jira_description: issue.description,
      issue_comments: issue.comments,
    });

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
      issue_key: issue.key,
      source: "naru-cli",
      command: "validate-issue",
      project_key: project.key,
      project_name: project.name,
      jira_summary: issue.summary,
      ...structured,
    });

    if (input.streamEvents) {
      printValidationResult(structured, worktree.directory);
    }

    console.log(
      `Created OpenCode session ${chalk.green(session.id)} for ${chalk.green(project.name)} (${chalk.gray(project.root)})`,
    );

    return {
      issueKey: issue.key,
      projectKey: project.key,
      projectName: project.name,
      jiraSummary: issue.summary,
      sessionId: session.id,
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
    directory,
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

function printValidationResult(
  structured: ValidationStructuredResult,
  worktreeDirectory: string,
) {
  console.log(chalk.green("\nClarity:"));
  console.log(structured.clarity);

  console.log(chalk.green("\nSummary:"));
  console.log(structured.summary);

  console.log(chalk.green("\nTodos:"));
  for (const todo of structured.todos) {
    console.log(`- [ ] ${todo}`);
  }

  console.log(chalk.green("\nQuestions:"));
  if (structured.questions.length) {
    for (const [index, question] of structured.questions.entries()) {
      console.log(`\nQuestion ${index + 1}: ${question.text}`);
      console.log(`Path: ${question.relatedFilePath}`);
    }
  } else {
    console.log("none");
  }

  console.log(chalk.green("\nRelated files:"));
  for (const file of structured.relatedFiles) {
    console.log(`- ${file.path.replace(worktreeDirectory, "")}`);
    console.log(`  - ${file.note}`);
  }
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
