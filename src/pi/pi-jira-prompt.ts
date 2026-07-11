import { formatIssueContext, type JiraClient } from "src/jira/jira";

export class PiJiraPrompt {
  static async fromJiraIssue(jira: JiraClient, opts: { jiraKey: string }) {
    const issue = await jira.getIssueContext({ issueKey: opts.jiraKey });
    const issueContext = formatIssueContext(issue);

    return buildValidationPrompt(issueContext);
  }
}

const isTestPromptMode = process.env.FORKHAMMER_TEST_MODE === "true";

function buildValidationPrompt(context: string) {
  return `
### Instructions
- Validate this Jira issue against the current codebase.
- Prepare an implementation plan if the Jira context is clear enough.
- If anything required to implement the issue is unclear, ask focused questions instead of guessing in the form of structured output questions.
- You must submit exactly one complete response through the submit_implementation_plan tool before finishing.
- Do not only describe the plan in chat; the submitted tool payload is the validation result.

${isTestPromptMode ? testPromptExtra : ""}

### Jira Context

${context}`;
}
const testPromptExtra =
  "IMPORTANT: we are just testing now, so do not read any files, just call the tool with some plausible texts based on the jira context";
