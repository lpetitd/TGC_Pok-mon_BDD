import * as dotenv from 'dotenv';
dotenv.config();

import chalk from 'chalk';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { initDatabase, listBlocks, listSeries as dbListSeries, listCards, listSealedProducts, getStats, countCards, countSealedProducts, getPriceHistory, countSnapshots, countSnapshotItems, getLatestSnapshotDate } from '../db/database';
import { importAllCards, importCardsForSet } from '../importers/cardsImporter';
import { importAllSealed, importSealedForEpisode } from '../importers/sealedImporter';
import { getQuotaUsed, getQuotaRemaining, setQuotaCount } from '../apis/pokemonapi';
import { takeSnapshots } from '../snapshots/snapshotManager';
import type { SnapshotItemType } from '../models/PriceSnapshot';

/* ─────────────────────────────────────────────
   Arg parsing
───────────────────────────────────────────── */

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[2] ?? 'help';
  const rest = argv.slice(3);
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function printHeader(title: string): void {
  console.log(chalk.bold.cyan(`\n${'─'.repeat(54)}`));
  console.log(chalk.bold.cyan(` ${title}`));
  console.log(chalk.bold.cyan(`${'─'.repeat(54)}`));
}

function printTable(rows: string[][]): void {
  if (rows.length === 0) return;
  const widths = rows[0].map((_, ci) => Math.max(...rows.map(r => String(r[ci] ?? '').length)));
  const sep = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const top = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const bot = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  const fmt = (row: string[], isHeader = false) => {
    const cells = row.map((c, ci) => ` ${String(c).padEnd(widths[ci])} `).join('│');
    return isHeader ? chalk.bold('│' + cells + '│') : '│' + cells + '│';
  };

  console.log(top);
  console.log(fmt(rows[0], true));
  console.log(sep);
  rows.slice(1).forEach(r => console.log(fmt(r)));
  console.log(bot);
}

/* ─────────────────────────────────────────────
   Commands
───────────────────────────────────────────── */

