# Lesson Library

A self-hosted lesson library for Laura's 5th-grade classroom (Gretna, NE). It replaces her
Airtable "Lesson Library" base after a one-time cutover. Until then Airtable stays the only
editing surface and source of truth, and nothing in this repo writes to it.

It is also how Laura keeps her programming skills sharp. She is a full-stack developer
(strongest in front end; JavaScript, TypeScript, PHP, Python). Prefer plain, readable code
and explain non-obvious choices over clever abstractions.

## How we work

- Laura designs; the agent critiques with evidence and builds. Honest, constructive
  feedback beats agreement. Engage directly; no flattery.
- American spelling ("practice", not "practise").
- Test-first for the data layer and the API. Tests run against a real throwaway Postgres
  (Docker). Do not mock the database; the valuable bugs here are constraint and query bugs.
- Verify, don't reason. Run the thing. If a test result is suspect, say so and rerun it
  properly. Known trap: failed inserts still consume identity values, so tests must look
  rows up by code or title and never hardcode ids.
- Record decisions in `docs/`, not in chat. Update `docs/schema-decisions.md` when the
  schema changes and add a migration (`npm run migrate -- new <name>`); never edit an
  applied migration. After adding one, run `npm run schema:dump` and commit `db/schema.sql`.
- Code style is Prettier's (`.prettierrc.json`). Run `npm run format` before committing; CI
  fails on unformatted files.
- When finishing a piece of work, say which files changed.

## Commit messages

- Subject: a plain imperative sentence, capitalized, no period, about 60 characters or fewer
  ("Add GET /api/v1/lessons/:code"). No `feat:` / `fix:` prefixes; there is no changelog or
  release tooling for them to feed.
- Body, only when the reason is not obvious: a blank line, then why the change was made or
  what was rejected. The diff already shows what changed.
- One logical change per commit. Tests go in the same commit as the code they test. A schema
  change commits its migration, the regenerated `db/schema.sql`, and the
  `docs/schema-decisions.md` update together.

## Stack (see docs/architecture.md for the why)

- API: Fastify + TypeScript, plain SQL (no ORM), request/response schemas (TypeBox)
  that also produce OpenAPI. Paths are versioned: `/api/v1/...`.
- Database: PostgreSQL 15 or newer (the schema uses `NULLS NOT DISTINCT` and
  `ON DELETE SET NULL (column)`). Develop on 16 in Docker Compose. Production: managed Postgres.
- Teacher app: SvelteKit (Svelte 5) calling the API.
- Docker: Compose for local Postgres from day one; a Dockerfile for the app at deploy time.
- Repo: one repo, npm workspaces, `api/` now and `web/` later. Tests: Vitest. Migrations:
  dbmate (`npm run migrate`). CI: GitHub Actions runs the typecheck and tests on every push.
  SQL driver: `pg`. JSON field names are snake_case, matching the columns.
- No auth exists yet; the API listens on localhost only. Auth is the next task.

## Hard rules

- Assignments are templates. No student submissions, scores, names, or any student data in
  this database, ever. A future student app keeps its own store and refers to assignments by id.
- Foreign keys use `id`. `lessons.code` is a label and URL slug, never a key.
- Teacher-only fields (`teaching_notes`, `key_questions`, `prep_tasks`, and anything not
  listed as student-visible) must never be exposed to a student role.
- Any hosted software that students touch must be COPPA compliant. See
  docs/architecture.md, "Future student app".

## Naming

Tables are plural nouns. Child and link tables are the owner in the singular followed by the
thing it holds in the plural (`lesson_blocks`, `block_materials`, `lesson_assignments`),
whatever the cardinality. Foreign key columns are `<singular table>_id`. All snake_case.

## Where things are

- `db/migrations/` SQL migrations (dbmate format). `001_initial_schema.sql` is the full base
  schema; later files have timestamp names.
- `db/schema.sql` generated dump of the current schema. Never edit it by hand.
- `api/src/` the API: `routes/`, `schemas/` (TypeBox), `queries/` (SQL). `api/test/` the tests;
  `api/test/helpers/` holds the test database setup and the fixture.
- `docs/schema-decisions.md` why each table exists, what was dropped or deferred, and notes
  for the eventual data import.
- `docs/architecture.md` stack decisions and the future student app.
- `docs/first-task.md` the first piece of work.

## Out of scope for now

Migrating data from Airtable (later, after the app exists), scheduling and the school
calendar, the student app, differentiation and condensed-version notes.
