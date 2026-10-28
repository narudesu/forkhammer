import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { Value } from "@sinclair/typebox/value";
import type { WorkerConfig } from "../worker/config";
import { DiffResultSchema } from "./diff-contract";
import { createDiffHandlers, DIFF_PAYLOAD_BYTES } from "./diff-review";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diff-test-"));
  roots.push(root);
  const git = async (...args: string[]) =>
    (await execa("git", ["-C", root, ...args])).stdout;
  const write = (name: string, text: string | Buffer) =>
    fs.writeFile(path.join(root, name), text);
  await git("init", "-b", "main");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await write("file", "one\ntwo\nthree\n");
  await write("deleted", "gone\n");
  await write("rename", "rename me\n");
  await write(".gitignore", "ignored\n");
  await git("add", ".");
  await git("commit", "-m", "initial");
  const config = {
    worker: { id: "worker-one" },
    project: { demo: { root } },
  } as unknown as WorkerConfig;
  const api = createDiffHandlers(config);
  const request = {
    project: "demo",
    worktreePath: root,
    mode: "worktree" as const,
  };
  return { root, git, write, api, request, config };
}

test("final worktree, untracked, ignored, deletion, binary, rename and symlinks", async () => {
  const f = await fixture();
  await f.write("file", "staged\ntwo\nthree\n");
  await f.git("add", "file");
  await f.write("file", "final\ntwo\nthree\n");
  await f.write("untracked", "hello\n");
  await f.write("ignored", "secret");
  await f.write("binary", Buffer.from([0, 1, 2]));
  await fs.unlink(path.join(f.root, "deleted"));
  await f.git("mv", "rename", "renamed");
  await fs.symlink("/etc/passwd", path.join(f.root, "link"));
  const indexBefore = await f.git("diff", "--cached");
  const result = await f.api.getDiff(f.request);
  expect(Value.Check(DiffResultSchema, result)).toBe(true);
  expect(result.baseSha).toBe(result.headSha);
  expect(result.files.filter((x) => x.newPath === "file")).toHaveLength(1);
  expect(result.files.find((x) => x.newPath === "file")?.patch).toContain(
    "+final",
  );
  expect(result.files.find((x) => x.newPath === "file")?.patch).toContain(
    " two",
  );
  expect(result.files.find((x) => x.newPath === "ignored")).toBeUndefined();
  expect(result.files.find((x) => x.newPath === "binary")).toMatchObject({
    binary: true,
    patch: "",
  });
  expect(result.files.find((x) => x.oldPath === "deleted")?.newPath).toBe("");
  expect(result.files.find((x) => x.newPath === "untracked")?.oldPath).toBe("");
  expect(result.files.find((x) => x.newPath === "renamed")?.oldPath).toBe(
    "rename",
  );
  expect(result.files.find((x) => x.newPath === "link")?.patch).toContain(
    "+/etc/passwd",
  );
  expect(await f.git("diff", "--cached")).toBe(indexBefore);
  expect(
    (await createDiffHandlers(f.config).getDiff(f.request)).repositoryId,
  ).toBe(result.repositoryId);
  expect((await f.api.getDiff(f.request)).fingerprint).toBe(result.fingerprint);
  await f.write("file", "different\n");
  expect((await f.api.getDiff(f.request)).fingerprint).not.toBe(
    result.fingerprint,
  );
});

test("diverged branches compare ancestor, excluding dirty worktree", async () => {
  const f = await fixture();
  const ancestor = await f.git("rev-parse", "HEAD");
  await f.git("checkout", "-b", "review");
  await f.write("review-only", "review");
  await f.git("add", ".");
  await f.git("commit", "-m", "review");
  const tip = await f.git("rev-parse", "HEAD");
  await f.git("checkout", "main");
  await f.write("base-only", "base");
  await f.git("add", ".");
  await f.git("commit", "-m", "base");
  await f.write("dirty", "dirty");
  const result = await f.api.getDiff({
    ...f.request,
    mode: "branches",
    base: "main",
    review: "review",
  });
  expect(result.baseSha).toBe(ancestor);
  expect(result.headSha).toBe(tip);
  expect(result.files.map((x) => x.newPath)).toEqual(["review-only"]);
  await f.git("checkout", "--orphan", "unrelated");
  await f.git("rm", "-rf", ".");
  await f.write("other", "other");
  await f.git("add", ".");
  await f.git("commit", "-m", "unrelated");
  await expect(
    f.api.getDiff({
      ...f.request,
      mode: "branches",
      base: "main",
      review: "unrelated",
    }),
  ).rejects.toThrow("no-common-ancestor");
});

test("reject unsafe references, unauthorized worktrees and invalid params", async () => {
  const f = await fixture();
  const other = await fixture();
  for (const review of ["--help", "main~1", "missing", "main; touch pwned"]) {
    await expect(
      f.api.getDiff({ ...f.request, mode: "branches", base: "main", review }),
    ).rejects.toThrow("reference");
  }
  await expect(
    f.api.getDiff({ ...f.request, worktreePath: other.root }),
  ).rejects.toThrow("not-authorized");
  await expect(
    f.api.listDiffBranches({ project: "absent", worktreePath: f.root }),
  ).rejects.toThrow("not-configured");
  await expect(
    f.api.getDiff({ ...f.request, mode: "bad" } as never),
  ).rejects.toThrow("parameters");
  await f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  expect(
    (await f.api.listDiffBranches({ project: "demo", worktreePath: f.root }))
      .branches,
  ).toContain("refs/remotes/origin/main");
});

test("explicit oversized notices and total payload bounds", async () => {
  const f = await fixture();
  await f.write("large", "x".repeat(2_000_001));
  const result = await f.api.getDiff(f.request);
  expect(result.files.find((x) => x.newPath === "large")).toMatchObject({
    patch: "",
    notice: "Patch exceeds 2,000,000 characters.",
  });
  await f.write("large", "x".repeat(70_000));
  const bounded = await f.api.getDiff(f.request);
  expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(
    DIFF_PAYLOAD_BYTES,
  );
  expect(bounded.files.find((x) => x.newPath === "large")?.notice).toContain(
    "transport",
  );
  await Promise.all(
    Array.from({ length: 2001 }, (_, i) => f.write(`many-${i}`, "a")),
  );
  await expect(f.api.getDiff(f.request)).rejects.toThrow("file-count-limit");
});

test("unborn HEAD is rejected clearly", async () => {
  const f = await fixture();
  await f.git("checkout", "--orphan", "empty");
  await expect(f.api.getDiff(f.request)).rejects.toThrow("no-HEAD");
});
