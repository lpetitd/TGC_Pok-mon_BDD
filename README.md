# pokemon-tcg-db

Base de données locale pour les cartes et produits scellés Pokémon TCG, avec pricing Cardmarket FR.

---

## Sources de données

| Source | Usage | Clé API |
|--------|-------|---------|
| **TCGdex SDK** (`@tcgdex/sdk`, locale `fr`) | Blocs, séries, cartes + prix Cardmarket FR | Non requise |
| **pokemon-api.com** (via RapidAPI) | Produits scellés uniquement (ETB, Display, Coffret…) + prix FR | `RAPIDAPI_KEY` requise |

> **Important :** TCGdex est toujours initialisé en `fr`. Cela détermine quelle version de carte est interrogée sur Cardmarket — les prix retournés correspondent aux cartes françaises, pas anglaises.

---

## Installation

```bash
npm install
```

Créer un fichier `.env` à la racine du projet (copier `.env.example`) :

```env
RAPIDAPI_KEY=ta_clé_rapidapi_ici
```

---

## Structure du projet

```
src/
├── tests/
│   └── api-validation.ts     ← Validation des APIs (Phase 1)
├── apis/
│   ├── tcgdex.ts             ← Wrapper SDK TCGdex (locale fr, cache 24h)
│   └── pokemonapi.ts         ← Client RapidAPI + tracker de quota
├── db/
│   ├── schema.ts             ← Schéma SQLite
│   └── database.ts           ← Connexion + fonctions CRUD
├── models/
│   ├── Block.ts              ← Bloc (= Serie TCGdex, ex: "Épée et Bouclier")
│   ├── Serie.ts              ← Série (= Set TCGdex, ex: "Évolutions Célestes")
│   ├── Card.ts               ← Carte + pricing Cardmarket FR
│   └── SealedProduct.ts      ← Produit scellé + prix FR
├── importers/
│   ├── cardsImporter.ts      ← Import cartes (TCGdex uniquement)
│   └── sealedImporter.ts     ← Import scellés (RapidAPI uniquement)
├── snapshots/
│   └── snapshotManager.ts    ← Snapshots de prix (lecture DB, pas d'API)
├── cli/
│   └── index.ts              ← CLI principal
└── index.ts
data/
├── pokemon-tcg.db            ← Base SQLite (créée automatiquement)
├── .api-counter.json         ← Compteur quota RapidAPI du jour
└── export/                   ← Fichiers JSON exportés
```

---

## Commandes

Toutes les commandes se lancent avec :
```bash
npx ts-node src/cli/index.ts <commande> [options]
```

Ou via les scripts npm définis dans `package.json`.

---

### `validate`
Relance la suite de tests de validation des APIs (17 tests).
Vérifie que TCGdex et RapidAPI répondent correctement avant tout import.

```bash
npx ts-node src/cli/index.ts validate
# ou
npm run validate
```

---

### `import:cards`
Importe les blocs, séries et cartes depuis TCGdex avec pricing Cardmarket FR.

```bash
# Importer un set spécifique
npx ts-node src/cli/index.ts import:cards --set swsh1
npx ts-node src/cli/index.ts import:cards --set sv01

# Importer tous les sets (182 sets, peut prendre du temps)
npx ts-node src/cli/index.ts import:cards
# ou
npm run import:cards

# Forcer le reimport des données déjà présentes
npx ts-node src/cli/index.ts import:cards --set swsh1 --full

# Simuler sans écrire en base
npx ts-node src/cli/index.ts import:cards --set swsh1 --dry-run
```

**Options :**
| Option | Description |
|--------|-------------|
| `--set <id>` | Importer seulement ce set (ex: `swsh1`, `sv01`, `sv03.5`) |
| `--full` | Réimporter même les données déjà présentes en base |
| `--dry-run` | Simuler l'import sans rien écrire en base |

> **IDs de sets utiles :**
> - Épée et Bouclier : `swsh1` à `swsh12`, `swsh12pt5`
> - Écarlate et Violet : `sv01`, `sv02`, `sv03`, `sv03.5` (151), `sv04`…

---

### `import:sealed`
Importe les produits scellés depuis pokemon-api.com via RapidAPI.
**Chaque appel consomme 1 requête sur le quota de 100/jour.**

```bash
# Importer les scellés d'un épisode spécifique
npx ts-node src/cli/index.ts import:sealed --episode 396

# Importer tous les épisodes (attention au quota !)
npx ts-node src/cli/index.ts import:sealed
# ou
npm run import:sealed

# Forcer le reimport
npx ts-node src/cli/index.ts import:sealed --episode 396 --full

# Simuler sans écrire en base
npx ts-node src/cli/index.ts import:sealed --episode 396 --dry-run
```

