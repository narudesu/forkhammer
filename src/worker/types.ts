export type SupabaseConfig = {
  url: string;
  anonKey: string;
  table: string;
  auth:
    | {
        type: "password";
        email: string;
        password: string;
      }
    | {
        type: "secret_string";
        secretString: string;
        functionUrl: string;
      };
};

export type FeedEvent = {
  id: string;
  created_at: string;
  event_type: string;
  data: unknown;
};

export type ProcessResult = {
  unauthorized: boolean;
};

export type RealtimeChannelLike = {
  unsubscribe: () => Promise<unknown>;
  subscribe: (callback: (status: string) => void) => unknown;
  on: (
    event: string,
    filter: { event: string; schema: string; table: string },
    callback: (payload: { new: FeedEvent }) => void,
  ) => RealtimeChannelLike;
};

export type SupabaseSelectQueryLike = {
  gte: (column: string, value: string) => SupabaseSelectQueryLike;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => Promise<{
    data: Array<FeedEvent> | null;
    error: { message: string } | null;
  }>;
};

export type SupabaseClientLike = {
  realtime: {
    setAuth: (token: string) => void;
  };
  channel: (name: string) => RealtimeChannelLike;
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectQueryLike;
    insert: (
      rows: Array<{ event_type: string; data: Record<string, unknown> }>,
    ) => Promise<{ error: { message: string } | null }>;
  };
};
