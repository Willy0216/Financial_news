import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface DatabaseStatement<T = any> {
  run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: any[]): T | undefined;
  all(...params: any[]): T[];
}

export interface IDatabase {
  exec(sql: string): void;
  prepare<T = any>(sql: string): DatabaseStatement<T>;
  transaction<F extends (...args: any[]) => any>(fn: F): F;
  close(): void;
}

let dbInstance: IDatabase | null = null;

function initializeNativeOrNodeSqlite(dbPath: string): IDatabase {
  // Ensure directory exists
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Attempt 1: Try better-sqlite3 if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    logger.info(`SQLite initialized using better-sqlite3 at: ${dbPath}`);
    return db;
  } catch {
    // Attempt 2: Fallback to Node.js 22+ built-in node:sqlite DatabaseSync
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      try {
        db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // Ignore pragma error if in memory
      }
      logger.info(`SQLite initialized using node:sqlite DatabaseSync at: ${dbPath}`);
      return {
        exec: (sql: string) => db.exec(sql),
        prepare: <T = any>(sql: string): DatabaseStatement<T> => {
          const stmt = db.prepare(sql);
          return {
            run: (...params: any[]) => stmt.run(...params),
            get: (...params: any[]) => stmt.get(...params) as T | undefined,
            all: (...params: any[]) => stmt.all(...params) as T[],
          };
        },
        transaction: <F extends (...args: any[]) => any>(fn: F): F => {
          return ((...args: any[]) => {
            db.exec('BEGIN TRANSACTION');
            try {
              const res = fn(...args);
              db.exec('COMMIT');
              return res;
            } catch (err) {
              db.exec('ROLLBACK');
              throw err;
            }
          }) as F;
        },
        close: () => db.close(),
      };
    } catch (nodeErr) {
      logger.error('Failed to initialize SQLite with both better-sqlite3 and node:sqlite', nodeErr);
      throw new Error(`Unable to load SQLite driver: ${nodeErr}`);
    }
  }
}

export function getDb(): IDatabase {
  if (!dbInstance) {
    dbInstance = initializeNativeOrNodeSqlite(config.databasePath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function initSchema(db: IDatabase): void {
  const schema = `
    CREATE TABLE IF NOT EXISTS tracked_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        isin TEXT,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL,          -- "ETF", "EQUITY", "INDEX", "COMMODITY"
        exchange TEXT,                     -- e.g. "MIL", "GER", "LSE", "NMS"
        currency TEXT DEFAULT 'EUR',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asset_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        price_change_pct REAL NOT NULL,
        prev_close REAL NOT NULL,
        last_close REAL NOT NULL,
        report_markdown TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_assets_symbol ON tracked_assets(symbol);
    CREATE INDEX IF NOT EXISTS idx_tracked_assets_isin ON tracked_assets(isin);
    CREATE INDEX IF NOT EXISTS idx_asset_reports_symbol_date ON asset_reports(symbol, created_at);
  `;

  db.exec(schema);
  logger.info('Database schema verified & initialized successfully.');
}
