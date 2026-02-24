import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ALL_DDL } from './schema';
import type { Block } from '../models/Block';
import type { Serie } from '../models/Serie';
import type { Card } from '../models/Card';
import type { SealedProduct } from '../models/SealedProduct';
import type { PriceSnapshot, PriceHistoryRow, SnapshotItemType } from '../models/PriceSnapshot';

const DB_PATH = path.join(__dirname, '../../data/pokemon-tcg.db');

let _db: BetterSqlite3.Database | null = null;

/** Returns the singleton database instance, creating it if necessary. */
export function getDb(): BetterSqlite3.Database {
  if (!_db) {
    /* Ensure data/ directory exists */
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    _db = new BetterSqlite3(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

/** Creates all tables and indexes. Safe to call multiple times (IF NOT EXISTS). */
export function initDatabase(): void {
  const db = getDb();
  for (const ddl of ALL_DDL) {
    db.exec(ddl);
  }
}

/* ─────────────────────────────────────────────
   Blocks
───────────────────────────────────────────── */

const now = () => new Date().toISOString();

/** Inserts or replaces a block record. */
export function upsertBlock(block: Block): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO blocks (id, name, type, created_at)
     VALUES (?, ?, ?, COALESCE((SELECT created_at FROM blocks WHERE id = ?), ?))`
  ).run(block.id, block.name, block.type, block.id, now());
}

/** Returns all blocks ordered by id. */
export function listBlocks(): Block[] {
  const rows = getDb().prepare(
    `SELECT id, name, type, created_at as createdAt FROM blocks ORDER BY id`
  ).all() as Block[];
  return rows;
}

/** Returns a single block by id, or undefined. */
export function getBlock(id: string): Block | undefined {
  return getDb().prepare(
    `SELECT id, name, type, created_at as createdAt FROM blocks WHERE id = ?`
  ).get(id) as Block | undefined;
}

/* ─────────────────────────────────────────────
   Series
───────────────────────────────────────────── */

/** Inserts or replaces a serie record. */
export function upsertSerie(serie: Serie): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO series
       (id, name, block_id, card_count_total, card_count_official,
        logo, symbol, release_date, raw_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    serie.id,
    serie.name,
    serie.blockId,
    serie.cardCountTotal ?? null,
    serie.cardCountOfficial ?? null,
    serie.logo ?? null,
    serie.symbol ?? null,
    serie.releaseDate ?? null,
    serie.rawData ? JSON.stringify(serie.rawData) : null,
    now(),
  );
}

/** Returns all series, optionally filtered by blockId. */
export function listSeries(blockId?: string): Serie[] {
  const rows = blockId
    ? getDb().prepare(
        `SELECT id, name, block_id as blockId, card_count_total as cardCountTotal,
                card_count_official as cardCountOfficial, logo, symbol,
                release_date as releaseDate, raw_data as rawData, updated_at as updatedAt
         FROM series WHERE block_id = ? ORDER BY id`
      ).all(blockId)
    : getDb().prepare(
        `SELECT id, name, block_id as blockId, card_count_total as cardCountTotal,
                card_count_official as cardCountOfficial, logo, symbol,
                release_date as releaseDate, raw_data as rawData, updated_at as updatedAt
         FROM series ORDER BY id`
      ).all();

  return (rows as Array<Serie & { rawData: string | null }>).map(r => ({
    ...r,
    rawData: r.rawData ? JSON.parse(r.rawData as unknown as string) : null,
  }));
}

/** Returns a single serie by id. */
export function getSerie(id: string): Serie | undefined {
  const row = getDb().prepare(
    `SELECT id, name, block_id as blockId, card_count_total as cardCountTotal,
            card_count_official as cardCountOfficial, logo, symbol,
            release_date as releaseDate, raw_data as rawData, updated_at as updatedAt
     FROM series WHERE id = ?`
  ).get(id) as (Serie & { rawData: string | null }) | undefined;

  if (!row) return undefined;
  return { ...row, rawData: row.rawData ? JSON.parse(row.rawData as unknown as string) : null };
}

/* ─────────────────────────────────────────────
   Cards
───────────────────────────────────────────── */

/** Inserts or replaces a card record. */
export function upsertCard(card: Card): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO cards
       (id, local_id, name, image, rarity, set_id,
        pricing_cardmarket, pricing_tcgplayer, raw_data,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT created_at FROM cards WHERE id = ?), ?), ?)`
  ).run(
    card.id,
    card.localId,
    card.name,
    card.image ?? null,
    card.rarity ?? null,
    card.setId,
    card.pricingCardmarket ? JSON.stringify(card.pricingCardmarket) : null,
    card.pricingTcgplayer ? JSON.stringify(card.pricingTcgplayer) : null,
    card.rawData ? JSON.stringify(card.rawData) : null,
    card.id, now(),
    now(),
  );
}

/** Returns cards for a given set, or all cards if no setId given. */
export function listCards(setId?: string): Card[] {
  const rows = setId
    ? getDb().prepare(
        `SELECT id, local_id as localId, name, image, rarity, set_id as setId,
                pricing_cardmarket as pricingCardmarket,
                pricing_tcgplayer as pricingTcgplayer,
                raw_data as rawData, created_at as createdAt, updated_at as updatedAt
         FROM cards WHERE set_id = ? ORDER BY local_id`
      ).all(setId)
    : getDb().prepare(
        `SELECT id, local_id as localId, name, image, rarity, set_id as setId,
                pricing_cardmarket as pricingCardmarket,
                pricing_tcgplayer as pricingTcgplayer,
                raw_data as rawData, created_at as createdAt, updated_at as updatedAt
         FROM cards ORDER BY set_id, local_id`
      ).all();

  return (rows as Array<Card & { pricingCardmarket: string | null; pricingTcgplayer: string | null; rawData: string | null }>)
    .map(r => ({
      ...r,
      pricingCardmarket: r.pricingCardmarket ? JSON.parse(r.pricingCardmarket) : null,
      pricingTcgplayer: r.pricingTcgplayer ? JSON.parse(r.pricingTcgplayer) : null,
      rawData: r.rawData ? JSON.parse(r.rawData) : null,
    }));
}

/** Returns total card count, optionally for a specific set. */
export function countCards(setId?: string): number {
  const row = setId
    ? getDb().prepare(`SELECT COUNT(*) as n FROM cards WHERE set_id = ?`).get(setId) as { n: number }
    : getDb().prepare(`SELECT COUNT(*) as n FROM cards`).get() as { n: number };
  return row.n;
}

/** Returns true if a card with the given id already exists in the DB. */
export function cardExists(id: string): boolean {
  const row = getDb().prepare(`SELECT 1 FROM cards WHERE id = ?`).get(id);
  return !!row;
}

/* ─────────────────────────────────────────────
   Sealed products
───────────────────────────────────────────── */

/** Inserts or replaces a sealed product record. */
export function upsertSealedProduct(product: SealedProduct): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO sealed_products
       (id, name, product_type, episode_id, serie_name, image,
        prices_cardmarket, prices_tcgplayer, raw_data,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT created_at FROM sealed_products WHERE id = ?), ?), ?)`
  ).run(
    product.id,
    product.name,
    product.productType ?? null,
    product.episodeId,
    product.serieName,
    product.image ?? null,
    product.pricesCardmarket ? JSON.stringify(product.pricesCardmarket) : null,
    product.pricesTcgplayer ? JSON.stringify(product.pricesTcgplayer) : null,
    product.rawData ? JSON.stringify(product.rawData) : null,
    product.id, now(),
    now(),
  );
}

/** Returns sealed products, optionally filtered by episodeId. */
export function listSealedProducts(episodeId?: string): SealedProduct[] {
  const rows = episodeId
    ? getDb().prepare(
        `SELECT id, name, product_type as productType, episode_id as episodeId,
                serie_name as serieName, image, prices_cardmarket as pricesCardmarket,
                prices_tcgplayer as pricesTcgplayer, raw_data as rawData,
                created_at as createdAt, updated_at as updatedAt
         FROM sealed_products WHERE episode_id = ? ORDER BY id`
      ).all(episodeId)
    : getDb().prepare(
        `SELECT id, name, product_type as productType, episode_id as episodeId,
                serie_name as serieName, image, prices_cardmarket as pricesCardmarket,
                prices_tcgplayer as pricesTcgplayer, raw_data as rawData,
                created_at as createdAt, updated_at as updatedAt
         FROM sealed_products ORDER BY id`
      ).all();

  return (rows as Array<SealedProduct & { pricesCardmarket: string | null; pricesTcgplayer: string | null; rawData: string | null }>)
    .map(r => ({
      ...r,
      pricesCardmarket: r.pricesCardmarket ? JSON.parse(r.pricesCardmarket) : null,
      pricesTcgplayer: r.pricesTcgplayer ? JSON.parse(r.pricesTcgplayer) : null,
      rawData: r.rawData ? JSON.parse(r.rawData) : null,
    }));
}

/** Returns total sealed product count. */
export function countSealedProducts(): number {
  const row = getDb().prepare(`SELECT COUNT(*) as n FROM sealed_products`).get() as { n: number };
  return row.n;
}

/** Returns true if a sealed product with the given id already exists. */
export function sealedProductExists(id: number): boolean {
  const row = getDb().prepare(`SELECT 1 FROM sealed_products WHERE id = ?`).get(id);
  return !!row;
}

/* ─────────────────────────────────────────────
   Stats helpers
───────────────────────────────────────────── */

export interface DbStats {
  blockCount: number;
  serieCount: number;
  cardCount: number;
  sealedCount: number;
  cardsByBlock: Array<{ blockId: string; blockName: string; serieCount: number; cardCount: number }>;
}

/** Returns aggregate statistics from the database. */
export function getStats(): DbStats {
  const db = getDb();

  const blockCount = (db.prepare(`SELECT COUNT(*) as n FROM blocks`).get() as { n: number }).n;
  const serieCount = (db.prepare(`SELECT COUNT(*) as n FROM series`).get() as { n: number }).n;
  const cardCount = (db.prepare(`SELECT COUNT(*) as n FROM cards`).get() as { n: number }).n;
  const sealedCount = (db.prepare(`SELECT COUNT(*) as n FROM sealed_products`).get() as { n: number }).n;

  const cardsByBlock = db.prepare(
    `SELECT b.id as blockId, b.name as blockName,
            COUNT(DISTINCT s.id) as serieCount,
            COUNT(c.id) as cardCount
     FROM blocks b
     LEFT JOIN series s ON s.block_id = b.id
     LEFT JOIN cards c ON c.set_id = s.id
     GROUP BY b.id
     ORDER BY b.id`
  ).all() as Array<{ blockId: string; blockName: string; serieCount: number; cardCount: number }>;

  return { blockCount, serieCount, cardCount, sealedCount, cardsByBlock };
}

/* ─────────────────────────────────────────────
   Price snapshots
───────────────────────────────────────────── */

/**
 * Inserts or replaces a price snapshot.
 * UNIQUE constraint on (item_type, item_id, snapshot_at) ensures
 * only one snapshot per item per day — a second call on the same day
 * overwrites the previous values.
 */
export function upsertPriceSnapshot(snap: PriceSnapshot): void {
  getDb().prepare(
    `INSERT OR REPLACE INTO price_snapshots
       (item_type, item_id, snapshot_at,
        avg, low, trend, avg1, avg7, avg30, avg_holo, trend_holo,
        lowest_fr, lowest,
        raw_prices)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    snap.itemType,
    snap.itemId,
    snap.snapshotAt,
    snap.avg          ?? null,
    snap.low          ?? null,
    snap.trend        ?? null,
    snap.avg1         ?? null,
    snap.avg7         ?? null,
    snap.avg30        ?? null,
    snap.avgHolo      ?? null,
    snap.trendHolo    ?? null,
    snap.lowestFr     ?? null,
    snap.lowest       ?? null,
    snap.rawPrices ? JSON.stringify(snap.rawPrices) : null,
  );
}

