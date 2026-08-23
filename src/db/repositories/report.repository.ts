import { getDb } from '../db.js';
import { AssetReport, AssetReportInput } from '../../types/index.js';

export class ReportRepository {
  public create(report: AssetReportInput): AssetReport {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO asset_reports (symbol, price_change_pct, prev_close, last_close, report_markdown, model_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      report.symbol.toUpperCase(),
      report.price_change_pct,
      report.prev_close,
      report.last_close,
      report.report_markdown,
      report.model_used || null
    );

    const insertedId = Number(result.lastInsertRowid);
    const created = this.findById(insertedId);
    if (!created) {
      throw new Error(`Failed to retrieve newly created report with ID ${insertedId}`);
    }
    return created;
  }

  public findById(id: number): AssetReport | undefined {
    const db = getDb();
    return db.prepare<AssetReport>('SELECT * FROM asset_reports WHERE id = ?').get(id);
  }

  public findLatestBySymbol(symbol: string): AssetReport | undefined {
    const db = getDb();
    return db
      .prepare<AssetReport>(
        'SELECT * FROM asset_reports WHERE UPPER(symbol) = UPPER(?) ORDER BY created_at DESC, id DESC LIMIT 1'
      )
      .get(symbol);
  }

  public findAllBySymbol(symbol: string, limit = 20): AssetReport[] {
    const db = getDb();
    return db
      .prepare<AssetReport>(
        'SELECT * FROM asset_reports WHERE UPPER(symbol) = UPPER(?) ORDER BY created_at DESC, id DESC LIMIT ?'
      )
      .all(symbol, limit);
  }

  /**
   * Check if a fresh report exists for the given symbol generated today (UTC calendar day or within last 16 hours)
   */
  public findRecentToday(symbol: string): AssetReport | undefined {
    const db = getDb();
    // Check if report created within the last 16 hours or on the current UTC date
    return db
      .prepare<AssetReport>(`
        SELECT * FROM asset_reports 
        WHERE UPPER(symbol) = UPPER(?) 
          AND (
            date(created_at) = date('now')
            OR datetime(created_at) >= datetime('now', '-16 hours')
          )
        ORDER BY created_at DESC, id DESC 
        LIMIT 1
      `)
      .get(symbol);
  }

  public deleteBySymbol(symbol: string): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM asset_reports WHERE UPPER(symbol) = UPPER(?)').run(symbol);
    return Number(result.changes);
  }
}

export const reportRepository = new ReportRepository();
