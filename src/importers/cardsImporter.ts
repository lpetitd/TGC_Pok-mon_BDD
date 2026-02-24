import chalk from 'chalk';
import ora from 'ora';
import { listSeries, getSerie, getSet, getCard } from '../apis/tcgdex';
import {
  initDatabase,
  upsertBlock,
  upsertSerie,
  upsertCard,
  cardExists,
  listBlocks,
  listSeries as dbListSeries,
} from '../db/database';
import type { Block } from '../models/Block';
import type { Serie } from '../models/Serie';
import type { Card, CardPricingCardmarket, CardPricingTcgplayer } from '../models/Card';

/*
 * Strips SDK internal properties (_TCGdex, Endpoint instances) and circular
 * references from a TCGdex SDK object before JSON serialization.
 */
function toPlainData(obj: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(obj, (_key, value: unknown) => {
    if (typeof value === 'function') return undefined;
    if (value !== null && typeof value === 'object') {
      const name = (value as { constructor?: { name?: string } }).constructor?.name ?? '';
      if (name === '_TCGdex' || name === 'Endpoint' || name === 'TCGdex') return undefined;
      if (seen.has(value as object)) return undefined;
      seen.add(value as object);
    }
    return value;
  });
  return JSON.parse(serialized) as Record<string, unknown>;
}

export interface CardsImportOptions {
  /** If true, reimport records that already exist in the DB. */
  full?: boolean;
  /** If true, log what would be imported without writing to the DB. */
  dryRun?: boolean;
  /** If provided, only import cards for this specific set id. */
  setId?: string;
}

interface ImportSummary {
  blocksImported: number;
  seriesImported: number;
  cardsImported: number;
  cardsSkipped: number;
  errors: number;
}

/* ─────────────────────────────────────────────
   Internal helpers
───────────────────────────────────────────── */

/** Extracts the CardPricingCardmarket from a raw TCGdex card object. */
function extractCardmarketPricing(rawCard: Record<string, unknown>): CardPricingCardmarket | null {
  const pricing = rawCard.pricing as Record<string, unknown> | undefined;
  if (!pricing) return null;
  const cm = pricing.cardmarket as Record<string, unknown> | undefined;
  if (!cm || cm.unit !== 'EUR') return null;

  return {
    unit: 'EUR',
    idProduct: (cm.idProduct as number | undefined) ?? null,
    avg: (cm.avg as number | null) ?? null,
    low: (cm.low as number | null) ?? null,
    trend: (cm.trend as number | null) ?? null,
    avg1: (cm.avg1 as number | null) ?? null,
    avg7: (cm.avg7 as number | null) ?? null,
    avg30: (cm.avg30 as number | null) ?? null,
    'avg-holo': (cm['avg-holo'] as number | null) ?? null,
    'low-holo': (cm['low-holo'] as number | null) ?? null,
    'trend-holo': (cm['trend-holo'] as number | null) ?? null,
    'avg1-holo': (cm['avg1-holo'] as number | null) ?? null,
    'avg7-holo': (cm['avg7-holo'] as number | null) ?? null,
    'avg30-holo': (cm['avg30-holo'] as number | null) ?? null,
    updated: (cm.updated as string) ?? '',
  };
}

/** Extracts TCGPlayer pricing from a raw TCGdex card object. */
function extractTcgplayerPricing(rawCard: Record<string, unknown>): CardPricingTcgplayer | null {
  const pricing = rawCard.pricing as Record<string, unknown> | undefined;
  if (!pricing) return null;
  return (pricing.tcgplayer as CardPricingTcgplayer | undefined) ?? null;
}

/* ─────────────────────────────────────────────
   Import a single set
───────────────────────────────────────────── */

