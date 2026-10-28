import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { execa } from "execa";
import type { WorkerConfig } from "../worker/config";
import {
  BranchListParamsSchema,
  DiffRequestSchema,
  type BranchListParams,
  type DiffRequest,
  type DiffResult,
} from "./diff-contract";

// Conservative single-message budget, including JSON escaping, for RTC and WS.
export const DIFF_PAYLOAD_BYTES = 48_000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createDiffHandlers(
  config: Pick<WorkerConfig, "project" | "worker">,
) {
  async function git(
    cwd: string,
    args: string[],
    env?: Record<string, string>,
  ) {
    try {
      return (
        await execa("git", ["-C", cwd, ...args], {
          env: { GIT_OPTIONAL_LOCKS: "0", GIT_LITERAL_PATHSPECS: "1", ...env },
          maxBuffer: 8_000_000,
          stripFinalNewline: false,
        })
      ).stdout;
    } catch {
      // Never propagate execa errors: they can contain patch stdout.
      throw new Error("diff-git-command-failed-or-output-limit-exceeded");
    }
  }
  async function authorize(params: BranchListParams) {
    const project = Object.hasOwn(config.project, params.project)
      ? config.project[params.project]
      : undefined;
    if (!project) throw new Error("diff-project-not-configured");
    const cwd = await fs.realpath(params.worktreePath);
    const listed = (
      await git(project.root, ["worktree", "list", "--porcelain", "-z"])
    )
      .split("\0")
      .filter((part) => part.startsWith("worktree "))
      .map((part) => part.slice(9));
    const allowed = await Promise.all(
      listed.map((entry) => fs.realpath(entry).catch(() => "")),
    );
    if (!allowed.includes(cwd)) throw new Error("diff-worktree-not-authorized");
    return cwd;
  }
  async function branches(cwd: string) {
    const names = (
      await git(cwd, [
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads/",
        "refs/remotes/",
      ])
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((ref) => !ref.endsWith("/HEAD"))
      .map((ref) => (ref.startsWith("refs/heads/") ? ref.slice(11) : ref));
    if (names.length > 10000)
      throw new Error("diff-branch-count-limit-exceeded");
    return names;
  }
  return {
    async listDiffBranches(params: BranchListParams) {
      if (!Value.Check(BranchListParamsSchema, params))
        throw new Error("invalid-list-diff-branches-parameters");
      const result = { branches: await branches(await authorize(params)) };
      if (Buffer.byteLength(JSON.stringify(result)) > DIFF_PAYLOAD_BYTES)
        throw new Error("diff-branch-payload-limit-exceeded");
      return result;
    },
    async getDiff(params: DiffRequest): Promise<DiffResult> {
      if (!Value.Check(DiffRequestSchema, params))
        throw new Error("invalid-get-diff-parameters");
      const cwd = await authorize(params);
      const workerId = config.worker.id;
      if (!workerId) throw new Error("diff-worker-identity-not-configured");
      const common = await fs.realpath(
        path.resolve(
          cwd,
          (await git(cwd, ["rev-parse", "--git-common-dir"])).trim(),
        ),
      );
      // Persist per-repository identity in the shared Git directory, so linked
      // worktrees agree and replacing a repository at the same path is distinct.
      const identityPath = path.join(common, "forkhammer-repository-id");
      try {
        await fs.writeFile(identityPath, randomUUID(), {
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const identity = (await fs.readFile(identityPath, "utf8")).trim();
      if (!/^[a-f0-9-]{36}$/.test(identity))
        throw new Error("invalid-repository-identity");
      const repositoryId = hash(`${workerId}\0${identity}`);
      let baseSha: string;
      let headSha: string;
      let tree: string;
      if (params.mode === "branches") {
        const names = await branches(cwd);
        const resolve = async (ref: string | undefined) => {
          if (!ref || ref.startsWith("-") || !names.includes(ref))
            throw new Error("invalid-diff-branch-reference");
          const full = ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
          return (
            await git(cwd, [
              "rev-parse",
              "--verify",
              "--end-of-options",
              `${full}^{commit}`,
            ])
          ).trim();
        };
        const base = await resolve(params.base);
        headSha = await resolve(params.review);
        try {
          baseSha = (await git(cwd, ["merge-base", base, headSha])).trim();
        } catch {
          throw new Error("diff-branches-have-no-common-ancestor");
        }
        tree = headSha;
      } else {
        try {
          baseSha = (
            await git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"])
          ).trim();
        } catch {
          throw new Error("diff-repository-has-no-HEAD");
        }
        headSha = baseSha;
        // An isolated index produces one final-tree comparison without changing
        // the user's index. Git stores symlinks themselves, never their targets.
        const temp = await fs.mkdtemp(
          path.join(os.tmpdir(), "forkhammer-diff-"),
        );
        try {
          const env = { GIT_INDEX_FILE: path.join(temp, "index") };
          await git(cwd, ["read-tree", baseSha], env);
          await git(cwd, ["add", "-A", "--", "."], env);
          tree = (await git(cwd, ["write-tree"], env)).trim();
        } finally {
          await fs.rm(temp, { recursive: true, force: true });
        }
      }
      const raw = (
        await git(cwd, [
          "diff",
          "--raw",
          "-z",
          "--no-abbrev",
          "--no-ext-diff",
          "--find-renames",
          baseSha,
          tree,
          "--",
        ])
      ).split("\0");
      const entryCount = raw.filter((part) =>
        /^:[0-7]{6} [0-7]{6} [a-f0-9]+ [a-f0-9]+ [A-Z][0-9]*$/.test(part),
      ).length;
      if (entryCount > 2000)
        throw new Error("diff-file-count-limit-exceeded:2000");
      const files: DiffResult["files"] = [];
      for (let i = 0; i < raw.length && raw[i]; ) {
        if (files.length >= 2000)
          throw new Error("diff-file-count-limit-exceeded:2000");
        const header = raw[i]!;
        const name = raw[i + 1]!;
        const status = header.split(" ").at(-1)!;
        const renamed = status.startsWith("R");
        const newName = renamed ? raw[i + 2]! : name;
        i += renamed ? 3 : 2;
        const paths = renamed ? [name, newName] : [name];
        const file: DiffResult["files"][number] = {
          oldPath: status === "A" ? "" : name,
          newPath: status === "D" ? "" : newName,
          binary: false,
          patch: "",
        };
        if (header.includes("160000")) {
          file.notice = "Submodule changes are not supported.";
        } else {
          const numstat = await git(cwd, [
            "diff",
            "--numstat",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
            baseSha,
            tree,
            "--",
            ...paths,
          ]);
          file.binary = numstat.startsWith("-\t-\t");
          if (!file.binary) {
            try {
              const patch = await git(cwd, [
                "diff",
                "--patch",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--unified=3",
                "--src-prefix=a/",
                "--dst-prefix=b/",
                "--find-renames",
                baseSha,
                tree,
                "--",
                ...paths,
              ]);
              if (patch.length > 2_000_000)
                file.notice = "Patch exceeds 2,000,000 characters.";
              else file.patch = patch;
            } catch {
              file.notice = "Patch exceeds output limits or is unsupported.";
            }
          }
        }
        files.push(file);
      }
      const result: DiffResult = {
        workerId,
        repositoryId,
        fingerprint: "0".repeat(64),
        baseSha,
        headSha,
        files,
      };
      // Keep every file's metadata, replacing patches explicitly when needed.
      if (Buffer.byteLength(JSON.stringify(result)) > DIFF_PAYLOAD_BYTES) {
        for (const file of [...files].sort(
          (a, b) => b.patch.length - a.patch.length,
        )) {
          if (!file.patch) continue;
          file.patch = "";
          file.notice = "Patch omitted: transport payload limit.";
          if (Buffer.byteLength(JSON.stringify(result)) <= DIFF_PAYLOAD_BYTES)
            break;
        }
      }
      if (Buffer.byteLength(JSON.stringify(result)) > DIFF_PAYLOAD_BYTES)
        throw new Error("diff-metadata-payload-limit-exceeded");
      result.fingerprint = hash(JSON.stringify({ tree, result }));
      return result;
    },
  };
}
