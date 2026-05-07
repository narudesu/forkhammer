import { createOpencodeClient } from "@opencode-ai/sdk";

type OpencodeResponse<TData> = { data: TData | undefined; error: unknown };

export function unwrapOpencodeData<TData>(response: OpencodeResponse<TData>) {
  if (response.error) {
    throw response.error;
  }
  if (!response.data) {
    throw new Error("data-not-found");
  }
  return response.data;
}

export function createDefaultOpencodeClient() {
  return createOpencodeClient({
    baseUrl: "http://localhost:8000",
  });
}
