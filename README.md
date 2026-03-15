# npmdex

A better npm package search engine. Provides more relevant search results, rich metadata (GitHub stats, TypeScript support, download trends), and a single quality/health score per package.

## Architecture

npmdex is a monorepo with five packages:

| Package           | Description                                                         | Runtime         |
| ----------------- | ------------------------------------------------------------------- | --------------- |
| **api**           | Express REST API serving search queries via RediSearch              | Cloud           |
| **web**           | React + Vite frontend                                               | Cloud           |
| **index-service** | Crawls npm registry, enriches with GitHub data, builds Redis index  | Local/scheduled |
| **score-service** | Computes quality/health scores for packages                         | Local/scheduled |
| **shared**        | Database schema (Drizzle ORM), types, and DB/Redis client factories | Library         |

**Data flow:** `index-service` crawls npm → writes to PostgreSQL → `score-service` scores packages → `index-service --build-index` pushes data to Redis → `api` queries Redis → `web` displays results.

## Prerequisites

- Node.js 24+
- Docker (for PostgreSQL and Redis Stack)

- GitHub personal access token (optional, increases API rate limits)

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Optionally add your `GITHUB_TOKEN` to `.env` for higher API rate limits.

### 3. Start infrastructure

```bash
docker compose up postgres redis -d
```

This starts PostgreSQL on port 5432 and Redis Stack on port 6379 (with RedisInsight UI on port 8001).

### 4. Run database migrations

```bash
yarn workspace @npmdex/shared db:push
```

### 5. Build the search index

These are CLI tools you run as-needed or on a schedule:

```bash
# Full sync from npm registry (first run)
yarn workspace @npmdex/index-service start --full-sync

# Incremental sync (subsequent runs)
yarn workspace @npmdex/index-service start --incremental

# Enrich packages with GitHub metadata
yarn workspace @npmdex/index-service start --enrich-github

# Score all packages
yarn workspace @npmdex/score-service start

# Build the Redis search index
yarn workspace @npmdex/index-service start --build-index
```

Use `--max-packages <num>` to limit the number of packages processed (useful for testing).

### 6. Start the API

```bash
yarn workspace @npmdex/api start
```

Runs on http://localhost:3001. Search endpoint: `GET /api/search?q=express&sort=relevance&page=1&limit=20`

### 7. Start the frontend

```bash
yarn workspace @npmdex/web dev
```

Runs on http://localhost:3000 and proxies `/api` requests to the API.

## Docker

Build and run the API + Redis with Docker Compose:

```bash
docker compose up --build
```

This starts:

- **Redis Stack** on ports 6379 and 8001 (RedisInsight)
- **API** on port 3001

The web frontend is not included in the Docker setup — run it separately with `yarn workspace @npmdex/web dev`.

## Environment Variables

| Variable       | Default                                                | Description                           |
| -------------- | ------------------------------------------------------ | ------------------------------------- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/npmdex` | PostgreSQL connection string          |
| `REDIS_HOST`   | `localhost`                                            | Redis hostname                        |
| `REDIS_PORT`   | `6379`                                                 | Redis port                            |
| `GITHUB_TOKEN` | —                                                      | GitHub PAT for higher API rate limits |
| `PORT`         | `3001`                                                 | API server port                       |

## Development

```bash
# Type-check all packages
yarn typecheck

# Lint
yarn lint

# Format check / auto-fix
yarn format
yarn format:fix
```

### Database

The shared package uses Drizzle ORM. To modify the schema:

```bash
# Edit packages/shared/src/schema.ts, then:
yarn workspace @npmdex/shared db:generate  # generate migration SQL
yarn workspace @npmdex/shared db:migrate   # run migrations
yarn workspace @npmdex/shared db:push      # or push directly
```

### Project Structure

```
packages/
├── api/              # Express search API
├── web/              # React + Vite frontend
├── index-service/    # npm crawler, GitHub enricher, Redis indexer
├── score-service/    # Package quality scorer
└── shared/           # Schema, types, DB/Redis clients
```

## Scoring Algorithm

Each package gets an overall score (0–100) composed of:

- **Popularity** (40%) — weekly downloads + GitHub stars (log scale)
- **Maintenance** (30%) — last commit recency + open issues ratio
- **Quality** (30%) — TypeScript support, license, description quality, dependency count

## Search API

```
GET /api/search
```

| Param   | Default     | Description                                              |
| ------- | ----------- | -------------------------------------------------------- |
| `q`     | —           | Search query                                             |
| `page`  | `1`         | Page number                                              |
| `limit` | `20`        | Results per page (1–100)                                 |
| `sort`  | `relevance` | `relevance`, `downloads`, `score`, `stars`, or `updated` |

## License

MIT License. See [LICENSE](LICENSE) for details.
