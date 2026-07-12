import {
  runPeerCreateSession,
  runPeerListSessions,
} from "src/cli-commands/run-peer-commands";

export async function runPlayground() {
  // put some temporary code here to run while developing
  await runPeerCreateSession(
    "/home/naru/code/forkhammer/trees/atomika/AT-1145",
  );
  await runPeerListSessions(
    "atomika",
    "/home/naru/code/forkhammer/trees/atomika/AT-1145",
  );
}

runPlayground();
