import chalk from 'chalk';
import ora from 'ora';
import {
  getAllEpisodes,
  getEpisodeProducts,
  getQuotaUsed,
  getQuotaRemaining,
  type ProductRaw,
} from '../apis/pokemonapi';
import {
  initDatabase,
  upsertSealedProduct,
  sealedProductExists,
} from '../db/database';
import type { SealedProduct, SealedPricingCardmarket } from '../models/SealedProduct';

export interface SealedImportOptions {
  /** If true, reimport records that already exist in the DB. */
  full?: boolean;
  /** If true, log what would be imported without writing to the DB. */
  dryRun?: boolean;
  /** If provided, only import products for this specific episode id. */
  episodeId?: number;
}

interface ImportSummary {
  episodesProcessed: number;
  productsImported: number;
  productsSkipped: number;
  errors: number;
  quotaUsed: number;
}

/* ─────────────────────────────────────────────
   Internal helpers
───────────────────────────────────────────── */

/** Maps a raw ProductRaw from the RapidAPI to a SealedProduct model. */
function mapProduct(raw: ProductRaw, episodeName: string): SealedProduct {
  const cm = raw.prices?.cardmarket;
  const tcp = raw.prices?.tcgplayer ?? null;

  const pricesCardmarket: SealedPricingCardmarket | null = cm
    ? {
        currency: 'EUR',
        lowest: (cm.lowest as number | null | undefined) ?? null,
        lowest_EU_only: (cm.lowest_EU_only as number | null | undefined) ?? null,
        lowest_FR: (cm.lowest_FR as number | null | undefined) ?? null,
        lowest_FR_EU_only: (cm.lowest_FR_EU_only as number | null | undefined) ?? null,
        lowest_DE: (cm.lowest_DE as number | null | undefined) ?? null,
        lowest_DE_EU_only: (cm.lowest_DE_EU_only as number | null | undefined) ?? null,
        lowest_ES: (cm.lowest_ES as number | null | undefined) ?? null,
        lowest_ES_EU_only: (cm.lowest_ES_EU_only as number | null | undefined) ?? null,
        lowest_IT: (cm.lowest_IT as number | null | undefined) ?? null,
        lowest_IT_EU_only: (cm.lowest_IT_EU_only as number | null | undefined) ?? null,
      }
    : null;

  return {
    id: raw.id,
    name: raw.name,
    /* product_type absent in observed API — use null */
    productType: (raw.product_type as string | undefined) ?? null,
    episodeId: String(raw.episode?.id ?? ''),
    serieName: episodeName,
    image: raw.image ?? null,
    pricesCardmarket,
    pricesTcgplayer: tcp ? (tcp as Record<string, unknown>) : null,
    rawData: raw as unknown as Record<string, unknown>,
  };
}

/* ─────────────────────────────────────────────
   Import a single episode's products
───────────────────────────────────────────── */

async function importEpisodeProducts(
  episodeId: number,
  episodeName: string,
  opts: SealedImportOptions,
  summary: ImportSummary
): Promise<void> {
  let products: ProductRaw[];

  try {
    products = await getEpisodeProducts(episodeId);
    summary.quotaUsed++;
  } catch (err) {
    console.log(chalk.red(`  ✗ Erreur récupération produits épisode ${episodeId}: ${String(err)}`));
    summary.errors++;
    return;
  }

  if (products.length === 0) {
    console.log(chalk.gray(`  → Épisode "${episodeName}" : aucun produit scellé`));
    return;
  }

  let imported = 0;
  let skipped = 0;

  for (const raw of products) {
    if (!opts.full && sealedProductExists(raw.id)) {
      skipped++;
      continue;
    }

    try {
      const product = mapProduct(raw, episodeName);
      if (!opts.dryRun) {
        upsertSealedProduct(product);
      }
      imported++;
    } catch (err) {
      console.log(chalk.red(`  ✗ Erreur produit id=${raw.id}: ${String(err)}`));
      summary.errors++;
    }
  }

  summary.productsImported += imported;
  summary.productsSkipped += skipped;
  summary.episodesProcessed++;

  const skippedNote = skipped > 0 ? chalk.gray(`, ${skipped} déjà présents`) : '';
  console.log(`  ${chalk.green('✓')} "${episodeName}" — ${imported} produit(s)${skippedNote}`);
}