/** Spawns the Phase 1 validation script as a child process. */
function runValidate(): void {
  const script = path.join(__dirname, '../tests/api-validation.ts');
  const tsNodeBin = path.join(__dirname, '../../node_modules/.bin/ts-node');
  const child = spawn(process.execPath, [tsNodeBin, script], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
}

async function runImportCards(flags: Record<string, string | boolean>): Promise<void> {
  const setId = typeof flags.set === 'string' ? flags.set : undefined;
  const opts = { full: !!flags.full, dryRun: !!flags['dry-run'] };

  if (setId) {
    await importCardsForSet(setId, opts);
  } else {
    await importAllCards(opts);
  }
}

async function runImportSealed(flags: Record<string, string | boolean>): Promise<void> {
  const episodeId = typeof flags.episode === 'string' ? parseInt(flags.episode, 10) : undefined;
  const opts = { full: !!flags.full, dryRun: !!flags['dry-run'] };

  if (episodeId && !isNaN(episodeId)) {
    await importSealedForEpisode(episodeId, opts);
  } else {
    await importAllSealed(opts);
  }
}

async function runImportAll(flags: Record<string, string | boolean>): Promise<void> {
  const opts = { full: !!flags.full, dryRun: !!flags['dry-run'] };
  await importAllCards(opts);
  await importAllSealed(opts);
}

function runStats(): void {
  initDatabase();
  const stats = getStats();

  printHeader('Statistiques de la base de données');

  console.log(chalk.white(`\n  Blocs    : ${stats.blockCount}`));
  console.log(chalk.white(`  Séries   : ${stats.serieCount}`));
  console.log(chalk.white(`  Cartes   : ${stats.cardCount}`));
  console.log(chalk.white(`  Scellés  : ${stats.sealedCount}`));
  console.log(chalk.white(`  Quota RapidAPI aujourd'hui : ${getQuotaUsed()}/100 (${getQuotaRemaining()} restants avant arrêt)\n`));

  if (stats.cardsByBlock.length > 0) {
    printTable([
      ['Bloc', 'Nom', 'Sets', 'Cartes'],
      ...stats.cardsByBlock.map(b => [b.blockId, b.blockName, String(b.serieCount), String(b.cardCount)]),
    ]);
  }
}

function runListBlocs(): void {
  initDatabase();
  const blocs = listBlocks();

  printHeader(`Blocs (${blocs.length})`);
  if (blocs.length === 0) {
    console.log(chalk.gray('  Aucun bloc en base. Lancez : import:cards'));
    return;
  }
  printTable([
    ['ID', 'Nom', 'Type'],
    ...blocs.map(b => [b.id, b.name, b.type]),
  ]);
}

function runListSeries(flags: Record<string, string | boolean>): void {
  initDatabase();
  const blocId = typeof flags.bloc === 'string' ? flags.bloc : undefined;
  const series = dbListSeries(blocId);

  const title = blocId ? `Séries du bloc "${blocId}" (${series.length})` : `Séries (${series.length})`;
  printHeader(title);

  if (series.length === 0) {
    console.log(chalk.gray('  Aucune série en base. Lancez : import:cards'));
    return;
  }
  printTable([
    ['ID', 'Nom', 'Bloc', 'Cartes'],
    ...series.map(s => [s.id, s.name, s.blockId, String(s.cardCountTotal ?? '?')]),
  ]);
}

function runListCards(flags: Record<string, string | boolean>): void {
  initDatabase();
  const serieId = typeof flags.serie === 'string' ? flags.serie : undefined;
  const cards = listCards(serieId);

  const title = serieId ? `Cartes de la série "${serieId}" (${cards.length})` : `Cartes (${cards.length})`;
  printHeader(title);

  if (cards.length === 0) {
    console.log(chalk.gray('  Aucune carte en base. Lancez : import:cards'));
    return;
  }
  printTable([
    ['ID', 'Nom', 'Rareté', 'Prix avg (€)'],
    ...cards.slice(0, 50).map(c => [
      c.id,
      c.name,
      c.rarity ?? '—',
      c.pricingCardmarket?.avg != null ? String(c.pricingCardmarket.avg) : '—',
    ]),
  ]);
  if (cards.length > 50) {
    console.log(chalk.gray(`  … et ${cards.length - 50} autres. Utilisez --serie <id> pour filtrer.`));
  }
}

function runListSealed(flags: Record<string, string | boolean>): void {
  initDatabase();
  const episodeId = typeof flags.serie === 'string' ? flags.serie : undefined;
  const products = listSealedProducts(episodeId);

  const title = episodeId ? `Scellés épisode "${episodeId}" (${products.length})` : `Scellés (${products.length})`;
  printHeader(title);

  if (products.length === 0) {
    console.log(chalk.gray('  Aucun produit scellé en base. Lancez : import:sealed'));
    return;
  }
  printTable([
    ['ID', 'Nom', 'Épisode', 'Prix FR (€)'],
    ...products.slice(0, 50).map(p => [
      String(p.id),
      p.name.length > 40 ? p.name.slice(0, 37) + '…' : p.name,
      p.serieName,
      p.pricesCardmarket?.lowest_FR != null ? String(p.pricesCardmarket.lowest_FR) : '—',
    ]),
  ]);
  if (products.length > 50) {
    console.log(chalk.gray(`  … et ${products.length - 50} autres. Utilisez --serie <episodeId> pour filtrer.`));
  }
}

async function runExportJson(flags: Record<string, string | boolean>): Promise<void> {
  initDatabase();

  const type = typeof flags.type === 'string' ? flags.type : 'all';
  const exportDir = path.join(__dirname, '../../data/export');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const shouldExportCards = type === 'cards' || type === 'all';
  const shouldExportSealed = type === 'sealed' || type === 'all';

  if (shouldExportCards) {
    const cards = listCards();
    const filePath = path.join(exportDir, `cards-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cards, null, 2), 'utf-8');
    console.log(chalk.green(`✅ Cartes exportées : ${filePath} (${cards.length} cartes)`));
  }

  if (shouldExportSealed) {
    const sealed = listSealedProducts();
    const filePath = path.join(exportDir, `sealed-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sealed, null, 2), 'utf-8');
    console.log(chalk.green(`✅ Scellés exportés : ${filePath} (${sealed.length} produits)`));
  }
}

