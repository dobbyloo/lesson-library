# Lesson Library

A self-hosted lesson library for a 5th-grade classroom. See `CLAUDE.md` for how the project
is run and `docs/` for the decisions behind it.

## Requirements

- Node 22 or newer
- Docker with the compose plugin

## Run the tests

```sh
npm install
docker compose up -d
npm test
```

The tests create and drop their own databases (`lesson_library_test_*`) on the Compose
Postgres. They never touch the development database.

## Run the API

```sh
npm run migrate     # apply db/migrations to the development database
npm run seed        # optional: load the small test fixture
npm run dev         # http://localhost:3000, restarts on change
```

```sh
curl http://localhost:3000/api/v1/lessons/MATH-U1-L1
curl http://localhost:3000/api/v1/openapi.json
```

## Other commands

| Command | What it does |
|---|---|
| `npm run migrate -- status` | Show applied and pending migrations |
| `npm run migrate -- new add_something` | Create an empty, timestamped migration file in `db/migrations/` |
| `npm run schema:dump` | Rewrite `db/schema.sql` from the migrations; run after adding one, and commit the result |
| `npm run format` | Format every file with Prettier (`npm run format:check` only reports) |
| `npm run typecheck` | Check the TypeScript without running it |
| `npm run test:watch -w api` | Rerun tests as files change |
| `npm run db:down` | Stop Postgres (data is kept) |
| `docker compose down -v` | Stop Postgres and delete the development data |

To use a different database or port, copy `.env.example` to `.env`.