/* ─────────────────────────────────────────────
   Public entry points
───────────────────────────────────────────── */

/**
 * Imports sealed products for a single RapidAPI episode.
 */
export async function importSealedForEpisode(
  episodeId: number,
  opts: SealedImportOptions = {}
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    episodesProcessed: 0,
    productsImported: 0,
    productsSkipped: 0,
    errors: 0,
    quotaUsed: 0,
  };

  if (!opts.dryRun) initDatabase();

  console.log(chalk.cyan(`\n🔒 Import scellés épisode: ${episodeId}`));
  if (opts.dryRun) console.log(chalk.gray('   (dry-run — aucune écriture en base)'));

  console.log(chalk.gray(`   Quota RapidAPI restant : ${getQuotaRemaining()}/95`));

  await importEpisodeProducts(episodeId, String(episodeId), opts, summary);
  printSummary(summary, opts);
  return summary;
}

/**
 * Imports ALL sealed products from all RapidAPI episodes.
 * Handles pagination for episodes (max 10 API calls for listing).
 */
export async function importAllSealed(opts: SealedImportOptions = {}): Promise<ImportSummary> {
  const summary: ImportSummary = {
    episodesProcessed: 0,
    productsImported: 0,
    productsSkipped: 0,
    errors: 0,
    quotaUsed: 0,
  };

  if (!opts.dryRun) initDatabase();

  console.log(chalk.cyan('\n🔒 Import COMPLET des scellés (pokemon-api.com via RapidAPI)'));
  if (opts.dryRun) console.log(chalk.gray('   (dry-run — aucune écriture en base)'));

  const quotaBefore = getQuotaUsed();
  console.log(chalk.gray(`   Quota RapidAPI au départ : ${quotaBefore}/100 (arrêt à 95)`));

  /* 1. Fetch all episodes (paginated) */
  const spinnerEps = ora('Chargement des épisodes...').start();
  let episodes;
  try {
    episodes = await getAllEpisodes(10);
    summary.quotaUsed += getQuotaUsed() - quotaBefore;
    spinnerEps.succeed(`${episodes.length} épisode(s) trouvé(s)`);
  } catch (err) {
    spinnerEps.fail(`Erreur chargement épisodes: ${String(err)}`);
    return summary;
  }

  /* 2. For each episode, fetch products */
  for (const ep of episodes) {
    if (getQuotaRemaining() <= 0) {
      console.log(chalk.red('\n⛔ Quota RapidAPI atteint — import interrompu.'));
      break;
    }

    const beforeCall = getQuotaUsed();
    await importEpisodeProducts(ep.id, ep.name, opts, summary);
    summary.quotaUsed += getQuotaUsed() - beforeCall;
  }

  printSummary(summary, opts);
  return summary;
}

/** Logs the import summary to stdout. */
function printSummary(summary: ImportSummary, opts: SealedImportOptions): void {
  const tag = opts.dryRun ? chalk.yellow('[DRY-RUN]') : chalk.green('[TERMINÉ]');
  console.log(`\n${tag} Import scellés`);
  console.log(chalk.white(`  Épisodes traités : ${summary.episodesProcessed}`));
  console.log(chalk.white(`  Produits : ${summary.productsImported} importés, ${summary.productsSkipped} déjà présents`));
  console.log(chalk.white(`  Quota RapidAPI utilisé dans ce run : ${summary.quotaUsed}`));
  console.log(chalk.white(`  Quota total aujourd'hui : ${getQuotaUsed()}/100`));
  if (summary.errors > 0) {
    console.log(chalk.red(`  Erreurs : ${summary.errors}`));
  }
}
