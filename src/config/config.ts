import toml from "smol-toml";
import z from "zod";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const zProjectConfig = z.object({
  root: z.string(),
  key: z.string().optional(),
});

const zGitlabProjectConfig = z.object({
  id: z.string().min(1),
  branches: z.array(z.string().min(1)).min(1),
});

const zConfig = z.object({
  agent: z
    .object({
      default_provider_id: z.string().min(1).optional(),
      default_model_id: z.string().min(1).optional(),
    })
    .optional(),
  jira: z
    .object({
      auth: z.string(),
      url: z.string(),
      filters: z
        .object({
          inbox: z
            .object({
              filter_id: z.string().min(1).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  gitlab: z
    .object({
      url: z.url(),
      token: z.string().min(1),
      projects: z.object({
        frontend: zGitlabProjectConfig,
        backend: zGitlabProjectConfig,
      }),
    })
    .optional(),
  blockers: z
    .object({
      file: z.string().min(1),
    })
    .optional(),
  healthchecks: z
    .record(
      z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
      z.object({ name: z.string().min(1), url: z.url() }),
    )
    .optional(),
  project: z.record(z.string(), zProjectConfig).optional(),
  worker: z.object({
    snapshots: z.object({
      directory: z.string().min(1),
    }),
  }),
  supabase: z
    .object({
      url: z.url(),
      anon_key: z.string().min(1),
      table: z.string().min(1),
      auth: z.object({
        type: z.literal("secret_string"),
        secret_string: z.string().min(1),
        function_url: z.url(),
      }),
    })
    .optional(),
});

export type Config = z.infer<typeof zConfig>;

export function parseConfig(raw: string) {
  return zConfig.parse(toml.parse(raw));
}

export async function loadConfig() {
  const filePath = configPath();
  const buffer = await fs.readFile(filePath);
  return parseConfig(buffer.toString("utf-8"));
}

function configDirectory() {
  return path.resolve(os.homedir(), ".config/forkhammer");
}

function configPath() {
  return path.resolve(configDirectory(), "config.toml");
}
