import chalk from "chalk";
import type { Config } from "../config/config";
import { loadConfig } from "../config/config";
import { JiraClient } from "src/jira/jira";
import type { JiraInboxIssue } from "src/jira/jira-types";

type RunJiraInboxOptions = {
  loadConfig?: () => Promise<Config>;
  fetchFn?: typeof fetch;
  print?: (line: string) => void;
  warn?: (line: string) => void;
};

export async function runJiraInbox(options: RunJiraInboxOptions = {}) {
  const config = await (options.loadConfig ?? loadConfig)();
  const jiraConfig = config.jira;

  if (!jiraConfig) {
    throw new Error("jira-config-not-found");
  }
  const client = JiraClient.create(jiraConfig);

  const issues = await client.getJiraInboxIssues();

  const print = options.print ?? console.log;
  if (!issues.length) {
    print("No Jira inbox issues found.");
    return;
  }

  print(chalk.green(`Jira inbox issues (${issues.length}):`));
  for (const line of formatJiraInboxIssues(issues)) {
    print(line);
  }
}

export function formatJiraInboxIssues(issues: Array<JiraInboxIssue>) {
  return issues.flatMap((issue) => formatJiraInboxIssue(issue));
}

function formatJiraInboxIssue(issue: JiraInboxIssue) {
  const lines = [
    `${chalk.gray("-")} ${chalk.bold(issue.key)} ${chalk.white(issue.summary)}`,
    `  ${chalk.gray("status:")} ${chalk.cyan(issue.status)}`,
    `  ${chalk.gray("priority:")} ${chalk.yellow(issue.priority)}`,
  ];

  if (issue.labels?.length) {
    lines.push(`  ${chalk.gray("labels:")} ${issue.labels.join(", ")}`);
  }

  if (issue.assignee) {
    lines.push(`  ${chalk.gray("assignee:")} ${issue.assignee}`);
  }

  if (issue.reporter) {
    lines.push(`  ${chalk.gray("reporter:")} ${issue.reporter}`);
  }

  return lines;
}
