import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Resolve the PI agent directory used by Forkhammer sessions and resources. */
export function resolvePiAgentDir(): string {
  const envDir = process.env.FORKHAMMER_STATE_DIR;
  if (envDir) {
    return path.resolve(envDir, "pi-agent");
  }
  if (process.env.USER) {
    return path.resolve(
      "/home",
      process.env.USER,
      ".local/state/forkhammer/pi-agent",
    );
  }
  return getAgentDir();
}

/**
 * Resolve the session directory PI uses for a particular working directory.
 * PI does not currently export this helper, so mirror its documented encoding
 * while still letting PI read and parse the session files.
 */
export function resolvePiSessionDir(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  const safeCwd = `--${resolvedCwd.replace(/^[/\\\\]/, "").replace(/[/\\\\:]/g, "-")}--`;
  return path.join(resolvePiAgentDir(), "sessions", safeCwd);
}
