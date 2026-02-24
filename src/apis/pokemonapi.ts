import * as dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';
const RAPIDAPI_HOST = 'pokemon-tcg-api.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

/*
 * Path to the daily quota counter file.
 * Resets automatically when the date changes.
 */
const COUNTER_PATH = path.join(__dirname, '../../data/.api-counter.json');

interface QuotaCounter {
  date: string;
  count: number;
}

/* Hard limits */
const QUOTA_WARN = 80;
const QUOTA_HARD_STOP = 95;
/* Minimum delay between consecutive RapidAPI calls (ms). */
const CALL_DELAY_MS = 500;

/* ─────────────────────────────────────────────
   Quota tracker
───────────────────────────────────────────── */

/** Reads the quota counter from disk, resetting if the date has changed. */
function readCounter(): QuotaCounter {
  const today = new Date().toISOString().slice(0, 10);

  if (!fs.existsSync(COUNTER_PATH)) {
    return { date: today, count: 0 };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf-8')) as QuotaCounter;
    if (raw.date !== today) {
      return { date: today, count: 0 };
    }
    return raw;
  } catch {
    return { date: today, count: 0 };
  }
}

/** Writes the quota counter to disk. */
function writeCounter(counter: QuotaCounter): void {
  const dir = path.dirname(COUNTER_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(counter, null, 2), 'utf-8');
}

/** Returns current quota usage for today. */
export function getQuotaUsed(): number {
  return readCounter().count;
}

/** Returns remaining allowed calls today (hard stop buffer included). */
export function getQuotaRemaining(): number {
  return QUOTA_HARD_STOP - readCounter().count;
}

/**
 * Manually sets the quota counter to a given value for today.
 * Use this to sync with the real RapidAPI backoffice count when the
 * local counter is out of sync (e.g. calls made outside this app).
 * Clamps the value between 0 and 100.
 */
export function setQuotaCount(count: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const clamped = Math.max(0, Math.min(100, Math.round(count)));
  writeCounter({ date: today, count: clamped });
}

/* ─────────────────────────────────────────────
   Axios instance + interceptors
───────────────────────────────────────────── */

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  },
  timeout: 15000,
});

/** Last call timestamp for enforcing minimum delay. */
let lastCallAt = 0;

/**
 * Makes a GET request to the RapidAPI endpoint with:
 *   - Quota enforcement (hard stop at 95)
 *   - Minimum 500ms delay between calls
 *   - Quota counter increment + persist
 *   - Warning log at 80
 * Returns the full axios response data.
 */
async function apiGet(urlPath: string): Promise<unknown> {
  const counter = readCounter();

  if (counter.count >= QUOTA_HARD_STOP) {
    throw new Error(
      `⛔ RapidAPI quota hard stop: ${counter.count}/${QUOTA_HARD_STOP} calls used today. ` +
      `Try again tomorrow.`
    );
  }

  /* Enforce minimum delay */
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < CALL_DELAY_MS) {
    await new Promise(r => setTimeout(r, CALL_DELAY_MS - elapsed));
  }

  counter.count++;
  writeCounter(counter);
  lastCallAt = Date.now();

  if (counter.count === QUOTA_WARN) {
    console.warn(`⚠  RapidAPI: ${counter.count} calls used today — approaching limit of 100.`);
  }

  const res = await http.get(urlPath);

  /* Log remaining quota after each call */
  const remaining = QUOTA_HARD_STOP - counter.count;
  if (remaining <= 20) {
    console.warn(`⚠  RapidAPI: ${remaining} calls remaining today (quota ${counter.count}/${QUOTA_HARD_STOP}).`);
  }

  return res.data;
}

/* ─────────────────────────────────────────────
   Response shapes
───────────────────────────────────────────── */

export interface EpisodeBrief {
  id: number;
  name: string;
  slug: string;
  released_at: string;
  logo?: string | null;
  code: string;
  cards_total: number;
  cards_printed_total: number;
  game?: Record<string, unknown>;
  series?: Record<string, unknown>;
}

export interface ProductRaw {
  id: number;
  name: string;
  slug?: string;
  cardmarket_id?: number | null;
  tcgplayer_id?: number | null;
  prices?: {
    cardmarket?: {
      currency: string;
      lowest?: number | null;
      lowest_EU_only?: number | null;
      lowest_FR?: number | null;
      lowest_FR_EU_only?: number | null;
      lowest_DE?: number | null;
      lowest_DE_EU_only?: number | null;
      lowest_ES?: number | null;
      lowest_ES_EU_only?: number | null;
      lowest_IT?: number | null;
      lowest_IT_EU_only?: number | null;
      [key: string]: unknown;
    };
    tcgplayer?: Record<string, unknown>;
  };
  episode?: Record<string, unknown>;
  image?: string | null;
  tcggo_url?: string;
  links?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    page?: number;
    pages?: number;
    limit?: number;
    [key: string]: unknown;
  };
  results?: number;
}

/* ─────────────────────────────────────────────
   Public API methods
───────────────────────────────────────────── */

/**
 * Fetches a single page of episodes.
 * Returns the raw paginated response so callers can decide pagination strategy.
 */
export async function getEpisodesPage(page = 1): Promise<PaginatedResponse<EpisodeBrief>> {
  const data = await apiGet(`/episodes?page=${page}`) as PaginatedResponse<EpisodeBrief>;
  return data;
}

/**
 * Fetches ALL episodes by paginating through all pages.
 * Each page costs one RapidAPI call.
 * @param maxCalls - Safety limit on API calls spent in this function (default 10).
 */
export async function getAllEpisodes(maxCalls = 10): Promise<EpisodeBrief[]> {
  const all: EpisodeBrief[] = [];
  let page = 1;

  while (true) {
    if (getQuotaRemaining() <= 0) {
      console.warn('⚠  Quota exceeded — stopping episode pagination early.');
      break;
    }

    const res = await getEpisodesPage(page);
    const items = res.data ?? [];
    all.push(...items);

    /* Stop if: no items, no paging info, or last page reached */
    const paging = res.paging;
    const totalPages = paging?.pages ?? 1;
    if (items.length === 0 || page >= totalPages || page >= maxCalls) break;
    page++;
  }

  return all;
}

/** Returns a single episode by id. */
export async function getEpisode(id: number): Promise<EpisodeBrief | null> {
  const data = await apiGet(`/episodes/${id}`) as { data?: EpisodeBrief };
  return data?.data ?? null;
}

/**
 * Fetches products for a given episode (single page, 20 items by default).
 * Products do NOT paginate in the observed API behaviour —
 * all products for an episode are returned in one call.
 */
export async function getEpisodeProducts(episodeId: number): Promise<ProductRaw[]> {
  const data = await apiGet(`/episodes/${episodeId}/products`) as PaginatedResponse<ProductRaw>;
  return data.data ?? (Array.isArray(data) ? (data as ProductRaw[]) : []);
}
