/** SQL DDL statements for the pokemon-tcg-db SQLite database. */

export const CREATE_BLOCKS = `
  CREATE TABLE IF NOT EXISTS blocks (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'card',
    created_at TEXT
  )
`;

export const CREATE_SERIES = `
  CREATE TABLE IF NOT EXISTS series (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    block_id            TEXT NOT NULL,
    card_count_total    INTEGER,
    card_count_official INTEGER,
    logo                TEXT,
    symbol              TEXT,
    release_date        TEXT,
    raw_data            JSON,
    updated_at          TEXT,
    FOREIGN KEY (block_id) REFERENCES blocks(id)
  )
`;

export const CREATE_CARDS = `
  CREATE TABLE IF NOT EXISTS cards (
    id                  TEXT PRIMARY KEY,
    local_id            TEXT,
    name                TEXT NOT NULL,
    image               TEXT,
    rarity              TEXT,
    set_id              TEXT NOT NULL,
    pricing_cardmarket  JSON,
    pricing_tcgplayer   JSON,
    raw_data            JSON,
    created_at          TEXT,
    updated_at          TEXT,
    FOREIGN KEY (set_id) REFERENCES series(id)
  )
`;

export const CREATE_SEALED_PRODUCTS = `
  CREATE TABLE IF NOT EXISTS sealed_products (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    product_type      TEXT,
    episode_id        TEXT,
    serie_name        TEXT,
    image             TEXT,
    prices_cardmarket JSON,
    prices_tcgplayer  JSON,
    raw_data          JSON,
    created_at        TEXT,
    updated_at        TEXT
  )
`;

export const CREATE_PRICE_SNAPSHOTS = `
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type   TEXT    NOT NULL,   -- 'card' | 'sealed'
    item_id     TEXT    NOT NULL,   -- card id (e.g. 'swsh1-1') or sealed product id
    snapshot_at TEXT    NOT NULL,   -- YYYY-MM-DD
    -- Card fields (tcgdex cardmarket)
    avg         REAL,
    low         REAL,
    trend       REAL,
    avg1        REAL,
    avg7        REAL,
    avg30       REAL,
    avg_holo    REAL,
    trend_holo  REAL,
    -- Sealed fields (rapidapi cardmarket)
    lowest_fr   REAL,
    lowest      REAL,
    -- Full pricing object for any future field
    raw_prices  JSON,
    UNIQUE (item_type, item_id, snapshot_at)
  )
`;

export const CREATE_INDEX_SNAPSHOTS_ITEM = `
  CREATE INDEX IF NOT EXISTS idx_snapshots_item
  ON price_snapshots(item_type, item_id, snapshot_at)
`;

export const CREATE_API_QUOTA = `
  CREATE TABLE IF NOT EXISTS api_quota (
    api        TEXT PRIMARY KEY,
    date       TEXT,
    count      INTEGER DEFAULT 0,
    updated_at TEXT
  )
`;

export const CREATE_INDEX_CARDS_SET_ID = `
  CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id)
`;

export const CREATE_INDEX_CARDS_RARITY = `
  CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity)
`;

export const CREATE_INDEX_SEALED_EPISODE_ID = `
  CREATE INDEX IF NOT EXISTS idx_sealed_episode_id ON sealed_products(episode_id)
`;

export const CREATE_INDEX_SEALED_PRODUCT_TYPE = `
  CREATE INDEX IF NOT EXISTS idx_sealed_product_type ON sealed_products(product_type)
`;

/** All DDL statements in execution order. */
export const ALL_DDL = [
  CREATE_BLOCKS,
  CREATE_SERIES,
  CREATE_CARDS,
  CREATE_SEALED_PRODUCTS,
  CREATE_PRICE_SNAPSHOTS,
  CREATE_API_QUOTA,
  CREATE_INDEX_CARDS_SET_ID,
  CREATE_INDEX_CARDS_RARITY,
  CREATE_INDEX_SEALED_EPISODE_ID,
  CREATE_INDEX_SEALED_PRODUCT_TYPE,
  CREATE_INDEX_SNAPSHOTS_ITEM,
];
