/** Represents a TCGdex set (individual release), e.g. "Épée et Bouclier", "Évolutions Célestes". */
export interface Serie {
  id: string;
  name: string;
  /** Foreign key → blocks.id */
  blockId: string;
  cardCountTotal?: number | null;
  cardCountOfficial?: number | null;
  logo?: string | null;
  symbol?: string | null;
  releaseDate?: string | null;
  rawData?: Record<string, unknown> | null;
  updatedAt?: string;
}
