import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "src/worker/config";
import { ultrafeedEventSchemas } from "./events";

export abstract class UltrafeedWriter {
  abstract write(item: UltrafeedWriterItem): Promise<void>;

  static createForWorker = createForWorker;
  static create = createUltrafeedWriter;
}

function createForWorker(opts: {
  config: WorkerConfig;
  supabase: SupabaseClient;
}): UltrafeedWriter {
  const tableName = opts.config.supabase.table;
  if (!tableName) {
    throw new Error("supabase-table-not-configured");
  }

  return createUltrafeedWriter({
    supabase: opts.supabase,
    config: { tableName },
  });
}

function createUltrafeedWriter(opts: {
  config: { tableName: string };
  supabase: SupabaseClient;
}): UltrafeedWriter {
  const supabase = opts.supabase;

  return {
    async write(item) {
      const schema =
        ultrafeedEventSchemas[
          item.eventType as keyof typeof ultrafeedEventSchemas
        ];

      if (!schema) {
        throw new Error(
          `supabase-insert-failed:${item.eventType}:unknown-event-type`,
        );
      }

      const parsed = schema.parse(item.data);

      await supabase.from(opts.config.tableName).insert([
        {
          event_type: item.eventType,
          data: parsed,
        },
      ]);
    },
  };
}

export interface UltrafeedWriterItem {
  eventType: string;
  data: unknown;
}
