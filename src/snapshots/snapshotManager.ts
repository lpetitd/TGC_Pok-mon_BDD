import chalk from 'chalk';
import ora from 'ora';
import {
  listCards,
  listSealedProducts,
  listSeries as dbListSeries,
  upsertPriceSnapshot,
  countSnapshots,
} from '../db/database';
import type { PriceSnapshot } from '../models/PriceSnapshot';

/** Returns today's date in YYYY-MM-DD format. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────
   Card snapshots
───────────────────────────────────────────── */

/**
 * Takes a price snapshot for all cards in a given set (or all cards in DB
 * if no setId given). Reads pricing from the stored `pricingCardmarket` field
 * — no API call is made.
 */
export function takeSnapshotsForSet(setId?: string): number {
  const cards = listCards(setId);
  const date = today();
  let snapped = 0;

  for (const card of cards) {
    const cm = card.pricingCardmarket;

    /* Skip cards with no cardmarket data at all */
    if (!cm) continue;

    const snap: PriceSnapshot = {
      itemType: 'card',
      itemId: card.id,
      snapshotAt: date,
      avg:       cm.avg       ?? null,
      low:       cm.low       ?? null,
      trend:     cm.trend     ?? null,
      avg1:      cm.avg1      ?? null,
      avg7:      cm.avg7      ?? null,
      avg30:     cm.avg30     ?? null,
      avgHolo:   cm['avg-holo']   ?? null,
      trendHolo: cm['trend-holo'] ?? null,
      rawPrices: cm as unknown as Record<string, unknown>,
    };

    upsertPriceSnapshot(snap);
    snapped++;
  }

  return snapped;
}

/* ─────────────────────────────────────────────
   Sealed product snapshots
───────────────────────────────────────────── */

/**
 * Takes a price snapshot for all sealed products of a given episode
 * (or all sealed products in DB if no episodeId given).
 * Reads pricing from the stored `pricesCardmarket` field — no API call.
 */
export function takeSnapshotsForEpisode(episodeId?: string): number {
  const products = listSealedProducts(episodeId);
  const date = today();
  let snapped = 0;

  for (const product of products) {
    const cm = product.pricesCardmarket;

    if (!cm) continue;

    const snap: PriceSnapshot = {
      itemType: 'sealed',
      itemId: String(product.id),
      snapshotAt: date,
      lowestFr: (cm.lowest_FR as number | null | undefined) ?? null,
      lowest:   (cm.lowest   as number | null | undefined) ?? null,
      rawPrices: cm as unknown as Record<string, unknown>,
    };

    upsertPriceSnapshot(snap);
    snapped++;
  }

  return snapped;
}

/* ─────────────────────────────────────────────
   Combined entry points (used by CLI)
───────────────────────────────────────────── */

export interface SnapshotOptions {
  /** Limit to a specific TCGdex set id (cards only). */
  setId?: string;
  /** Limit to a specific RapidAPI episode id (sealed only). */
  episodeId?: string;
  /** If true, take snapshots for all cards AND all sealed products. */
  all?: boolean;
}

/**
 * Takes price snapshots according to the provided options.
 * Returns total number of snapshots written.
 */
export function takeSnapshots(opts: SnapshotOptions = {}): number {
  let total = 0;

  /* Cards */
  if (opts.all || opts.setId !== undefined) {
    const label = opts.setId ? `cartes du set "${opts.setId}"` : 'toutes les cartes';
    const spinner = ora(`Snapshot ${label}…`).start();
    const n = takeSnapshotsForSet(opts.setId);
    spinner.succeed(`${n} snapshot(s) carte(s) écrits`);
    total += n;
  }

  /* Sealed */
  if (opts.all || opts.episodeId !== undefined) {
    const label = opts.episodeId ? `scellés épisode "${opts.episodeId}"` : 'tous les scellés';
    const spinner = ora(`Snapshot ${label}…`).start();
    const n = takeSnapshotsForEpisode(opts.episodeId);
    spinner.succeed(`${n} snapshot(s) scellé(s) écrits`);
    total += n;
  }

  if (total === 0 && !opts.all && opts.setId === undefined && opts.episodeId === undefined) {
    /* No target specified — default to all */
    return takeSnapshots({ all: true });
  }

  return total;
}

/* ─────────────────────────────────────────────
   Summary helper
───────────────────────────────────────────── */

export interface SnapshotStats {
  date: string;
  cardSnaps: number;
  sealedSnaps: number;
}

/** Returns a quick overview of how many snapshots exist for today. */
export function getSnapshotStats(): SnapshotStats {
  const date = today();
  const cards = listCards();
  const products = listSealedProducts();

  /* Count items that have a cardmarket price (those eligible for snapshot) */
  const cardSnaps = cards.filter(c => c.pricingCardmarket != null).length;
  const sealedSnaps = products.filter(p => p.pricesCardmarket != null).length;

  return { date, cardSnaps, sealedSnaps };
}
