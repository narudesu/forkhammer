import type { WorkerContext } from "src/worker/context/types";

export interface CreateTestSupabaseClientOptions {
  rows?: Record<string, unknown[]>;
}

export interface TableInsert {
  table: string;
  rows: unknown[];
}

export interface TableDelete {
  table: string;
  filters: QueryFilter[];
}

export interface QueryFilter {
  type: "eq" | "in";
  column: string;
  value: unknown;
}

export abstract class TestSupabaseClient {
  abstract getSupabaseClient: () => WorkerContext["supabase"];
  abstract getInserts: () => TableInsert[];
  abstract getDeletes: () => TableDelete[];

  static createMocked = createMocked;
}

function createMocked(
  options: CreateTestSupabaseClientOptions = {},
): TestSupabaseClient {
  const inserts: TableInsert[] = [];
  const deletes: TableDelete[] = [];
  const rows = options.rows ?? {};

  const client = {
    from: (table: string) =>
      createTestSupabaseTable(table, {
        inserts,
        deletes,
        rows: rows[table] ?? [],
      }),
  } as unknown as WorkerContext["supabase"];

  return {
    getSupabaseClient: () => client,
    getInserts: () => inserts,
    getDeletes: () => deletes,
  };
}

function createTestSupabaseTable(
  table: string,
  state: {
    inserts: TableInsert[];
    deletes: TableDelete[];
    rows: unknown[];
  },
) {
  return {
    insert: async (rows: unknown[]) => {
      state.inserts.push({ table, rows });
      state.rows.push(...rows);
      return { data: rows, error: null };
    },
    select: () => createSelectQuery(state.rows),
    delete: () => createDeleteQuery(table, state.deletes),
  };
}

function createSelectQuery(rows: unknown[]) {
  const filters: QueryFilter[] = [];
  const query = {
    eq: (column: string, value: unknown) => {
      filters.push({ type: "eq", column, value });
      return query;
    },
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data: applyFilters(rows, filters), error: null }).then(
        resolve,
      ),
  };

  return query;
}

function createDeleteQuery(table: string, deletes: TableDelete[]) {
  const filters: QueryFilter[] = [];
  const query = {
    in: (column: string, value: unknown[]) => {
      filters.push({ type: "in", column, value });
      deletes.push({ table, filters: [...filters] });
      return Promise.resolve({ data: null, error: null });
    },
  };

  return query;
}

function applyFilters(rows: unknown[], filters: QueryFilter[]): unknown[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.type !== "eq") {
        return true;
      }

      return getColumnValue(row, filter.column) === filter.value;
    }),
  );
}

function getColumnValue(row: unknown, column: string): unknown {
  if (typeof row !== "object" || row === null) {
    return undefined;
  }

  if (column === "data->>artifactType") {
    const data = "data" in row ? row.data : undefined;
    if (typeof data === "object" && data !== null && "artifactType" in data) {
      return data.artifactType;
    }
    return undefined;
  }

  return column in row ? row[column as keyof typeof row] : undefined;
}
