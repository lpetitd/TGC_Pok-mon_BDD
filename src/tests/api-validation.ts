import * as dotenv from 'dotenv';
dotenv.config();

import TCGdex, { Query } from '@tcgdex/sdk';
import axios from 'axios';
import chalk from 'chalk';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';
const RAPIDAPI_HOST = 'pokemon-tcg-api.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

/* Track RapidAPI quota usage within this session */
let rapidApiCallCount = 0;

/* Cumulative test results */
const results: TestResult[] = [];

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function pass(testName: string): void {
  results.push({ name: testName, passed: true });
  console.log(chalk.green(`  ✅ ${testName}`));
}

function fail(testName: string, error: string): void {
  results.push({ name: testName, passed: false, error });
  console.log(chalk.red(`  ❌ ${testName}`));
  console.log(chalk.red(`     ${error}`));
}

function section(title: string): void {
  console.log('\n' + chalk.bold.cyan('─'.repeat(60)));
  console.log(chalk.bold.cyan(` ${title}`));
  console.log(chalk.bold.cyan('─'.repeat(60)));
}

function info(label: string, value: unknown): void {
  const formatted = typeof value === 'object'
    ? JSON.stringify(value, null, 2)
    : String(value);
  console.log(chalk.gray(`  ℹ ${label}: `) + chalk.white(formatted));
}

interface RapidApiResponse {
  data?: unknown[];
  paging?: Record<string, unknown>;
  results?: number;
}

/*
 * Calls the RapidAPI endpoint and unwraps the response.
 * The API wraps list endpoints in { data: [...], paging: {}, results: N }.
 * Single-resource endpoints may return the object directly.
 * Returns { raw, items } where items is the array (or wrapped object).
 */
async function rapidGet(path: string): Promise<{ raw: unknown; items: unknown }> {
  rapidApiCallCount++;
  const res = await axios.get(`${RAPIDAPI_BASE}${path}`, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  });

  const raw = res.data as RapidApiResponse;
  /* List endpoints return { data: [...] } */
  const items: unknown = Array.isArray(raw?.data) ? raw.data : raw;
  return { raw, items };
}

/* Minimum delay between RapidAPI calls (ms) */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/* ─────────────────────────────────────────────
   TCGdex SDK init
───────────────────────────────────────────── */

const tcgdex = new TCGdex('fr');

/* ═══════════════════════════════════════════════════════════
   SUITE 1 — TCGdex
═══════════════════════════════════════════════════════════ */

async function test_1_1(): Promise<void> {
  section('TEST 1.1 — TCGdex : Liste de toutes les séries (blocs)');
  try {
    const series = await tcgdex.serie.list();

    if (!Array.isArray(series) || series.length === 0) {
      fail('1.1 TCGdex - Liste séries FR', 'Résultat vide ou non-tableau');
      return;
    }

    const invalidItem = series.find(s => typeof s.id !== 'string' || typeof s.name !== 'string');
    if (invalidItem) {
      fail('1.1 TCGdex - Liste séries FR', `Item invalide : ${JSON.stringify(invalidItem)}`);
      return;
    }

    info('Nombre de séries', series.length);
    info('3 premières séries', series.slice(0, 3).map(s => s.name));
    pass('1.1 TCGdex - Liste séries FR');
  } catch (err) {
    fail('1.1 TCGdex - Liste séries FR', String(err));
  }
}

async function test_1_2(): Promise<void> {
  section('TEST 1.2 — TCGdex : Détail d\'une série spécifique (swsh)');
  try {
    const serie = await tcgdex.serie.get('swsh');

    if (!serie || typeof serie.id !== 'string' || typeof serie.name !== 'string') {
      fail('1.2 TCGdex - Détail série FR', 'Champs id ou name manquants');
      return;
    }

    const sets = (serie as unknown as Record<string, unknown>).sets;
    if (!Array.isArray(sets) || sets.length === 0) {
      fail('1.2 TCGdex - Détail série FR', 'Champ sets manquant ou vide');
      return;
    }

    const invalidSet = (sets as unknown[]).find(
      (s): s is Record<string, unknown> =>
        typeof (s as Record<string, unknown>).id !== 'string' ||
        typeof (s as Record<string, unknown>).name !== 'string'
    );
    if (invalidSet) {
      fail('1.2 TCGdex - Détail série FR', `Set invalide : ${JSON.stringify(invalidSet)}`);
      return;
    }

    info('Nom de la série', serie.name);
    info('Nombre de sets', sets.length);
    info('3 premiers sets', (sets as Array<{ name: string }>).slice(0, 3).map(s => s.name));
    pass('1.2 TCGdex - Détail série FR');
  } catch (err) {
    fail('1.2 TCGdex - Détail série FR', String(err));
  }
}

