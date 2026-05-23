import type { SupabaseClientLike, SupabaseConfig } from "./types";
import { ultrafeedEventSchemas } from "./events";

export async function emitEvent(
  config: SupabaseConfig,
  supabase: SupabaseClientLike,
  eventType: string,
  data: unknown,
) {
  const schema =
    ultrafeedEventSchemas[eventType as keyof typeof ultrafeedEventSchemas];
  if (!schema) {
    throw new Error(`supabase-insert-failed:${eventType}:unknown-event-type`);
  }

  const parsed = schema.parse(data);

  const { error: insertError } = await supabase.from(config.table).insert([
    {
      event_type: eventType,
      data: parsed,
    },
  ]);

  if (insertError) {
    throw new Error(
      `supabase-insert-failed:${eventType}:${insertError.message}`,
    );
  }
}
