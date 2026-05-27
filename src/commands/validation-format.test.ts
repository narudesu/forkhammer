import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatValidationResultLines } from "./validation-format";

describe("validation result formatting", () => {
  it("renders the full validation plan", () => {
    const lines = formatValidationResultLines(
      {
        clarity: 8,
        summary: "Add a safer queue read",
        todos: ["Update the read path", "Add a formatter test"],
        questions: [
          {
            text: "Should the queue read trim worktree paths?",
            relatedFilePath: "/work/alpha/src/commands/queue.ts",
          },
        ],
        relatedFiles: [
          {
            path: "/work/alpha/src/commands/queue.ts",
            note: "Current queue read output",
          },
        ],
      },
      { worktreeDirectory: "/work/alpha" },
    ).map(stripAnsi);

    assert.deepEqual(lines, [
      "\nClarity:",
      "8",
      "\nSummary:",
      "Add a safer queue read",
      "\nTodos:",
      "- Update the read path",
      "- Add a formatter test",
      "\nQuestions:",
      "\nQuestion 1: Should the queue read trim worktree paths?",
      "Path: /work/alpha/src/commands/queue.ts",
      "\nRelated files:",
      "- /src/commands/queue.ts",
      "  - Current queue read output",
    ]);
  });
});

function stripAnsi(value: string) {
  return value.replace(new RegExp("\\x1B\\[[0-9;]*m", "g"), "");
}