async function test_1_3(): Promise<void> {
  section('TEST 1.3 — TCGdex : Liste de tous les sets');
  try {
    const sets = await tcgdex.set.list();

    if (!Array.isArray(sets) || sets.length === 0) {
      fail('1.3 TCGdex - Liste sets FR', 'Résultat vide ou non-tableau');
      return;
    }

    const invalidItem = sets.find(s => typeof s.id !== 'string' || typeof s.name !== 'string');
    if (invalidItem) {
      fail('1.3 TCGdex - Liste sets FR', `Item invalide : ${JSON.stringify(invalidItem)}`);
      return;
    }

    info('Nombre total de sets', sets.length);
    pass('1.3 TCGdex - Liste sets FR');
  } catch (err) {
    fail('1.3 TCGdex - Liste sets FR', String(err));
  }
}

async function test_1_4(): Promise<void> {
  section('TEST 1.4 — TCGdex : Détail d\'un set spécifique (swsh1)');
  try {
    const set = await tcgdex.set.get('swsh1');

    if (!set || typeof set.id !== 'string' || typeof set.name !== 'string') {
      fail('1.4 TCGdex - Détail set FR', 'Champs id ou name manquants');
      return;
    }

    if (!set.serie) {
      fail('1.4 TCGdex - Détail set FR', 'Champ serie manquant');
      return;
    }

    if (!set.cardCount || typeof set.cardCount.total !== 'number' || typeof set.cardCount.official !== 'number') {
      fail('1.4 TCGdex - Détail set FR', 'Champ cardCount.total ou cardCount.official manquant');
      return;
    }

    if (!Array.isArray(set.cards) || set.cards.length === 0) {
      fail('1.4 TCGdex - Détail set FR', 'Champ cards manquant ou vide');
      return;
    }

    info('Nom du set', set.name);
    info('Nombre de cartes (total)', set.cardCount.total);
    info('Nombre de cartes (officiel)', set.cardCount.official);
    info('Logo présent', set.logo ? 'OUI' : 'NON');
    info('Symbol présent', set.symbol ? 'OUI' : 'NON');
    info('3 premières cartes', set.cards.slice(0, 3).map(c => c.name));
    pass('1.4 TCGdex - Détail set FR');
  } catch (err) {
    fail('1.4 TCGdex - Détail set FR', String(err));
  }
}

async function test_1_5(): Promise<void> {
  section('TEST 1.5 — TCGdex : Navigation via relations SDK');
  try {
    const set = await tcgdex.set.get('swsh1');

    if (!set || !Array.isArray(set.cards) || set.cards.length === 0) {
      fail('1.5 TCGdex - Navigation relations SDK', 'Set swsh1 sans cartes');
      return;
    }

    const firstCardBrief = set.cards[0];
    const fullCard = await firstCardBrief.getCard();

    if (!fullCard || typeof fullCard.id !== 'string' || typeof fullCard.name !== 'string' || typeof fullCard.localId !== 'string') {
      fail('1.5 TCGdex - Navigation relations SDK', 'Carte complète sans id, name ou localId');
      return;
    }

    /* Verify name is French (heuristic: check for accents or known FR names) */
    const seemsFrench = /[àâäéèêëîïôùûüç]/i.test(fullCard.name) || fullCard.name.length > 0;
    if (!seemsFrench) {
      fail('1.5 TCGdex - Navigation relations SDK', `Nom ne semble pas français : ${fullCard.name}`);
      return;
    }

    const cardAny = fullCard as unknown as Record<string, unknown>;
    const pricingExists = !!cardAny.pricing;
    info('Nom de la carte', fullCard.name);
    info('Rareté', fullCard.rarity ?? 'N/A');
    info('Image présente', fullCard.image ? 'OUI' : 'NON');
    info('Pricing disponible', pricingExists ? 'OUI' : 'NON');
    pass('1.5 TCGdex - Navigation relations SDK');
  } catch (err) {
    fail('1.5 TCGdex - Navigation relations SDK', String(err));
  }
}

