import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface IDatabase {
  query<T extends pg.QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
}

class PGliteAdapter implements IDatabase {
  private pglite: PGlite;

  constructor(dataDir?: string) {
    if (dataDir) {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      } else {
        const pidPath = path.join(dataDir, 'postmaster.pid');
        if (fs.existsSync(pidPath)) {
          try {
            fs.unlinkSync(pidPath);
            console.log('[DB] Removed stale postmaster.pid from previous shutdown.');
          } catch {}
        }
      }
      this.pglite = new PGlite(dataDir);
    } else {
      this.pglite = new PGlite();
    }
  }

  async query<T extends pg.QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pglite.query<T>(sql, params || []);
    return {
      rows: res.rows || [],
      rowCount: res.rows?.length ?? 0
    };
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

class PgPoolAdapter implements IDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<T extends pg.QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pool.query<T>(sql, params || []);
    return {
      rows: res.rows,
      rowCount: res.rowCount ?? 0
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let dbInstance: IDatabase | null = null;

export function getDb(): IDatabase {
  if (!dbInstance) {
    if (process.env.DATABASE_URL) {
      console.log('[DB] Connecting to PostgreSQL via DATABASE_URL');
      dbInstance = new PgPoolAdapter(process.env.DATABASE_URL);
    } else {
      const defaultDataDir = path.resolve(__dirname, '..', '..', 'data', 'pglite_db');
      const dataDir = process.env.DATA_DIR || defaultDataDir;
      console.log(`[DB] Initializing PGlite embedded PostgreSQL at ${dataDir}`);
      dbInstance = new PGliteAdapter(dataDir);
    }
  }
  return dbInstance;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  const possiblePaths = [
    path.join(__dirname, 'schema.sql'),
    path.resolve(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'src', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'server', 'src', 'db', 'schema.sql')
  ];

  let schemaPath = possiblePaths.find(p => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error('Could not find schema.sql in any standard location: ' + possiblePaths.join(', '));
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split into statements for robust execution across PGlite / PG
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.query(stmt);
    } catch (err: any) {
      console.error('[DB] Schema init error on statement:', stmt.substring(0, 50), err.message);
      throw err;
    }
  }
  console.log('[DB] Schema initialized successfully.');
}
