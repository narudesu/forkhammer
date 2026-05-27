import chalk from "chalk";
import type { ValidationStructuredResult } from "../worker/events";

type ValidationFormatOptions = {
  worktreeDirectory?: string;
};

export function printValidationResult(
  structured: ValidationStructuredResult,
  options: ValidationFormatOptions = {},
) {
  for (const line of formatValidationResultLines(structured, options)) {
    console.log(line);
  }
}

export function formatValidationResultLines(
  structured: ValidationStructuredResult,
  options: ValidationFormatOptions = {},
) {
  return [
    chalk.green("\nClarity:"),
    chalk.white(String(structured.clarity)),
    chalk.green("\nSummary:"),
    chalk.white(structured.summary),
    chalk.green("\nTodos:"),
    ...formatTodos(structured.todos),
    chalk.green("\nQuestions:"),
    ...formatQuestions(structured.questions),
    chalk.green("\nRelated files:"),
    ...formatRelatedFiles(structured.relatedFiles, options.worktreeDirectory),
  ];
}

function formatTodos(todos: Array<string>) {
  if (!todos.length) {
    return [chalk.gray("none")];
  }

  return todos.map((todo) => `${chalk.gray("-")} ${chalk.white(todo)}`);
}

function formatQuestions(questions: ValidationStructuredResult["questions"]) {
  if (!questions.length) {
    return [chalk.gray("none")];
  }

  return questions.flatMap((question, index) => [
    `\n${chalk.yellow(`Question ${index + 1}:`)} ${chalk.white(question.text)}`,
    `${chalk.gray("Path:")} ${chalk.cyan(question.relatedFilePath)}`,
  ]);
}

function formatRelatedFiles(
  relatedFiles: ValidationStructuredResult["relatedFiles"],
  worktreeDirectory?: string,
) {
  if (!relatedFiles.length) {
    return [chalk.gray("none")];
  }

  return relatedFiles.flatMap((file) => [
    `${chalk.gray("-")} ${chalk.cyan(formatPath(file.path, worktreeDirectory))}`,
    `  ${chalk.gray("-")} ${chalk.white(file.note)}`,
  ]);
}

function formatPath(path: string, worktreeDirectory?: string) {
  if (!worktreeDirectory) {
    return path;
  }

  const relative = path.startsWith(worktreeDirectory)
    ? path.slice(worktreeDirectory.length)
    : path;

  return relative.length ? relative : path;
}
