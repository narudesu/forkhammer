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
  opencode: z
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
  project: z.record(z.string(), zProjectConfig).optional(),
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