function runSnapshotTake(flags: Record<string, string | boolean>): void {
  initDatabase();

  const setId    = typeof flags.set     === 'string' ? flags.set     : undefined;
  const episodeId = typeof flags.episode === 'string' ? flags.episode : undefined;
  const all      = !!flags.all;

  if (!setId && !episodeId && !all) {
    /* Default: snapshot everything */
    console.log(chalk.cyan('\n📸 Snapshot de TOUS les prix (cartes + scellés)…'));
    const n = takeSnapshots({ all: true });
    console.log(chalk.green(`\n✅ ${n} snapshot(s) enregistrés pour aujourd'hui.`));
    return;
  }

  if (setId) {
    console.log(chalk.cyan(`\n📸 Snapshot des cartes du set "${setId}"…`));
  }
  if (episodeId) {
    console.log(chalk.cyan(`\n📸 Snapshot des scellés épisode "${episodeId}"…`));
  }
  if (all) {
    console.log(chalk.cyan('\n📸 Snapshot de TOUS les prix (cartes + scellés)…'));
  }

  const n = takeSnapshots({ setId, episodeId, all });
  console.log(chalk.green(`\n✅ ${n} snapshot(s) enregistrés pour aujourd'hui.`));
}

function runSnapshotHistory(flags: Record<string, string | boolean>): void {
  initDatabase();

  const id   = typeof flags.id   === 'string' ? flags.id   : undefined;
  const type = typeof flags.type === 'string' ? flags.type : undefined;

  if (!id) {
    console.log(chalk.red('  Usage : snapshot:history --id <id> [--type card|sealed]'));
    console.log(chalk.gray('  Exemples :'));
    console.log(chalk.gray('    snapshot:history --id sv01-001'));
    console.log(chalk.gray('    snapshot:history --id 31390 --type sealed'));
    process.exit(1);
  }

  /* Detect type from id if not specified: numeric ids → sealed */
  const resolvedType: SnapshotItemType =
    type === 'sealed' ? 'sealed' :
    type === 'card'   ? 'card'   :
    /^\d+$/.test(id)  ? 'sealed' : 'card';

  const rows = getPriceHistory(resolvedType, id);

  if (rows.length === 0) {
    console.log(chalk.yellow(`\n  Aucun historique de prix pour ${resolvedType} "${id}".`));
    console.log(chalk.gray('  Lancez d\'abord : snapshot:take'));
    return;
  }

  const itemName = rows[0].itemName ?? id;
  printHeader(`Historique des prix — ${itemName} (${resolvedType})`);

  if (resolvedType === 'card') {
    printTable([
      ['Date', 'avg', 'low', 'trend', 'avg7', 'avg30', 'avg-holo'],
      ...rows.map(r => [
        r.snapshotAt,
        r.avg    != null ? String(r.avg.toFixed(2))    : '—',
        r.low    != null ? String(r.low.toFixed(2))    : '—',
        r.trend  != null ? String(r.trend.toFixed(2))  : '—',
        r.avg7   != null ? String(r.avg7.toFixed(2))   : '—',
        r.avg30  != null ? String(r.avg30.toFixed(2))  : '—',
        r.avgHolo != null ? String(r.avgHolo.toFixed(2)) : '—',
      ]),
    ]);
  } else {
    printTable([
      ['Date', 'lowest_FR (€)', 'lowest (€)'],
      ...rows.map(r => [
        r.snapshotAt,
        r.lowestFr != null ? String(r.lowestFr.toFixed(2)) : '—',
        r.lowest   != null ? String(r.lowest.toFixed(2))   : '—',
      ]),
    ]);
  }

  console.log(chalk.gray(`\n  ${rows.length} snapshot(s) au total.`));
}

function runSnapshotStats(): void {
  initDatabase();
  const total    = countSnapshots();
  const items    = countSnapshotItems();
  const latest   = getLatestSnapshotDate();

  printHeader('Statistiques snapshots');
  console.log(chalk.white(`\n  Snapshots total   : ${total}`));
  console.log(chalk.white(`  Items suivis      : ${items}`));
  console.log(chalk.white(`  Dernier snapshot  : ${latest ?? '(aucun)'}\n`));
}

