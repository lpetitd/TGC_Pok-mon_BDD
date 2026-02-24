/**
 * Pricing data from Cardmarket for a French-locale card.
 * Field names are the exact keys returned by TCGdex API with locale 'fr'.
 */
export interface CardPricingCardmarket {
  unit: 'EUR';
  /** Cardmarket internal product id. */
  idProduct?: number | null;
  /** Direct URL to the card's Cardmarket product page. */
  url?: string | null;
  avg: number | null;
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  'avg-holo': number | null;
  'low-holo': number | null;
  'trend-holo': number | null;
  'avg1-holo': number | null;
  'avg7-holo': number | null;
  'avg30-holo': number | null;
  updated: string;
}

/** Pricing data from TCGPlayer (USD). Structure varies by card type. */
export type CardPricingTcgplayer = Record<string, unknown>;

/** Represents a single Pokemon TCG card with French name and Cardmarket FR pricing. */
export interface Card {
  /** Full TCGdex card id, e.g. "swsh1-1", "sv01-001". */
  id: string;
  /** Card number as printed on the card, e.g. "1", "001". */
  localId: string;
  /** Card name in French. */
  name: string;
  /** Base image URL from TCGdex (without quality/extension suffix). */
  image?: string | null;
  /** Full-size image URL (600×825 webp). */
  imageHigh?: string | null;
  /** Thumbnail image URL (245×337 webp). */
  imageLow?: string | null;
  rarity?: string | null;
  /** Foreign key → series.id (TCGdex set id). */
  setId: string;
  /** Direct URL to the card's Cardmarket product page. */
  cardmarketUrl?: string | null;
  /** Cardmarket pricing for the French version of this card. */
  pricingCardmarket?: CardPricingCardmarket | null;
  /** TCGPlayer pricing (USD). May be absent. */
  pricingTcgplayer?: CardPricingTcgplayer | null;
  /** Complete raw API response stored as JSON. */
  rawData?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}
