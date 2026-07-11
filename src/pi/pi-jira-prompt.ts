import { formatIssueContext, type JiraClient } from "src/jira/jira";

export class PiJiraPrompt {
  static async fromJiraIssue(jira: JiraClient, opts: { jiraKey: string }) {
    const issue = await jira.getIssueContext({ issueKey: opts.jiraKey });
    const issueContext = formatIssueContext(issue);

    return buildValidationPrompt(issueContext);
  }
}

function buildValidationPrompt(context: string) {
  return `
### Instructions
- Validate this Jira issue against the current codebase.
- Prepare an implementation plan if the Jira context is clear enough.
- If anything required to implement the issue is unclear, ask focused questions instead of guessing in the form of structured output questions.
- Use the submit_implementation_plan tool to submit the plan

### Jira Context

${context}`;
}