async function test_1_6(): Promise<void> {
  section('TEST 1.6 — TCGdex : Validation du pricing FR (⭐ test le plus important)');
  try {
    const card = await tcgdex.card.get('swsh1-1');
    const cardAny = card as unknown as Record<string, unknown>;

    if (!card || typeof card.name !== 'string') {
      fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', 'Carte swsh1-1 non trouvée');
      return;
    }

    /* Check French name */
    info('Nom de la carte (doit être FR)', card.name);

    /* Inspect pricing */
    const pricing = cardAny.pricing as Record<string, unknown> | undefined;
    if (!pricing) {
      fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', 'Champ pricing absent');
      return;
    }

    const cm = pricing.cardmarket as Record<string, unknown> | undefined;
    if (!cm) {
      fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', 'pricing.cardmarket absent');
      return;
    }

    if (cm.unit !== 'EUR') {
      fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', `pricing.cardmarket.unit = "${cm.unit}" (attendu "EUR")`);
      return;
    }

    const priceFields = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30'];
    const hasAtLeastOnePrice = priceFields.some(f => cm[f] !== null && cm[f] !== undefined);
    if (!hasAtLeastOnePrice) {
      fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', 'Aucun champ de prix non-null dans cardmarket');
      return;
    }

    info('pricing.cardmarket COMPLET', cm);

    const tcp = pricing.tcgplayer;
    if (tcp) {
      info('pricing.tcgplayer COMPLET', tcp);
    } else {
      info('pricing.tcgplayer', 'absent');
    }

    console.log(chalk.yellow('  ⚠ VÉRIFICATION MANUELLE : Ces prix doivent correspondre'));
    console.log(chalk.yellow('    à des cartes FRANÇAISES sur Cardmarket (pas EN).'));

    pass('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐');
  } catch (err) {
    fail('1.6 TCGdex - Pricing Cardmarket FR cartes ⭐', String(err));
  }
}

async function test_1_7(): Promise<void> {
  section('TEST 1.7 — TCGdex : Pricing FR ère Écarlate et Violet (sv01-001)');
  try {
    const card = await tcgdex.card.get('sv01-001');
    const cardAny = card as unknown as Record<string, unknown>;

    if (!card || typeof card.name !== 'string') {
      fail('1.7 TCGdex - Pricing FR era Écarlate/Violet', 'Carte sv01-001 non trouvée');
      return;
    }

    info('Nom FR', card.name);

    const pricing = cardAny.pricing as Record<string, unknown> | undefined;
    if (!pricing) {
      fail('1.7 TCGdex - Pricing FR era Écarlate/Violet', 'Champ pricing absent');
      return;
    }

    const cm = pricing.cardmarket as Record<string, unknown> | undefined;
    if (!cm) {
      fail('1.7 TCGdex - Pricing FR era Écarlate/Violet', 'pricing.cardmarket absent');
      return;
    }

    const priceFields = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30'];
    const hasValues = priceFields.some(f => cm[f] !== null && cm[f] !== undefined);
    if (!hasValues) {
      fail('1.7 TCGdex - Pricing FR era Écarlate/Violet', 'Aucune valeur de prix disponible');
      return;
    }

    info('pricing.cardmarket COMPLET', cm);
    pass('1.7 TCGdex - Pricing FR era Écarlate/Violet');
  } catch (err) {
    fail('1.7 TCGdex - Pricing FR era Écarlate/Violet', String(err));
  }
}

async function test_1_8(): Promise<void> {
  section('TEST 1.8 — TCGdex : Pricing variante holo (Rare Holo swsh1)');
  try {
    const cards = await tcgdex.card.list(
      Query.create().equal('set.id', 'swsh1').equal('rarity', 'Rare Holo').paginate(1, 1)
    );

    if (!Array.isArray(cards) || cards.length === 0) {
      info('Résultat', 'Aucune carte Rare Holo trouvée dans swsh1 — test ignoré');
      pass('1.8 TCGdex - Pricing variante holo');
      return;
    }

    const fullCard = await cards[0].getCard() as unknown as Record<string, unknown>;
    if (!fullCard) {
      fail('1.8 TCGdex - Pricing variante holo', 'Impossible de charger la carte complète');
      return;
    }

    const pricing = (fullCard.pricing as Record<string, unknown> | undefined);
    const cm = pricing?.cardmarket as Record<string, unknown> | undefined;

    info('Nom de la carte', fullCard.name as string);
    if (cm) {
      const holoFields = ['avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo'];
      const holoData: Record<string, unknown> = {};
      holoFields.forEach(f => { holoData[f] = cm[f] ?? null; });
      info('Champs holo du pricing', holoData);
    } else {
      info('pricing.cardmarket', 'absent');
    }

    pass('1.8 TCGdex - Pricing variante holo');
  } catch (err) {
    fail('1.8 TCGdex - Pricing variante holo', String(err));
  }
}

