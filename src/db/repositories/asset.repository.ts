import { getDb } from '../db.js';
import { TrackedAsset, TrackedAssetInput } from '../../types/index.js';

export class AssetRepository {
  public findAll(): TrackedAsset[] {
    const db = getDb();
    return db.prepare<TrackedAsset>('SELECT * FROM tracked_assets ORDER BY id ASC').all();
  }

  public findById(id: number): TrackedAsset | undefined {
    const db = getDb();
    return db.prepare<TrackedAsset>('SELECT * FROM tracked_assets WHERE id = ?').get(id);
  }

  public findBySymbol(symbol: string): TrackedAsset | undefined {
    const db = getDb();
    return db.prepare<TrackedAsset>('SELECT * FROM tracked_assets WHERE UPPER(symbol) = UPPER(?)').get(symbol);
  }

  public findByIsin(isin: string): TrackedAsset | undefined {
    const db = getDb();
    return db.prepare<TrackedAsset>('SELECT * FROM tracked_assets WHERE UPPER(isin) = UPPER(?)').get(isin);
  }

  public create(asset: TrackedAssetInput): TrackedAsset {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO tracked_assets (symbol, isin, name, asset_type, exchange, currency)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      asset.symbol.toUpperCase(),
      asset.isin ? asset.isin.toUpperCase() : null,
      asset.name,
      asset.asset_type,
      asset.exchange || null,
      asset.currency || 'EUR'
    );

    const insertedId = Number(result.lastInsertRowid);
    const created = this.findById(insertedId);
    if (!created) {
      throw new Error(`Failed to retrieve newly created asset with ID ${insertedId}`);
    }
    return created;
  }

  public delete(identifier: string | number): boolean {
    const db = getDb();
    if (typeof identifier === 'number' || !isNaN(Number(identifier))) {
      const result = db.prepare('DELETE FROM tracked_assets WHERE id = ?').run(Number(identifier));
      return Number(result.changes) > 0;
    } else {
      const result = db.prepare('DELETE FROM tracked_assets WHERE UPPER(symbol) = UPPER(?)').run(identifier);
      return Number(result.changes) > 0;
    }
  }

  public count(): number {
    const db = getDb();
    const row = db.prepare<{ total: number }>('SELECT COUNT(*) as total FROM tracked_assets').get();
    return row?.total || 0;
  }
}

export const assetRepository = new AssetRepository();
