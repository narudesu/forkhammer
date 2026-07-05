import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "src/worker/config";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import { ultrafeedEventSchemas } from "./events";

export abstract class UltrafeedWriter {
  abstract write(item: UltrafeedWriterItem): Promise<void>;
  abstract read(opts: ReadOptions): Promise<UltrafeedEvent[]>;

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
  const readPageSize = 1000;

  return {
    async read({ since }) {
      const events: UltrafeedEvent[] = [];
      let cursor: { created_at: string; id: string } | null = null;

      while (true) {
        let query = supabase
          .from(opts.config.tableName)
          .select("id, created_at, event_type, data")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(readPageSize);

        if (cursor) {
          query = query.or(
            `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
          );
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`supabase-read-failed:${error.message}`);
        }

        const page = data ?? [];
        events.push(...page);

        if (page.length < readPageSize) {
          return events;
        }

        const last = page[page.length - 1];
        cursor = { created_at: last.created_at, id: last.id };
      }
    },
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
interface ReadOptions {
  since: string;
}