function printHelp(): void {
  printHeader('pokemon-tcg-db CLI');
  console.log(chalk.white(`
  Commandes disponibles :

  ${chalk.bold('validate')}
      Relance la Phase 1 de validation des APIs.

  ${chalk.bold('import:cards')} [--set <id>] [--full] [--dry-run]
      Importe les blocs, séries et cartes depuis TCGdex (FR).
      --set <id>   : seulement ce set (ex: swsh1, sv01)
      --full       : force le reimport des données existantes
      --dry-run    : simule sans écrire en base

  ${chalk.bold('import:sealed')} [--episode <id>] [--full] [--dry-run]
      Importe les produits scellés depuis pokemon-api.com.
      --episode <id> : seulement cet épisode RapidAPI
      --full         : force le reimport
      --dry-run      : simule sans écrire en base

  ${chalk.bold('import:all')} [--full]
      Importe tout (cartes + scellés).

  ${chalk.bold('export:json')} [--type cards|sealed]
      Exporte la base en JSON dans data/export/.

  ${chalk.bold('stats')}
      Affiche les comptages + quota API restant.

  ${chalk.bold('list:blocs')}
      Liste tous les blocs en base.

  ${chalk.bold('list:series')} [--bloc <id>]
      Liste les séries, optionnellement filtrées par bloc.

  ${chalk.bold('list:cards')} [--serie <id>]
      Liste les cartes (50 max), filtrées par série optionnellement.

  ${chalk.bold('list:sealed')} [--serie <episodeId>]
      Liste les scellés (50 max), filtrés par épisode optionnellement.

  ${chalk.bold('quota:set')} <n>
      Synchronise le compteur local avec le backoffice RapidAPI.
      Exemple : quota:set 11  (si le backoffice affiche 11/100)
      Le compteur se remet à 0 automatiquement le lendemain.

  ${chalk.bold('snapshot:take')} [--set <id>] [--episode <id>] [--all]
      Enregistre un snapshot des prix à la date du jour.
      Les prix sont lus depuis la DB (pas d'appel API).
      Un seul snapshot par item par jour (remplacement si relancé).
      Sans option : snapshot de tout (cartes + scellés).
      --set <id>      : seulement les cartes de ce set
      --episode <id>  : seulement les scellés de cet épisode
      --all           : tout le catalogue

  ${chalk.bold('snapshot:history')} --id <id> [--type card|sealed]
      Affiche l'évolution des prix d'un item dans le temps.
      --id <id>       : id de la carte (ex: sv01-001) ou du scellé (ex: 31390)
      --type          : "card" ou "sealed" (auto-détecté si absent)

  ${chalk.bold('snapshot:stats')}
      Affiche le nombre de snapshots enregistrés en base.
`));
}

/* ─────────────────────────────────────────────
   Main
───────────────────────────────────────────── */

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'validate':
      runValidate();
      break;

    case 'import:cards':
      await runImportCards(flags);
      break;

    case 'import:sealed':
      await runImportSealed(flags);
      break;

    case 'import:all':
      await runImportAll(flags);
      break;

    case 'export:json':
      await runExportJson(flags);
      break;

    case 'stats':
      runStats();
      break;

    case 'quota:set': {
      /* argv[3] is the positional arg (e.g. "quota:set 11") */
      const rawN = process.argv[3];
      const n = parseInt(rawN ?? '', 10);
      if (isNaN(n) || n < 0) {
        console.log(chalk.red('Usage : quota:set <nombre>  (ex: quota:set 11)'));
        process.exit(1);
      }
      setQuotaCount(n);
      console.log(chalk.green(`✅ Compteur RapidAPI mis à jour : ${n}/100`));
      console.log(chalk.gray(`   Arrêt automatique à 95. Il reste ${95 - n} appels autorisés aujourd'hui.`));
      break;
    }

    case 'snapshot:take':
      runSnapshotTake(flags);
      break;

    case 'snapshot:history':
      runSnapshotHistory(flags);
      break;

    case 'snapshot:stats':
      runSnapshotStats();
      break;

    case 'list:blocs':
      runListBlocs();
      break;

    case 'list:series':
      runListSeries(flags);
      break;

    case 'list:cards':
      runListCards(flags);
      break;

    case 'list:sealed':
      runListSealed(flags);
      break;

    case 'help':
    default:
      printHelp();
  }
}

main().catch(err => {
  console.error(chalk.red('\n⛔ Erreur fatale :'), err);
  process.exit(1);
});
