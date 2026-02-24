import TCGdex, { Query } from '@tcgdex/sdk';

/*
 * TCGdex SDK wrapper.
 * Locale is ALWAYS 'fr' — this determines which Cardmarket version is queried.
 * 'fr' → French card prices. Never change to 'en'.
 * Cache TTL: 24h (86400s) to minimise network calls between runs.
 */
const client = new TCGdex('fr');
client.setCacheTTL(86400);

/* Re-export Query for use in importers/CLI without importing the SDK directly. */
export { Query };

/* ─────────────────────────────────────────────
   Serie (bloc) endpoints
───────────────────────────────────────────── */

/** Returns all TCGdex series (blocs). */
export const listSeries = () => client.serie.list();

/** Returns a single serie (bloc) with its sets list. */
export const getSerie = (id: string) => client.serie.get(id);

/* ─────────────────────────────────────────────
   Set (serie) endpoints
───────────────────────────────────────────── */

/** Returns all TCGdex sets (series). */
export const listSets = () => client.set.list();

/** Returns a single set with its card list (brief cards). */
export const getSet = (id: string) => client.set.get(id);

/* ─────────────────────────────────────────────
   Card endpoints
───────────────────────────────────────────── */

/** Returns a full card object including pricing. */
export const getCard = (id: string) => client.card.get(id);

/** Returns a list of card briefs matching the given Query filter. */
export const listCards = (query?: Query) =>
  query ? client.card.list(query) : client.card.list();

export default client;
