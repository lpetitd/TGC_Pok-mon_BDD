/**
 * Cardmarket pricing for a sealed product.
 * Field names are the exact keys returned by pokemon-tcg-api.p.rapidapi.com.
 * Note: the spec used "lowest_near_mint_FR" but the real API field is "lowest_FR".
 */
export interface SealedPricingCardmarket {
  currency: 'EUR';
  /** Global lowest price (all regions). */
  lowest: number | null;
  /** Lowest price restricted to EU sellers only. */
  lowest_EU_only: number | null;
  /** Lowest price from French sellers (primary market for FR pricing). */
  lowest_FR: number | null;
  lowest_FR_EU_only: number | null;
  lowest_DE: number | null;
  lowest_DE_EU_only: number | null;
  lowest_ES: number | null;
  lowest_ES_EU_only: number | null;
  lowest_IT: number | null;
  lowest_IT_EU_only: number | null;
}

/** Represents a sealed Pokemon TCG product (ETB, booster box, tripack, etc.) from pokemon-api.com. */
export interface SealedProduct {
  /** Numeric id from pokemon-api.com. */
  id: number;
  name: string;
  /** Product category (ETB, Booster Box, etc.) — may be absent in API response. */
  productType?: string | null;
  /** pokemon-api.com episode id this product belongs to. */
  episodeId: string;
  /** Episode/serie name for visual cross-reference. */
  serieName: string;
  image?: string | null;
  /** Cardmarket prices with per-country breakdown. */
  pricesCardmarket?: SealedPricingCardmarket | null;
  /** TCGPlayer prices (if present). */
  pricesTcgplayer?: Record<string, unknown> | null;
  /** Complete raw API response stored as JSON. */
  rawData?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}
