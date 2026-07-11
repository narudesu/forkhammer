import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export function logPiEvent(event: AgentSessionEvent) {
  if (event.type === "message_end" && event.message.role === "assistant") {
    for (const item of event.message.content) {
      if (item.type === "text") {
        console.log("Agent: " + item.text);
      }
      if (item.type === "thinking") {
        console.log("Thinking...");
      }
      if (item.type === "toolCall") {
        console.log("Tool call = " + item.name, item.arguments);
      }
    }
  }
}
