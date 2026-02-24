/** Represents a TCGdex serie (era/bloc), e.g. "Épée et Bouclier" or "Écarlate et Violet". */
export interface Block {
  id: string;
  name: string;
  /** Always "card" for TCGdex-sourced blocs. */
  type: 'card';
  createdAt?: string;
}
