/**
 * Cardmarket URL discovery — sample test
 *
 * Tries to find the Cardmarket product page URL for a small sample of cards
 * using the StealthLoader scraper (visible browser, no headless).
 *
 * Strategy : Google search "{name} {localId} {setName} cardmarket"
 * → take the first Cardmarket Singles product link in the results.
 *
 * Run : npx ts-node src/tests/cardmarket-url-sample.ts
 */

import path from 'path';
import Database from 'better-sqlite3';

// StealthLoader is a plain JS module in the scraper submodule
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthLoader = require(path.join(__dirname, '../../scraper/src/index.js'));

const DB_PATH = path.join(__dirname, '../../data/pokemon-tcg.db');
const CM_BASE  = 'https://www.cardmarket.com';
const CM_PATH  = '/fr/Pokemon/Products/Singles/';

/* ── Helpers ────────────────────────────────────── */

interface CardRow {
  id: string;
  name: string;
  localId: string;
  setName: string;
  idProduct: number | null;
}

/**
 * Extracts the first Cardmarket Singles product URL from a Google results page.
 *
 * Google can encode external links in two ways:
 *   1. Direct href  : href="https://www.cardmarket.com/fr/Pokemon/Products/Singles/..."
 *   2. Redirect href: href="/url?q=https://www.cardmarket.com/fr/Pokemon/Products/Singles/..."
 *
 * Returns the absolute Cardmarket URL, or null if nothing matched.
 */
function extractFirstCardmarketLink(html: string): string | null {
  // Pattern 1 — direct absolute URL
  const directRe = /href="(https:\/\/www\.cardmarket\.com\/fr\/Pokemon\/Products\/Singles\/[^"?#]+)"/g;
  // Pattern 2 — Google redirect wrapper
  const redirectRe = /href="\/url\?q=(https:\/\/www\.cardmarket\.com\/fr\/Pokemon\/Products\/Singles\/[^&"]+)/g;

  for (const re of [directRe, redirectRe]) {
    const m = re.exec(html);
    if (m) {
      // Decode percent-encoding that Google may have applied
      return decodeURIComponent(m[1]);
    }
  }
  return null;
}

/* ── Main ───────────────────────────────────────── */

async function main(): Promise<void> {
  const db = new Database(DB_PATH);

  // Sample: 5 cards from swsh1 that have pricing data
  const cards = db.prepare(`
    SELECT c.id,
           c.name,
           c.local_id                                        AS localId,
           s.name                                            AS setName,
           json_extract(c.pricing_cardmarket, '$.idProduct') AS idProduct
    FROM   cards  c
    JOIN   series s ON s.id = c.set_id
    WHERE  c.set_id = 'swsh1'
      AND  c.pricing_cardmarket IS NOT NULL
    LIMIT  5
  `).all() as CardRow[];

  if (cards.length === 0) {
    console.error('Aucune carte trouvée dans swsh1. Lance d\'abord import:cards -- --set swsh1');
    process.exit(1);
  }

  console.log(`\n🔍 Test Cardmarket URL via Google — ${cards.length} cartes de swsh1\n`);

  const loader = new StealthLoader({ headless: false, waitTime: 3000 });

  const results: Array<{ id: string; name: string; url: string | null }> = [];

  try {
    for (const card of cards) {
      // e.g. "Grookey 1 Épée et Bouclier cardmarket"
      const query = `${card.name} ${card.localId} ${card.setName} cardmarket`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      console.log(`▶ ${card.id} — ${card.name} (idProduct: ${card.idProduct})`);
      console.log(`  Recherche : ${searchUrl}`);

      try {
        const html: string = await loader.getHtml(searchUrl, null);
        const url = extractFirstCardmarketLink(html);

        if (url) {
          // Sanity check: must be a Singles leaf URL
          const isSingles = url.includes(CM_PATH);
          console.log(isSingles
            ? `  ✅ URL trouvée : ${url}`
            : `  ⚠  Lien non-Singles ignoré : ${url}`);
          results.push({ id: card.id, name: card.name, url: isSingles ? url : null });
        } else {
          console.log(`  ❌ Aucun lien Cardmarket trouvé`);
          results.push({ id: card.id, name: card.name, url: null });
        }
      } catch (err) {
        console.log(`  ❌ Erreur : ${String(err)}`);
        results.push({ id: card.id, name: card.name, url: null });
      }

      // Pause between requests to avoid rate-limiting
      await new Promise(r => setTimeout(r, 3000));
    }
  } finally {
    await loader.close();
  }

  /* ── Summary ── */
  console.log('\n' + '─'.repeat(60));
  console.log('RÉSUMÉ\n');
  const found    = results.filter(r => r.url !== null).length;
  const notFound = results.filter(r => r.url === null).length;

  console.log(`  ✅ Trouvé    : ${found}/${results.length}`);
  console.log(`  ❌ Non trouvé: ${notFound}/${results.length}`);

  console.log('\nRésultats complets :');
  results.forEach(r => {
    console.log(`  ${r.id.padEnd(15)} ${r.url ?? '(non résolu)'}`);
  });
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
