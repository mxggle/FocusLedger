export type QueryResult = {
  rowsAffected: number;
  lastInsertId?: number;
};

export type SqlDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
};