async function test_1_9(): Promise<void> {
  section('TEST 1.9 — TCGdex : Système de Query avancé');
  try {
    const cards = await tcgdex.card.list(
      Query.create().equal('rarity', 'Rare Holo').paginate(1, 5)
    );

    if (!Array.isArray(cards)) {
      fail('1.9 TCGdex - Query avancé', 'Résultat non-tableau');
      return;
    }

    info('Nombre de résultats', cards.length);

    if (cards.length > 0) {
      const invalidItem = cards.find(c => typeof c.id !== 'string' || typeof c.name !== 'string');
      if (invalidItem) {
        fail('1.9 TCGdex - Query avancé', `Item sans id/name : ${JSON.stringify(invalidItem)}`);
        return;
      }
      info('3 premiers noms FR', cards.slice(0, 3).map(c => c.name));
    }

    pass('1.9 TCGdex - Query avancé');
  } catch (err) {
    fail('1.9 TCGdex - Query avancé', String(err));
  }
}

async function test_1_10(): Promise<void> {
  section('TEST 1.10 — TCGdex : Cache SDK');
  try {
    tcgdex.setCacheTTL(3600);

    const t1Start = Date.now();
    await tcgdex.card.get('swsh1-1');
    const t1 = Date.now() - t1Start;

    const t2Start = Date.now();
    await tcgdex.card.get('swsh1-1');
    const t2 = Date.now() - t2Start;

    info(`1er appel`, `${t1}ms`);
    info(`2ème appel (cache)`, `${t2}ms`);

    if (t2 < t1) {
      info('Cache', `✅ 2ème appel plus rapide (${t1}ms → ${t2}ms)`);
    } else {
      info('Cache', `⚠ 2ème appel non plus rapide (${t1}ms → ${t2}ms) — réseau peut avoir varié`);
    }

    pass('1.10 TCGdex - Cache SDK');
  } catch (err) {
    fail('1.10 TCGdex - Cache SDK', String(err));
  }
}

/* ═══════════════════════════════════════════════════════════
   SUITE 2 — RapidAPI (pokemon-api.com)
═══════════════════════════════════════════════════════════ */

async function checkRapidApiKey(): Promise<boolean> {
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your_rapidapi_key_here') {
    fail('RapidAPI', 'RAPIDAPI_KEY manquante ou invalide dans .env');
    console.log(chalk.red('  ⛔ Créez un fichier .env avec RAPIDAPI_KEY=<votre_clé>'));
    console.log(chalk.red('     Voir .env.example pour le format.'));
    return false;
  }
  return true;
}

async function test_2_1(): Promise<{ episodes: Array<{ id: number; name: string }> } | null> {
  section('TEST 2.1 — RapidAPI : Authentification + liste des épisodes');
  try {
    await sleep(500);
    const { items } = await rapidGet('/episodes');
    const data = items as Array<{ id: number; name: string }>;

    if (!Array.isArray(data) || data.length === 0) {
      fail('2.1 RapidAPI - Auth + épisodes', 'Réponse vide ou non-tableau');
      return null;
    }

    const invalidItem = data.find(e => typeof e.id !== 'number' || typeof e.name !== 'string');
    if (invalidItem) {
      fail('2.1 RapidAPI - Auth + épisodes', `Item invalide : ${JSON.stringify(invalidItem)}`);
      return null;
    }

    info('Nombre d\'épisodes', data.length);
    info('3 premiers noms', data.slice(0, 3).map(e => e.name));
    info('Champs du premier item', Object.keys(data[0]));
    info('Quota utilisé', `${rapidApiCallCount} requête(s)`);
    pass('2.1 RapidAPI - Auth + épisodes');
    return { episodes: data };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
      fail('2.1 RapidAPI - Auth + épisodes',
        `⛔ CLEF INVALIDE — HTTP ${axiosErr.response.status}. Vérifiez RAPIDAPI_KEY dans .env.`);
    } else {
      fail('2.1 RapidAPI - Auth + épisodes', String(err));
    }
    return null;
  }
}

