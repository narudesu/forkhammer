import { expect, mock, test } from "bun:test";
import { createPeerClient } from "./peer-client";
import type { PeerResolverTarget } from "./peer-protocol";
import { createPeerResolverTarget } from "./peer-resolver";
import type { WorkerContext } from "src/worker/context/types";

function harness(
  getJiraIssue = mock(
    async (_params: unknown): Promise<unknown> => ({ issue: null }),
  ),
) {
  const client = createPeerClient();
  let receive: (message: string) => void = () => {};
  let reply: (value: {
    result?: unknown;
    error?: { code: number; message: string };
  }) => void = () => {};
  client.acceptWebSocket({
    send: (message) => reply(JSON.parse(message)),
    close() {},
    onMessage: (handler) => {
      receive = handler;
    },
    onClose() {},
  });
  client.registerTarget({
    getJiraIssue,
    dispose() {},
  } as unknown as PeerResolverTarget);
  return {
    getJiraIssue,
    request(params: unknown): Promise<{
      result?: unknown;
      error?: { code: number; message: string };
    }> {
      return new Promise((resolve) => {
        reply = resolve;
        receive(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "get-jira-issue",
            params,
          }),
        );
      });
    },
  };
}

test("registers get-jira-issue and returns schema-valid null", async () => {
  const rpc = harness();
  expect(await rpc.request({ issueKey: "ABC-1" })).toMatchObject({
    result: { issue: null },
  });
  expect(rpc.getJiraIssue).toHaveBeenCalledWith({ issueKey: "ABC-1" });
});
for (const params of [null, {}, { issueKey: "" }, { issueKey: 123 }, []]) {
  test(`rejects invalid parameters ${JSON.stringify(params)}`, async () => {
    const rpc = harness();
    expect((await rpc.request(params)).error?.code).toBe(-32602);
    expect(rpc.getJiraIssue).not.toHaveBeenCalled();
  });
}
test("rejects responses outside the authoritative schema", async () => {
  const rpc = harness(mock(async () => ({ issue: {} })));
  expect((await rpc.request({ issueKey: "ABC-1" })).error?.code).toBe(-32603);
});
test("returns Jira failures as RPC errors", async () => {
  const rpc = harness(
    mock(async () => {
      throw new Error("jira-request-failed:403");
    }),
  );
  expect((await rpc.request({ issueKey: "ABC-1" })).error).toBeDefined();
});
test("resolver uses the configured Jira client", async () => {
  const getJiraIssue = mock(async () => null);
  const target = createPeerResolverTarget({
    jira: { getJiraIssue },
    workerConfig: { worker: {} },
  } as unknown as WorkerContext);
  expect(await target.getJiraIssue({ issueKey: "ABC-1" })).toEqual({
    issue: null,
  });
  expect(getJiraIssue).toHaveBeenCalledWith({ issueKey: "ABC-1" });
});
