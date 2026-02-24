/**
 * Cardmarket URL importer
 *
 * For each card without a cardmarket_url, searches Google for
 * "{name} {localId} {setName} cardmarket" and stores the first
 * Cardmarket Singles product link found.
 *
 * Resumable: only processes cards where cardmarket_url IS NULL
 * (unless --full is passed).
 */

import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { updateCardmarketUrl, listCardsForUrlFetch } from '../db/database';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthLoader = require(path.join(__dirname, '../../scraper/src/index.js'));

const CM_PATH   = '/fr/Pokemon/Products/Singles/';
const DEBUG_DIR = path.join(__dirname, '../../data/debug');

/* ── Types ──────────────────────────────────── */

export interface FetchUrlsOptions {
  /** Only process cards from this set (e.g. "swsh1", "sv01"). */
  setId?: string;
  /** Re-fetch even for cards that already have a URL. */
  full?: boolean;
  /** Simulate without writing to DB. */
  dryRun?: boolean;
  /** Run browser headless (default: false — visible window). */
  headless?: boolean;
  /** Milliseconds to wait between requests (default: 1500). */
  delay?: number;
  /** Save raw HTML to data/debug/ when no link is found — helps diagnose extraction failures. */
  debug?: boolean;
}

export interface FetchUrlsSummary {
  processed: number;
  found: number;
  notFound: number;
  errors: number;
}

/* ── Helpers ─────────────────────────────────── */

/**
 * Extracts the first Cardmarket Singles product URL from a Google results page.
 *
 * Three passes, from most precise to most lenient:
 *   1. Direct absolute href (any locale)
 *   2. Google's /url?q= redirect wrapper
 *   3. Any raw occurrence of the URL anywhere in the HTML (data-*, JSON-LD, etc.)
 *
 * Always returns a /fr/ URL regardless of the locale found.
 */
function extractFirstCardmarketLink(html: string): string | null {
  const SINGLES = 'cardmarket.com';
  const patterns = [
    // 1 — direct href="https://www.cardmarket.com/{locale}/Pokemon/Products/Singles/..."
    /href="(https:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^"?#]+)"/,
    // 2 — Google redirect: href="/url?q=https://www.cardmarket.com/..."
    /href="\/url\?q=(https:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^&"#]+)/,
    // 3 — any occurrence anywhere in the HTML (data attrs, JSON, etc.)
    /(https?:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^"'&\s<>?#]+)/,
  ];

  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      const url = decodeURIComponent(m[1]);
      // Normalise to French locale
      return url.replace(/cardmarket\.com\/[a-z]{2}\//, `${SINGLES}/fr/`);
    }
  }
  return null;
}

/* ── Main entry point ────────────────────────── */

export async function fetchCardmarketUrls(opts: FetchUrlsOptions = {}): Promise<FetchUrlsSummary> {
  const summary: FetchUrlsSummary = { processed: 0, found: 0, notFound: 0, errors: 0 };
  const delay = opts.delay ?? 1500;

  if (opts.debug && !fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }

  const cards = listCardsForUrlFetch(opts.setId, opts.full);

  if (cards.length === 0) {
    console.log(chalk.green('\n  ✅ Toutes les cartes ont déjà une URL Cardmarket.'));
    return summary;
  }

  const scopeLabel = opts.setId ? `set "${opts.setId}"` : 'toutes les cartes';
  console.log(chalk.cyan(`\n🔍 Récupération URLs Cardmarket — ${cards.length} cartes (${scopeLabel})\n`));
  if (opts.dryRun) console.log(chalk.gray('   (dry-run — aucune écriture en base)\n'));

  const loader = new StealthLoader({ headless: opts.headless ?? false, waitTime: 3000 });

  try {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const progress = `[${i + 1}/${cards.length}]`;

      const query = `${card.name} ${card.localId} ${card.setName} cardmarket`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      const spinner = ora(`${progress} ${card.id} — ${card.name}`).start();

      try {
        const html: string = await loader.getHtml(searchUrl, null);
        const url = extractFirstCardmarketLink(html);

        if (url && url.includes(CM_PATH)) {
          if (!opts.dryRun) {
            updateCardmarketUrl(card.id, url);
          }
          spinner.succeed(`${progress} ${card.id} → ${url}`);
          summary.found++;
        } else {
          spinner.warn(`${progress} ${card.id} — aucun lien Cardmarket trouvé`);
          if (opts.debug) {
            const file = path.join(DEBUG_DIR, `${card.id}.html`);
            fs.writeFileSync(file, html, 'utf-8');
            console.log(chalk.gray(`    → HTML sauvegardé : ${file}`));
          }
          summary.notFound++;
        }
      } catch (err) {
        spinner.fail(`${progress} ${card.id} — erreur : ${String(err)}`);
        summary.errors++;
      }

      summary.processed++;

      // Pause between requests (skip after the last card)
      if (i < cards.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } finally {
    await loader.close();
  }

  return summary;
}