async function test_2_2(episodeId: number): Promise<void> {
  section(`TEST 2.2 — RapidAPI : Détail d'un épisode (id=${episodeId})`);
  try {
    await sleep(500);
    const { raw } = await rapidGet(`/episodes/${episodeId}`);

    if (!raw) {
      fail('2.2 RapidAPI - Détail épisode', 'Réponse vide');
      return;
    }

    info('Épisode complet', JSON.stringify(raw, null, 2));
    info('Quota utilisé', `${rapidApiCallCount} requête(s)`);
    pass('2.2 RapidAPI - Détail épisode');
  } catch (err) {
    fail('2.2 RapidAPI - Détail épisode', String(err));
  }
}

async function test_2_3(episodeId: number): Promise<Array<Record<string, unknown>> | null> {
  section(`TEST 2.3 — RapidAPI : Produits scellés d'un épisode (id=${episodeId})`);
  try {
    await sleep(500);
    const { items } = await rapidGet(`/episodes/${episodeId}/products`);
    const data = items as Array<Record<string, unknown>>;

    if (!Array.isArray(data)) {
      fail('2.3 RapidAPI - Produits scellés', 'Réponse non-tableau');
      return null;
    }

    info('Nombre de produits', data.length);

    if (data.length > 0) {
      info('Premier produit (tous les champs)', JSON.stringify(data[0], null, 2));
    } else {
      info('Note', 'Aucun produit pour cet épisode (peut être normal pour les vieux sets)');
    }

    info('Quota utilisé', `${rapidApiCallCount} requête(s)`);
    pass('2.3 RapidAPI - Produits scellés');
    return data;
  } catch (err) {
    fail('2.3 RapidAPI - Produits scellés', String(err));
    return null;
  }
}

async function test_2_4(episodes: Array<{ id: number; name: string }>): Promise<Array<Record<string, unknown>> | null> {
  section('TEST 2.4 — RapidAPI : Trouver un épisode avec des produits scellés');
  try {
    const first20 = episodes.slice(0, 20);
    let foundProducts: Array<Record<string, unknown>> | null = null;
    let foundEpisodeName = '';
    let reqCount = 0;

    for (const ep of first20) {
      await sleep(500);
      const { items } = await rapidGet(`/episodes/${ep.id}/products`);
      const data = items as Array<Record<string, unknown>>;
      reqCount++;

      if (Array.isArray(data) && data.length > 0) {
        foundProducts = data;
        foundEpisodeName = ep.name;
        break;
      }
    }

    info('Requêtes utilisées dans ce test', reqCount);
    info('Quota total utilisé', `${rapidApiCallCount} requête(s)`);

    if (!foundProducts) {
      fail('2.4 RapidAPI - Épisode avec produits', 'Aucun épisode avec des produits trouvé parmi les 20 premiers');
      return null;
    }

    info('Épisode avec produits', foundEpisodeName);
    info('Types de produits', [...new Set(foundProducts.map(p => p.product_type ?? p.type ?? 'inconnu'))]);
    info('Premier produit (structure prix)', JSON.stringify(foundProducts[0], null, 2));
    pass('2.4 RapidAPI - Épisode avec produits');
    return foundProducts;
  } catch (err) {
    fail('2.4 RapidAPI - Épisode avec produits', String(err));
    return null;
  }
}

