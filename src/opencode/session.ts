import { Session } from "@opencode-ai/sdk/v2";

export abstract class OpencodeSessionGateway {
  abstract session: Session;

  static wrap = wrapInGateway;
}

function wrapInGateway(session: Session): OpencodeSessionGateway {
  return {
    session,
  };
}
