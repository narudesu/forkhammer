import { createClient } from "@supabase/supabase-js";
import chalk from "chalk";
import { loadConfig, type Config } from "../config";
import { login } from "../worker/auth";
import { emitEvent } from "../worker/event-emitter";
import {
  parseUltrafeedEventData,
  ultrafeedWorkerEmittedEventTypes,
  type UltrafeedEventData,
  type ValidationStructuredResult,
} from "../worker/events";
import type {
  FeedEvent,
  SupabaseClientLike,
  SupabaseConfig,
} from "../worker/types";
import { requireSupabaseConfig } from "../supabase-config";
import { printValidationResult } from "./validation-format";

const RECENT_EVENT_LIMIT = 50;
const ISSUE_READ_LIMIT = 200;

type QueueContext = {
  appConfig: Config;
  supabaseConfig: SupabaseConfig;
  client: SupabaseClientLike;
};

type ParsedQueueEvent = FeedEvent & {
  data: UltrafeedEventData<"validate_issue_requested">;
};

export async function runQueueAdd(issueKey: string, json = false) {
  const context = await loadQueueContext();
  const project = resolveProjectFromIssueKey(context.appConfig, issueKey);

  await emitEvent(
    context.supabaseConfig,
    context.client,
    "validate_issue_requested",
    {
      issue_key: issueKey,
    },
  );

  if (json) {
    console.log(
      JSON.stringify(
        {
          issueKey,
          projectKey: project.key,
          projectName: project.name,
          eventType: "validate_issue_requested",
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `${chalk.green("queued")} ${chalk.bold(issueKey)} for ${chalk.gray(project.name)} (${chalk.gray(project.root)})`,
  );
}

export async function runQueueList(json = false) {
  const context = await loadQueueContext();
  const events = await loadRecentQueueEvents(context, RECENT_EVENT_LIMIT);

  if (json) {
    console.log(
      JSON.stringify(
        {
          events: events.map((event) => toQueueEventSummary(event)),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!events.length) {
    console.log("No recent queue events found.");
    return;
  }

  console.log(chalk.green("Recent queue events:"));
  for (const event of events) {
    console.log(formatQueueListRow(event));
  }
}

export async function runQueueRead(issueKey: string, json = false) {
  const context = await loadQueueContext();
  const events = await loadRecentQueueEvents(context, ISSUE_READ_LIMIT);
  const matching = events.filter((event) => event.data.issue_key === issueKey);

  if (!matching.length) {
    console.log(`No queue events found for ${issueKey}.`);
    return;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          issueKey,
          latestEvent: toQueueEventSummary(matching[0]),
          events: matching.map((event) => toQueueEventSummary(event)),
        },
        null,
        2,
      ),
    );
    return;
  }

  const latest = matching[0];
  console.log(
    `${chalk.green("Latest")} ${chalk.bold(issueKey)} event: ${chalk.bold(latest.event_type)} ${chalk.gray(latest.created_at)}`,
  );
  printQueueEventDetails(latest);

  const latestCompleted = matching.find(
    (event) => event.event_type === "issue_validated",
  );

  console.log(chalk.green("\nEvent history:"));
  for (const event of [...matching].reverse()) {
    console.log(formatQueueListRow(event));
  }

  if (latestCompleted && latestCompleted.id !== latest.id) {
    console.log(chalk.green("\nLatest completed validation plan:"));
    printValidationResult(
      latestCompleted.data as unknown as ValidationStructuredResult,
    );
  } else if (!latestCompleted) {
    console.log(chalk.yellow("\nNo completed validation plan found yet."));
  }
}

export function resolveProjectFromIssueKey(config: Config, issueKey: string) {
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

  const issueProjectKey = issueKey.split("-")[0];
  const projectFromIssue = projects.find(
    (project) => project.key === issueProjectKey,
  );

  if (projectFromIssue) {
    return projectFromIssue;
  }

  throw new Error(`project-not-found-for-issue:${issueKey}`);
}

async function loadQueueContext(): Promise<QueueContext> {
  const appConfig = await loadConfig();
  const supabaseConfig = requireSupabaseConfig(appConfig);
  const token = await login(supabaseConfig, fetch);

  const client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    accessToken: async () => token,
    global: {
      fetch,
    },
  }) as unknown as SupabaseClientLike;

  return {
    appConfig,
    supabaseConfig,
    client,
  };
}

async function loadRecentQueueEvents(
  context: QueueContext,
  limit: number,
): Promise<Array<ParsedQueueEvent>> {
  const { data, error } = await context.client
    .from(context.supabaseConfig.table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`queue-read-failed:${error.message}`);
  }

  return (data ?? [])
    .map((event) => toParsedQueueEvent(event))
    .filter((event): event is ParsedQueueEvent => event !== null);
}

