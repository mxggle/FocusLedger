export type QueryResult = {
  rowsAffected: number;
  lastInsertId?: number;
};

export type SqlDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
};

/** A persisted assistant conversation thread. `title` is "" until derived from
 *  the first user message; callers render a placeholder when empty. */
export type AssistantSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
