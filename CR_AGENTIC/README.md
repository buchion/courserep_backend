# CR_AGENTIC

Autonomous Academic Agent platform for Course Rep — microservices architecture with PostgreSQL/Prisma, BullMQ, Playwright browser workers, and AI processing pipelines.

## Services

| Service | Port | Description |
|---------|------|-------------|
| agent-api | 3100 | REST orchestration, JWT auth, outbox/events |
| browser-worker | — | Playwright LMS automation |
| ai-worker | — | Document extraction, summarize, flashcards, quiz |

## Quick start

```bash
cd CR_AGENTIC
cp .env.example .env
yarn install
yarn db:generate

# Start infrastructure
docker compose -f docker/docker-compose.agent.yml up -d agent-postgres agent-redis

# Run migrations
AGENT_DATABASE_URL=postgresql://agent:agent@localhost:5433/cr_agent?schema=public yarn db:migrate

# Build packages
yarn build:packages

# Run services (separate terminals)
yarn dev:agent-api
yarn dev:browser-worker
yarn dev:ai-worker
```

## Architecture

- **Agent DB**: PostgreSQL (Prisma) — agent-owned tables
- **Main API**: MySQL (TypeORM) — users, study plans, notifications via `/internal/*`
- **Queue**: BullMQ on Redis with `cr:agent:` prefix
- **Storage**: S3-compatible for documents and encrypted browser sessions

See `docs/architecture/` and the Phase 1 plan for full design details.
