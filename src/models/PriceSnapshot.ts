/** Identifies whether a snapshot belongs to a card or a sealed product. */
export type SnapshotItemType = 'card' | 'sealed';

/**
 * A price snapshot captures the pricing of one item at a specific date.
 * One snapshot per item per day (UNIQUE on item_type + item_id + snapshot_at).
 * Running the same snapshot twice on the same day overwrites the previous values.
 */
export interface PriceSnapshot {
  id?: number;
  itemType: SnapshotItemType;
  /** Card id (e.g. 'swsh1-1', 'sv01-001') or sealed product id (e.g. '31390'). */
  itemId: string;
  /** Date of the snapshot, format YYYY-MM-DD. */
  snapshotAt: string;

  /* ── Card fields (from TCGdex cardmarket, locale 'fr') ─────────────── */
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  avgHolo?: number | null;
  trendHolo?: number | null;

  /* ── Sealed product fields (from RapidAPI cardmarket) ─────────────── */
  /** Lowest price from French sellers. */
  lowestFr?: number | null;
  /** Global lowest price. */
  lowest?: number | null;

  /** Complete pricing object (cardmarket sub-object) for reference. */
  rawPrices?: Record<string, unknown> | null;
}

/** A row returned by the price history query — includes item name for display. */
export interface PriceHistoryRow extends PriceSnapshot {
  itemName: string;
}