function toParsedQueueEvent(event: FeedEvent): ParsedQueueEvent | null {
  const data = parseUltrafeedEventData(event.event_type, event.data);
  if (!data || !hasIssueKey(data)) {
    return null;
  }

  return {
    ...event,
    data,
  };
}

function hasIssueKey(
  data: UltrafeedEventData,
): data is UltrafeedEventData & { issue_key: string } {
  return typeof (data as { issue_key?: unknown }).issue_key === "string";
}

function toQueueEventSummary(event: ParsedQueueEvent) {
  return {
    id: event.id,
    createdAt: event.created_at,
    eventType: event.event_type,
    issueKey: event.data.issue_key,
  };
}

function formatQueueListRow(event: ParsedQueueEvent) {
  const detail =
    event.event_type === "issue_validated"
      ? ` ${chalk.gray(
          shortenValidationSummary(
            event.data as unknown as { summary: string },
          ),
        )}`
      : "";

  return `${chalk.gray(event.created_at)}  ${chalk.bold(event.data.issue_key)}  ${formatEventStatus(event.event_type)}${detail}`;
}

function formatEventStatus(eventType: string) {
  if (
    ultrafeedWorkerEmittedEventTypes.includes(
      eventType as (typeof ultrafeedWorkerEmittedEventTypes)[number],
    )
  ) {
    return chalk.green(eventType.replaceAll("_", " "));
  }

  return chalk.yellow(eventType.replaceAll("_", " "));
}

function shortenValidationSummary(event: { summary: string }) {
  const summary = event.summary.trim();
  return summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;
}

function printQueueEventDetails(event: ParsedQueueEvent) {
  if (event.event_type === "issue_validated") {
    const data = event.data as UltrafeedEventData & ValidationStructuredResult;

    printValidationResult(data);
    return;
  }

  if (event.event_type === "issue_validation_failed") {
    const data = event.data as UltrafeedEventData & { error: string };
    console.log(chalk.red("Error:"), data.error);
    return;
  }

  if (event.event_type === "validate_issue_started") {
    const data = event.data as UltrafeedEventData & {
      session_id: string;
      project_id: string;
      worktree_name: string;
      worktree_branch: string;
      worktree_directory: string;
      issue_summary: string;
      issue_comments: Array<unknown>;
    };

    console.log(chalk.green("Session:"), data.session_id);
    console.log(chalk.green("Project:"), data.project_id);
    console.log(chalk.green("Worktree:"), data.worktree_name);
    console.log(chalk.green("Branch:"), data.worktree_branch);
    console.log(chalk.green("Directory:"), data.worktree_directory);
    console.log(chalk.green("Issue summary:"), data.issue_summary);
    console.log(chalk.green("Comments:"), data.issue_comments.length);
    return;
  }

  if (event.event_type === "validate_issue_prompt_requested") {
    const data = event.data as UltrafeedEventData & {
      session_id: string;
      worktree_directory: string;
      prompt: string;
    };

    console.log(chalk.green("Session:"), data.session_id);
    console.log(chalk.green("Directory:"), data.worktree_directory);
    console.log(chalk.green("Prompt:"), data.prompt);
    return;
  }

  if (event.event_type === "validate_issue_prompt_completed") {
    const data = event.data as UltrafeedEventData & {
      session_id: string;
      request_event_id: string;
      prompt: string;
      response: unknown;
    };

    console.log(chalk.green("Session:"), data.session_id);
    console.log(chalk.green("Prompt:"), data.prompt);
    console.log(
      chalk.green("Response:"),
      summarizePromptResponse(data.response),
    );
    return;
  }

  if (event.event_type === "validate_issue_prompt_failed") {
    const data = event.data as UltrafeedEventData & {
      session_id: string;
      request_event_id: string;
      prompt: string;
      error: string;
    };

    console.log(chalk.green("Session:"), data.session_id);
    console.log(chalk.green("Prompt:"), data.prompt);
    console.log(chalk.red("Error:"), data.error);
    return;
  }

  if (event.event_type === "validate_issue_requested") {
    const data = event.data as UltrafeedEventData & { issue_key: string };
    console.log(chalk.green("Requested issue:"), data.issue_key);
  }
}

function summarizePromptResponse(response: unknown) {
  if (typeof response === "string") {
    return response.length > 120 ? `${response.slice(0, 117)}...` : response;
  }

  try {
    const json = JSON.stringify(response);
    if (!json) {
      return "<empty>";
    }
    return json.length > 120 ? `${json.slice(0, 117)}...` : json;
  } catch {
    return String(response);
  }
}
