# First task: the thin slice

Goal: a working end-to-end slice, small enough to finish in a session or two, so there is a
visible result early.

## Done means

From a clean clone, `docker compose up -d` and `npm test` pass, and
`GET /api/v1/lessons/:code` returns a lesson with its blocks, materials, and assignments.

## Steps

1. Repo skeleton, with `docker-compose.yml` pinning `postgres:16`.
2. Migration runner, with `db/migrations/001_initial_schema.sql` as the first migration.
3. Test harness that creates a fresh database per run and isolates test files.
4. Port the schema behavior tests (below) to run in that harness.
5. A small hand-written fixture: one subject, two units, three lessons (one standalone), a few
   blocks, a material, an assignment. Tests look rows up by code or title, never by id.
6. Test first, then implement `GET /api/v1/lessons/:code`:
   - returns the lesson, its blocks in order, its materials, and its assignments with roles;
   - lookup ignores case;
   - unknown code returns 404;
   - request and response have schemas.

## Schema behavior tests to port

These were verified on a throwaway Postgres 16 while designing the schema:
- A lesson cannot sit in a unit of a different subject.
- A unit that still has lessons cannot be deleted.
- `unit_id` and `lesson_unit_sequence` must be set together.
- Two lessons cannot share a position in a unit, but two can swap inside one transaction.
- Two sibling units cannot share a position, including top-level units; other subjects and
  other parents may reuse a position.
- Lesson codes are URL-safe and unique ignoring case.
- A block cannot be linked to a material of a different lesson, and a material cannot be
  linked to a block until it is attached to that lesson.
- `lesson_assignments`: role must be assigned, working, or due; a second `assigned` or
  second `due` row for the same assignment is rejected; several `working` rows are allowed;
  deleting a block clears `block_id` and keeps the link.
- `assignments.setting` accepts `exit_ticket` and rejects other values.
- `lesson_skill_positions`: ranks follow unit and lesson order regardless of insert order;
  a skill's lessons are ranked independently; standalone lessons rank last; swapping two
  lessons changes the ranks with no other update.
- Standard codes are unique ignoring case; deleting a skill removes its standard and
  material links but leaves other skills' lesson links alone.
- Deleting a lesson removes its prep tasks, blocks, and links.

## Before the first session (Laura)

1. Install Docker (Docker Desktop on Mac or Windows; Docker Engine plus the compose plugin on
   Linux). Check: `docker run hello-world` and `docker compose version`.
2. Create an empty GitHub repo and commit this pack as the first commit.
3. Start Claude Code in the repo and begin with: "Read CLAUDE.md and the docs, then plan the
   first task in docs/first-task.md. Show me the plan before writing code."
