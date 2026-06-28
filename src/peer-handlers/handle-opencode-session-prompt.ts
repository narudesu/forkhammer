import { createDefaultOpencodeClient, unwrapOpencodeData } from "src/opencode";
import type { PeerMessage } from "src/peer-protocol";

export async function handleOpencodeSessionPrompt(
  msg: PeerMessage,
  sendResponse: (msg: PeerMessage) => void,
): Promise<void> {
  if (msg.type !== "opencode.session.prompt") {
    return;
  }

  try {
    const client = createDefaultOpencodeClient();
    if (msg.agent) {
      const response = await client.session
        .prompt({
          sessionID: msg.sessionId,
          agent: msg.agent,
          parts: [{ type: "text", text: msg.prompt }],
        })
        .then(unwrapOpencodeData);

      sendResponse({
        id: msg.id,
        type: "opencode.session.prompt_response",
        sessionId: msg.sessionId,
        accepted: true,
        messageId: response.info.id,
      });
      return;
    }

    const response = await client.v2.session
      .prompt({
        sessionID: msg.sessionId,
        prompt: { text: msg.prompt },
        delivery: msg.delivery,
      })
      .then(unwrapOpencodeData);

    sendResponse({
      id: msg.id,
      type: "opencode.session.prompt_response",
      sessionId: msg.sessionId,
      accepted: true,
      messageId: response.id,
    });
  } catch (error) {
    sendResponse({
      id: msg.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
