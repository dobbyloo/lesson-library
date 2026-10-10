# Architecture

## Decisions

| Area | Decision | Why |
|---|---|---|
| Language | TypeScript on API and web | Laura's strongest ground; shared types |
| API | Fastify, plain SQL, schema-validated, `/api/v1` | The API will have more than one client (teacher app, later a student app), so it stands alone |
| Database access | `pg`, no ORM | The schema uses composite foreign keys, deferrable constraints, and a view; an ORM hides them |
| Migrations | SQL files run by dbmate, in file name order; the base schema is `001_initial_schema.sql` | Gives the schema a history |
| Teacher app | SvelteKit (Svelte 5), calling the API | Laura has used it; signals model; plain HTML/CSS/JS feel |
| Tests | Against a real throwaway Postgres | Constraint and query bugs are the real risk |
| Auth | Roles from day one: `teacher` (full access) and `student` (read-only, field-limited) | Adding roles later is much harder. Only `teacher` exists at first |
| Hosting | Container-friendly host (Fly.io, Railway, Render, or a VPS) with managed Postgres | Backups are the part most likely to go wrong |
| Docker | Compose for local Postgres now; app Dockerfile at deploy time | Pins Postgres 15+, one-command throwaway databases |

Considered and rejected: Kubernetes (far too much for one user), serverless (a long-running
API with a database is simpler as a container), SvelteKit as the whole app (the API needs
to serve a second client).

## Decided during the first task (October 2026)

| Area | Decision | Why |
|---|---|---|
| Repo layout | One repo, npm workspaces: `api/` now, `web/` when the teacher app starts; `db/` and `docs/` at the root | One clone, one `npm test`, shared types later |
| Test runner | Vitest | Runs TypeScript directly, isolates each test file in its own worker, and SvelteKit uses it too |
| Migration tool | dbmate, installed through npm | Plain SQL files, no JavaScript migration format |
| CI | GitHub Actions: typecheck and tests on every push, against the Compose Postgres | The same database setup as local |
| SQL driver | `pg` | The most widely documented; plain parameterized queries |
| Schemas | TypeBox (the `typebox` package) with `@fastify/swagger` | Fastify's native path: one definition validates, types, and documents. OpenAPI is served at `/api/v1/openapi.json` |

How these fit together:

- **dbmate.** Each migration file has a `-- migrate:up` and a `-- migrate:down` section. dbmate
  takes the version from the leading digits of the file name and applies files in name
  order. `001_initial_schema.sql` keeps its name; every later migration uses dbmate's own
  timestamp name (`npm run migrate -- new add_something` creates
  `20261010203908_add_something.sql`), which sorts after `001`. No renaming by hand, and two
  branches cannot both claim the same number. It records applied versions in a
  `schema_migrations` table. Everything calls dbmate through
  `api/src/migrate.ts`. Migration 001 has no rollback; drop the database instead.
- **Schema dump.** `db/schema.sql` is the whole current schema in one file, committed so it
  can be read and so each schema change shows up as a diff. `npm run schema:dump` writes it:
  it migrates a scratch database from nothing and runs `pg_dump` inside the Compose
  container. dbmate's built-in dump is switched off (`--no-dump-schema`) because it needs
  `pg_dump` installed on the host. Run the command after adding a migration; CI regenerates
  the file and fails if the committed one is out of date.
- **Test databases.** One `vitest run` migrates a template database once with dbmate. Each
  test file then creates its own database as a copy of the template and drops it at the end,
  so files are isolated and can run in parallel. Every table is emptied before each test.
  Identity counters are not reset, so ids are never predictable.
- **Teacher-only fields.** Responses are serialized through their schema, so a column is sent
  only if the schema lists it. `GET /api/v1/lessons/:code` currently uses the teacher schema
  (it includes `key_questions` and `teaching_notes`). A student role must get its own schema.
- **JSON field names are snake_case**, the same as the columns. Rows go from SQL to JSON with
  no mapping layer, so a column, a schema field, and a field in the web app are always the
  same word. Rejected: camelCase with a mapper, which adds a place for fields to be
  misspelled or forgotten and buys only style.
- **Response shapes for a lesson.** Materials are listed once on the lesson; each block
  carries `material_ids` pointing into that list, and the client does the lookup. Rejected:
  nesting full materials inside each block, which repeats data. Each assignment appears once,
  with `roles`, a list of `{ role, block_id }` ordered assigned, working, due. `block_id`
  sits on the role because one assignment can be worked on in one block and collected in
  another.
- **No auth yet.** The dev server listens on 127.0.0.1 only, and every caller gets the teacher
  schema. Auth is the next task: a `teacher` role checked on every request, before the
  teacher app and before any deployment. How to log in is not decided.

## Future student app

Not being built yet. Constraints to remember when it is:

- It must be COPPA compliant. The FTC treats persistent identifiers (a session cookie, an IP
  address) as personal information, not only what a child types. A school may consent for
  parents in an educational context, but the operator stays responsible for compliance and
  may use the data only for the school's educational purpose. The FTC rule was amended in
  April 2025; read the current rule before building.
- Laura's district practice: approved apps go through a process where the vendor's COPPA
  documents are sent to the tech staff. Apps are fine as long as no identifying information
  goes in; students can have accounts with first name only. Laura normally creates unique
  usernames and easy-to-remember passwords. A class code is an alternative.
- A self-hosted, teacher-built tool has no vendor to supply those documents. Before building,
  ask the district's technology staff whether they would approve one and what they would need.
  Likely documents: what is collected, how long it is kept, that nothing goes to third parties,
  how a student's data is deleted.
- Keep it minimal: no analytics, no ads, no third-party scripts on student pages; short log
  retention (logs hold IP addresses); a way to show what is stored and delete it.
- The student app keeps its own data store. This lesson-library database never holds student data.
- Two students can share a first name. Disambiguate with a teacher-assigned username or
  number, not a last initial.
- Student accounts make security a real job: hashed passwords, HTTPS, login rate limiting, backups.