**Options :**
| Option | Description |
|--------|-------------|
| `--episode <id>` | Importer seulement cet épisode RapidAPI (ex: `396`) |
| `--full` | Réimporter même les produits déjà présents |
| `--dry-run` | Simuler sans écrire en base |

---

### `import:all`
Importe tout en une seule commande (cartes TCGdex + scellés RapidAPI).

```bash
npx ts-node src/cli/index.ts import:all
npm run import:all

# Avec reimport forcé
npx ts-node src/cli/index.ts import:all --full
```

---

### `stats`
Affiche les statistiques de la base de données et le quota RapidAPI restant.

```bash
npx ts-node src/cli/index.ts stats
npm run stats
```

Exemple de sortie :
```
  Blocs    : 19
  Séries   : 182
  Cartes   : 12 847
  Scellés  : 340
  Quota RapidAPI aujourd'hui : 11/100 (84 restants avant arrêt)

┌──────┬──────────────────────┬──────┬────────┐
│ Bloc │ Nom                  │ Sets │ Cartes │
├──────┼──────────────────────┼──────┼────────┤
│ sv   │ Écarlate et Violet   │ 17   │ 3 420  │
│ swsh │ Épée et Bouclier     │ 18   │ 3 156  │
│ ...  │ ...                  │ ...  │ ...    │
└──────┴──────────────────────┴──────┴────────┘
```

---

### `list:blocs`
Liste tous les blocs présents en base.

```bash
npx ts-node src/cli/index.ts list:blocs
```

---

### `list:series`
Liste les séries (sets), optionnellement filtrées par bloc.

```bash
# Toutes les séries
npx ts-node src/cli/index.ts list:series

# Séries d'un bloc spécifique
npx ts-node src/cli/index.ts list:series --bloc sv
npx ts-node src/cli/index.ts list:series --bloc swsh
```

---

### `list:cards`
Liste les cartes (50 max par affichage), filtrées par série optionnellement.

```bash
# Toutes les cartes (affiche les 50 premières)
npx ts-node src/cli/index.ts list:cards

# Cartes d'un set spécifique
npx ts-node src/cli/index.ts list:cards --serie swsh1
npx ts-node src/cli/index.ts list:cards --serie sv01
```

---

### `list:sealed`
Liste les produits scellés (50 max), filtrés par épisode optionnellement.

```bash
# Tous les scellés
npx ts-node src/cli/index.ts list:sealed

# Scellés d'un épisode spécifique
npx ts-node src/cli/index.ts list:sealed --serie 396
```

---

### `export:json`
Exporte les données de la base en fichiers JSON dans `data/export/`.

```bash
# Exporter cartes ET scellés
npx ts-node src/cli/index.ts export:json
npm run export

# Exporter seulement les cartes
npx ts-node src/cli/index.ts export:json --type cards

# Exporter seulement les scellés
npx ts-node src/cli/index.ts export:json --type sealed
```

Les fichiers sont nommés avec un horodatage : `cards-2026-02-24T11-30-00-000Z.json`

---

### `quota:set`
Synchronise le compteur local avec le backoffice RapidAPI.
À utiliser quand des appels ont été faits en dehors de cette application.

```bash
# Si le backoffice RapidAPI affiche 11/100
npx ts-node src/cli/index.ts quota:set 11
```

> Le compteur se remet automatiquement à 0 le lendemain.
> L'application s'arrête automatiquement à 95 requêtes pour conserver une marge de 5.

---

## Quota RapidAPI

| Seuil | Comportement |
|-------|-------------|
| 80 requêtes | Avertissement dans la console |
| 95 requêtes | **Arrêt automatique** (toutes nouvelles requêtes bloquées) |
| 100 requêtes | Limite officielle du plan gratuit |

Le fichier `data/.api-counter.json` trace les appels du jour :
```json
{ "date": "2026-02-24", "count": 11 }
```

---

## Pricing

### Cartes (TCGdex, locale `fr`)
Champs disponibles dans `pricing_cardmarket` :

| Champ | Description |
|-------|-------------|
| `avg` | Prix moyen (toutes conditions) |
| `low` | Prix le plus bas |
| `trend` | Tendance du prix |
| `avg1` / `avg7` / `avg30` | Moyenne sur 1j / 7j / 30j |
| `avg-holo` / `trend-holo` / … | Variantes holo |
| `unit` | Toujours `"EUR"` |

