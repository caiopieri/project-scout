import { Pool, PoolConfig } from 'pg';
import { SqlExecutor, SqlQueryResult } from './SqlExecutor';

export class NodePgSqlExecutor implements SqlExecutor {
  private pool: Pool;

  constructor(connectionStringOrConfig?: string | PoolConfig) {
    if (typeof connectionStringOrConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionStringOrConfig });
    } else if (connectionStringOrConfig) {
      this.pool = new Pool(connectionStringOrConfig);
    } else {
      const defaultUrl =
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
      this.pool = new Pool({ connectionString: defaultUrl });
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