/** Returns the full price history for a given item, ordered by date ascending. */
export function getPriceHistory(itemType: SnapshotItemType, itemId: string): PriceHistoryRow[] {
  const nameCol = itemType === 'card'
    ? `(SELECT name FROM cards WHERE id = ps.item_id)`
    : `(SELECT name FROM sealed_products WHERE id = CAST(ps.item_id AS INTEGER))`;

  const rows = getDb().prepare(
    `SELECT ps.id, ps.item_type as itemType, ps.item_id as itemId,
            ps.snapshot_at as snapshotAt,
            ps.avg, ps.low, ps.trend, ps.avg1, ps.avg7, ps.avg30,
            ps.avg_holo as avgHolo, ps.trend_holo as trendHolo,
            ps.lowest_fr as lowestFr, ps.lowest,
            ps.raw_prices as rawPrices,
            ${nameCol} as itemName
     FROM price_snapshots ps
     WHERE ps.item_type = ? AND ps.item_id = ?
     ORDER BY ps.snapshot_at ASC`
  ).all(itemType, itemId) as Array<PriceHistoryRow & { rawPrices: string | null }>;

  return rows.map(r => ({
    ...r,
    rawPrices: r.rawPrices ? JSON.parse(r.rawPrices) : null,
  }));
}

/** Returns all distinct snapshot dates for a given item. */
export function getSnapshotDates(itemType: SnapshotItemType, itemId: string): string[] {
  const rows = getDb().prepare(
    `SELECT snapshot_at FROM price_snapshots
     WHERE item_type = ? AND item_id = ?
     ORDER BY snapshot_at ASC`
  ).all(itemType, itemId) as Array<{ snapshot_at: string }>;
  return rows.map(r => r.snapshot_at);
}

/** Returns the total number of snapshots in the database. */
export function countSnapshots(): number {
  const row = getDb().prepare(`SELECT COUNT(*) as n FROM price_snapshots`).get() as { n: number };
  return row.n;
}

/** Returns the number of distinct items that have at least one snapshot. */
export function countSnapshotItems(): number {
  const row = getDb().prepare(
    `SELECT COUNT(DISTINCT item_type || '|' || item_id) as n FROM price_snapshots`
  ).get() as { n: number };
  return row.n;
}

/** Returns the most recent snapshot date available. */
export function getLatestSnapshotDate(): string | null {
  const row = getDb().prepare(
    `SELECT MAX(snapshot_at) as d FROM price_snapshots`
  ).get() as { d: string | null };
  return row.d;
}