### Produits scellés (RapidAPI)
Champs disponibles dans `prices_cardmarket` :

| Champ | Description |
|-------|-------------|
| `lowest_FR` | Prix le plus bas chez les vendeurs français |
| `lowest_FR_EU_only` | Idem, restreint aux vendeurs EU |
| `lowest` | Prix le plus bas toutes zones confondues |
| `lowest_DE` / `lowest_ES` / `lowest_IT` | Par pays |
| `currency` | Toujours `"EUR"` |

---

## Base de données SQLite

Fichier : `data/pokemon-tcg.db`

| Table | Contenu |
|-------|---------|
| `blocks` | Blocs (ères) — ex: Épée et Bouclier, Écarlate et Violet |
| `series` | Sets — ex: Évolutions Célestes, 151 |
| `cards` | Cartes avec pricing Cardmarket FR (JSON) |
| `sealed_products` | Produits scellés avec prix FR (JSON) |
| `price_snapshots` | Snapshots de prix horodatés (un par item par jour) |
| `api_quota` | Historique quota RapidAPI |

---

## Snapshots de prix

Les snapshots permettent de suivre l'évolution des prix dans le temps sans modifier la donnée courante.

### Principe

- Un snapshot capture les prix d'un item à la **date du jour**.
- **Un seul snapshot par item par jour** : relancer la commande le même jour écrase le précédent.
- Les données sont lues depuis la base locale — **aucun appel API n'est consommé**.

### `snapshot:take`
Enregistre un snapshot des prix actuels.

```bash
# Snapshot de tout le catalogue (cartes + scellés)
npx ts-node src/cli/index.ts snapshot:take
npx ts-node src/cli/index.ts snapshot:take --all

# Snapshot des cartes d'un set spécifique
npx ts-node src/cli/index.ts snapshot:take --set sv01

# Snapshot des scellés d'un épisode spécifique
npx ts-node src/cli/index.ts snapshot:take --episode 396
```

**Options :**
| Option | Description |
|--------|-------------|
| `--set <id>` | Seulement les cartes de ce set |
| `--episode <id>` | Seulement les scellés de cet épisode |
| `--all` | Tout le catalogue |

---

### `snapshot:history`
Affiche l'évolution des prix d'une carte ou d'un scellé dans le temps.

```bash
# Historique d'une carte (auto-détecte le type)
npx ts-node src/cli/index.ts snapshot:history --id sv01-001
npx ts-node src/cli/index.ts snapshot:history --id swsh1-1

# Historique d'un produit scellé
npx ts-node src/cli/index.ts snapshot:history --id 31390
npx ts-node src/cli/index.ts snapshot:history --id 31390 --type sealed
```

**Options :**
| Option | Description |
|--------|-------------|
| `--id <id>` | **Requis** — id carte (ex: `sv01-001`) ou scellé (ex: `31390`) |
| `--type card\|sealed` | Type de l'item (auto-détecté si absent : id numérique → sealed) |

Exemple de sortie (carte) :
```
  Historique des prix — Florizarre ex (card)
┌────────────┬──────┬──────┬───────┬──────┬───────┬──────────┐
│ Date       │ avg  │ low  │ trend │ avg7 │ avg30 │ avg-holo │
├────────────┼──────┼──────┼───────┼──────┼───────┼──────────┤
│ 2026-02-20 │ 4.50 │ 3.80 │ 4.20  │ 4.30 │ 4.10  │ —        │
│ 2026-02-24 │ 4.65 │ 3.90 │ 4.35  │ 4.45 │ 4.20  │ —        │
└────────────┴──────┴──────┴───────┴──────┴───────┴──────────┘
  2 snapshot(s) au total.
```

---

### `snapshot:stats`
Affiche un résumé du nombre de snapshots enregistrés.

```bash
npx ts-node src/cli/index.ts snapshot:stats
```

---

### Workflow recommandé

```bash
# 1. Importer les données (une fois, ou régulièrement pour les mises à jour)
npx ts-node src/cli/index.ts import:all

# 2. Prendre un snapshot des prix du jour (sans consommer de quota API)
npx ts-node src/cli/index.ts snapshot:take --all

# 3. Consulter l'évolution d'un item
npx ts-node src/cli/index.ts snapshot:history --id sv01-001
```

> **Astuce :** Automatiser `snapshot:take --all` chaque jour (via cron ou planificateur Windows) pour constituer un historique de prix.