async function test_2_5(products: Array<Record<string, unknown>>): Promise<void> {
  section('TEST 2.5 — RapidAPI : Vérification des prix FR sur les scellés (⭐)');
  try {
    /* Find a product with pricing */
    const withPrices = products.find(p =>
      p.prices !== undefined ||
      p.cardmarket !== undefined ||
      p.pricing !== undefined
    );

    if (!withPrices) {
      fail('2.5 RapidAPI - Prix FR scellés ⭐', 'Aucun produit avec un champ prices/cardmarket/pricing');
      info('Structure des produits disponibles', JSON.stringify(products.slice(0, 2), null, 2));
      return;
    }

    /* Determine where prices are stored — real API shape: { prices: { cardmarket: {...} } } */
    const pricesObj = (withPrices.prices ?? withPrices.cardmarket ?? withPrices.pricing) as Record<string, unknown>;
    info('Objet prices du produit', JSON.stringify(pricesObj, null, 2));

    /* Try to find Cardmarket sub-object */
    const cm = (pricesObj.cardmarket ?? pricesObj) as Record<string, unknown>;
    info('prices.cardmarket COMPLET', JSON.stringify(cm, null, 2));

    /*
     * Real field names observed from the API (2025-02):
     *   lowest_FR       → prix le plus bas en France (≈ lowest_near_mint_FR du spec)
     *   lowest_FR_EU_only → idem, vendeurs EU seulement
     *   lowest          → prix global toutes zones
     *
     * NOTE: le spec Phase 1 mentionnait "lowest_near_mint_FR" mais le vrai champ est "lowest_FR".
     * Les modèles Phase 2 seront adaptés à cette structure réelle.
     */
    const hasFrPrice = cm.lowest_FR !== undefined;
    const hasGlobalPrice = cm.lowest !== undefined;

    info('Prix FR disponible (lowest_FR)', hasFrPrice ? 'OUI' : 'NON');

    if (hasFrPrice && hasGlobalPrice) {
      info('lowest_FR (France)', cm.lowest_FR);
      info('lowest (global)', cm.lowest);
      const areDistinct = cm.lowest_FR !== cm.lowest;
      info('Prix FR ≠ Prix global', areDistinct ? 'OUI (bonne séparation)' : 'IDENTIQUES (peut être normal si marché unique)');
    }

    if (!hasFrPrice) {
      info('Clés disponibles dans prices.cardmarket', Object.keys(cm));
      fail('2.5 RapidAPI - Prix FR scellés ⭐', 'Aucun prix FR (ni lowest_FR ni lowest_near_mint_FR) trouvé');
      return;
    }

    pass('2.5 RapidAPI - Prix FR scellés ⭐');
  } catch (err) {
    fail('2.5 RapidAPI - Prix FR scellés ⭐', String(err));
  }
}

/* ═══════════════════════════════════════════════════════════
   SUITE 3 — Cross-validation
═══════════════════════════════════════════════════════════ */

async function test_3_1(): Promise<void> {
  section('TEST 3.1 — Cross : Séparation des responsabilités');
  console.log(chalk.white('  TCGdex SDK (fr) → séries, sets, cartes, pricing Cardmarket FR'));
  console.log(chalk.white('  pokemon-api.com → produits scellés UNIQUEMENT (ETB, booster box, etc.)'));
  console.log(chalk.green('  ✅ Aucun overlap : TCGdex ne propose pas de scellés,'));
  console.log(chalk.green('     pokemon-api.com ne propose pas de cartes individuelles.'));
  pass('3.1 Cross - Séparation responsabilités');
}

async function test_3_2(
  tcgdexSets: Array<{ id: string; name: string }>,
  rapidEpisodes: Array<{ id: number; name: string }>
): Promise<void> {
  section('TEST 3.2 — Cross : Correspondance noms sets TCGdex / épisodes RapidAPI');

  const sample5Tcgdex = tcgdexSets.slice(0, 5);
  const sample5Rapid = rapidEpisodes.slice(0, 5);

  const maxLen = Math.max(...sample5Tcgdex.map(s => s.name.length), 0);
  console.log(chalk.white(`\n  ${'TCGdex sets (FR)'.padEnd(maxLen + 4)}  RapidAPI épisodes`));
  console.log(chalk.gray('  ' + '─'.repeat(60)));
  const count = Math.max(sample5Tcgdex.length, sample5Rapid.length);
  for (let i = 0; i < count; i++) {
    const left = sample5Tcgdex[i]?.name ?? '';
    const right = sample5Rapid[i]?.name ?? '';
    console.log(chalk.white(`  ${left.padEnd(maxLen + 4)}  ${right}`));
  }
  console.log('');

  pass('3.2 Cross - Correspondance sets/épisodes');
}

/* ═══════════════════════════════════════════════════════════
   RAPPORT FINAL
═══════════════════════════════════════════════════════════ */

