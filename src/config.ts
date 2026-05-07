import toml from "smol-toml";
import z from "zod";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const zProjectConfig = z.object({
  root: z.string(),
  key: z.string().optional(),
});

const zConfig = z.object({
  jira: z
    .object({
      auth: z.string(),
      url: z.string(),
    })
    .optional(),
  project: z.record(z.string(), zProjectConfig).optional(),
});

export type Config = z.infer<typeof zConfig>;

export async function loadConfig() {
  const filePath = configPath();
  const buffer = await fs.readFile(filePath);
  return zConfig.parse(toml.parse(buffer.toString("utf-8")));
}

function configDirectory() {
  return path.resolve(os.homedir(), ".config/forkhammer");
}

function configPath() {
  return path.resolve(configDirectory(), "config.toml");
}