async function importSet(
  setId: string,
  opts: CardsImportOptions,
  summary: ImportSummary
): Promise<void> {
  const set = await getSet(setId);
  if (!set) {
    console.log(chalk.yellow(`  ⚠ Set "${setId}" not found via TCGdex`));
    summary.errors++;
    return;
  }

  /* Extract the parent bloc (serie in TCGdex terms) */
  const blockId = (set.serie as unknown as Record<string, unknown> | null)?.id as string ?? 'unknown';
  const blockName = (set.serie as unknown as Record<string, unknown> | null)?.name as string ?? blockId;

  /* Ensure the parent bloc exists — required for the FOREIGN KEY constraint */
  if (!opts.dryRun) {
    upsertBlock({ id: blockId, name: blockName, type: 'card' });
  }

  /* Upsert the serie record */
  const serieRecord: Serie = {
    id: set.id,
    name: set.name,
    blockId,
    cardCountTotal: set.cardCount?.total ?? null,
    cardCountOfficial: set.cardCount?.official ?? null,
    logo: set.logo ?? null,
    symbol: set.symbol ?? null,
    releaseDate: null,
    rawData: toPlainData(set),
  };

  if (!opts.dryRun) {
    upsertSerie(serieRecord);
  }
  summary.seriesImported++;

  /* Import each card */
  const cards = set.cards ?? [];
  const spinner = ora({
    text: `${set.name} — 0/${cards.length} cartes`,
    prefixText: '  ',
  }).start();

  let done = 0;
  let skipped = 0;

  for (const brief of cards) {
    /* Skip if already exists and not doing a full reimport */
    if (!opts.full && cardExists(brief.id)) {
      skipped++;
      done++;
      spinner.text = `${set.name} — ${done}/${cards.length} cartes (${skipped} déjà présentes)`;
      continue;
    }

    try {
      const fullCard = await brief.getCard() as unknown as Record<string, unknown> | null;
      if (!fullCard) {
        summary.errors++;
        done++;
        continue;
      }

      const card: Card = {
        id: fullCard.id as string,
        localId: fullCard.localId as string,
        name: fullCard.name as string,
        image: (fullCard.image as string | undefined) ?? null,
        rarity: (fullCard.rarity as string | undefined) ?? null,
        setId: set.id,
        pricingCardmarket: extractCardmarketPricing(fullCard),
        pricingTcgplayer: extractTcgplayerPricing(fullCard),
        rawData: toPlainData(fullCard),
      };

      if (!opts.dryRun) {
        upsertCard(card);
      }
      summary.cardsImported++;
    } catch (err) {
      console.log(chalk.red(`\n  ✗ Erreur carte ${brief.id}: ${String(err)}`));
      summary.errors++;
    }

    done++;
    spinner.text = `${set.name} — ${done}/${cards.length} cartes`;
  }

  summary.cardsSkipped += skipped;

  if (summary.errors > 0) {
    spinner.warn(`${set.name} — ${done - skipped} importées, ${skipped} déjà présentes, ${summary.errors} erreur(s)`);
  } else {
    spinner.succeed(`${set.name} — ${done - skipped} importées${skipped > 0 ? `, ${skipped} déjà présentes` : ''}`);
  }
}

/* ─────────────────────────────────────────────
   Public entry points
───────────────────────────────────────────── */

/**
 * Imports cards for a single TCGdex set.
 * The corresponding block (serie) must already exist in the DB
 * or will be created as a placeholder.
 */
export async function importCardsForSet(
  setId: string,
  opts: CardsImportOptions = {}
): Promise<ImportSummary> {
  const summary: ImportSummary = { blocksImported: 0, seriesImported: 0, cardsImported: 0, cardsSkipped: 0, errors: 0 };

  if (!opts.dryRun) initDatabase();

  console.log(chalk.cyan(`\n📦 Import set: ${setId}`));
  if (opts.dryRun) console.log(chalk.gray('   (dry-run — aucune écriture en base)'));

  await importSet(setId, opts, summary);
  printSummary(summary, opts);
  return summary;
}

/**
 * Imports ALL blocs + sets + cards from TCGdex.
 * Respects --full (reimport all) and --dry-run flags.
 */
export async function importAllCards(opts: CardsImportOptions = {}): Promise<ImportSummary> {
  const summary: ImportSummary = { blocksImported: 0, seriesImported: 0, cardsImported: 0, cardsSkipped: 0, errors: 0 };

  if (!opts.dryRun) initDatabase();

  console.log(chalk.cyan('\n📦 Import COMPLET des cartes (TCGdex, locale fr)'));
  if (opts.dryRun) console.log(chalk.gray('   (dry-run — aucune écriture en base)'));

  /* 1. Fetch all series (blocs) */
  const spinnerSeries = ora('Chargement des séries (blocs)...').start();
  const series = await listSeries();
  spinnerSeries.succeed(`${series.length} séries (blocs) trouvées`);

  /* 2. Upsert each bloc */
  for (const s of series) {
    const block: Block = { id: s.id, name: s.name, type: 'card' };
    if (!opts.dryRun) upsertBlock(block);
    summary.blocksImported++;
  }

  /* 3. For each bloc, get its sets and import cards */
  for (const s of series) {
    console.log(chalk.bold.blue(`\n▶ Bloc : ${s.name} (${s.id})`));

    const bloc = await getSerie(s.id);
    if (!bloc) {
      console.log(chalk.yellow(`  ⚠ Bloc "${s.id}" non trouvé`));
      continue;
    }

    const sets = (bloc as unknown as Record<string, unknown>).sets as Array<{ id: string; name: string }> | undefined ?? [];
    console.log(chalk.gray(`  ${sets.length} set(s)`));

    for (const setBrief of sets) {
      await importSet(setBrief.id, opts, summary);
    }
  }

  printSummary(summary, opts);
  return summary;
}

/** Logs the import summary to stdout. */
function printSummary(summary: ImportSummary, opts: CardsImportOptions): void {
  const tag = opts.dryRun ? chalk.yellow('[DRY-RUN]') : chalk.green('[TERMINÉ]');
  console.log(`\n${tag} Import cartes`);
  console.log(chalk.white(`  Blocs   : ${summary.blocksImported}`));
  console.log(chalk.white(`  Series  : ${summary.seriesImported}`));
  console.log(chalk.white(`  Cartes  : ${summary.cardsImported} importées, ${summary.cardsSkipped} déjà présentes`));
  if (summary.errors > 0) {
    console.log(chalk.red(`  Erreurs : ${summary.errors}`));
  }
}