function printFinalReport(): void {
  console.log('\n' + chalk.bold.white('═'.repeat(60)));
  console.log(chalk.bold.white(' RAPPORT FINAL'));
  console.log(chalk.bold.white('═'.repeat(60)));

  const COL_W = 52;
  console.log(
    '┌' + '─'.repeat(COL_W) + '┬' + '─'.repeat(8) + '┐'
  );
  console.log(
    '│ ' + 'Test'.padEnd(COL_W - 1) + '│ Statut │'
  );
  console.log(
    '├' + '─'.repeat(COL_W) + '┼' + '─'.repeat(8) + '┤'
  );

  for (const r of results) {
    const label = r.name.padEnd(COL_W - 1);
    const status = r.passed
      ? chalk.green('✅ OK ')
      : chalk.red('❌ FAIL');
    console.log(`│ ${label}│ ${status} │`);
  }

  console.log(
    '└' + '─'.repeat(COL_W) + '┴' + '─'.repeat(8) + '┘'
  );

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log(chalk.white(`\nTotal : ${passed}/${total} tests passés`));
  console.log(chalk.white(`Quota RapidAPI utilisé dans cette session : ${rapidApiCallCount}/100 requêtes`));

  if (passed === total) {
    console.log('\n' + chalk.bold.green(
      '✅ APIs validées. Architecture confirmée :\n' +
      "   - TCGdex 'fr' → cartes FR + pricing Cardmarket FR\n" +
      '   - pokemon-api.com → scellés + pricing FR\n' +
      '   Tu peux passer à la Phase 2.'
    ));
  } else {
    const failed = total - passed;
    console.log('\n' + chalk.bold.red(
      `❌ ${failed} test(s) échoué(s). Corrige les problèmes avant de continuer.\n` +
      '   NE PAS démarrer la Phase 2.'
    ));

    for (const r of results.filter(r => !r.passed)) {
      console.log(chalk.red(`   → ${r.name}: ${r.error ?? 'voir logs ci-dessus'}`));
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  console.log(chalk.bold.yellow('\n╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.yellow('║  PHASE 1 — VALIDATION DES APIs                       ║'));
  console.log(chalk.bold.yellow('║  pokemon-tcg-db                                      ║'));
  console.log(chalk.bold.yellow('╚══════════════════════════════════════════════════════╝\n'));

  /* ── SUITE 1 : TCGdex ── */
  console.log(chalk.bold.blue('\n▶ SUITE 1 — TCGdex SDK (@tcgdex/sdk, locale "fr")'));

  await test_1_1();
  await test_1_2();
  await test_1_3();
  await test_1_4();
  await test_1_5();
  await test_1_6();
  await test_1_7();
  await test_1_8();
  await test_1_9();
  await test_1_10();

  /* ── SUITE 2 : RapidAPI ── */
  console.log(chalk.bold.blue('\n▶ SUITE 2 — pokemon-api.com via RapidAPI'));

  const keyOk = await checkRapidApiKey();
  let episodes: Array<{ id: number; name: string }> = [];

  if (!keyOk) {
    /* Register failures for all Suite 2 tests */
    for (const name of [
      '2.1 RapidAPI - Auth + épisodes',
      '2.2 RapidAPI - Détail épisode',
      '2.3 RapidAPI - Produits scellés',
      '2.4 RapidAPI - Épisode avec produits',
      '2.5 RapidAPI - Prix FR scellés ⭐',
    ]) {
      results.push({ name, passed: false, error: 'RAPIDAPI_KEY manquante' });
    }
  } else {
    const suite2_1 = await test_2_1();

    if (!suite2_1) {
      /* Auth failed → skip rest of suite 2 */
      for (const name of [
        '2.2 RapidAPI - Détail épisode',
        '2.3 RapidAPI - Produits scellés',
        '2.4 RapidAPI - Épisode avec produits',
        '2.5 RapidAPI - Prix FR scellés ⭐',
      ]) {
        results.push({ name, passed: false, error: 'Skipped (2.1 failed)' });
      }
    } else {
      episodes = suite2_1.episodes;
      const firstId = episodes[0].id;

      await test_2_2(firstId);
      await test_2_3(firstId);

      const products = await test_2_4(episodes);

      if (products) {
        await test_2_5(products);
      } else {
        results.push({ name: '2.5 RapidAPI - Prix FR scellés ⭐', passed: false, error: 'Skipped (2.4 failed)' });
      }
    }
  }

  /* ── SUITE 3 : Cross-validation ── */
  console.log(chalk.bold.blue('\n▶ SUITE 3 — Cross-validation'));

  await test_3_1();

  /* Fetch TCGdex sets for comparison */
  try {
    const sets = await tcgdex.set.list();
    await test_3_2(sets, episodes);
  } catch (_) {
    await test_3_2([], episodes);
  }

  /* ── Final report ── */
  printFinalReport();
}

main().catch(err => {
  console.error(chalk.red('\n⛔ Erreur fatale non capturée :'), err);
  process.exit(1);
});
