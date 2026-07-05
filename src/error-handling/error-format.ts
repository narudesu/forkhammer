import PrettyError from "pretty-error";

const prettyError = new PrettyError().withoutColors();

export function formatError(error: unknown): string {
  return prettyError.render(toError(error));
}

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error(formatUnknown(error));
}

function formatUnknown(error: unknown) {
  try {
    return JSON.stringify(error, null, 2) ?? String(error);
  } catch {
    return String(error);
  }
}
