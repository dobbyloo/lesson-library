# Schema decisions

The schema is the migrations in `db/migrations/`, starting with `001_initial_schema.sql`;
`db/schema.sql` is the generated result. This document says why it looks the way it does,
what was deliberately left out, and what the eventual Airtable import must handle.
Source: Laura's original draft, reviewed field by field against her Airtable base
(Lessons: 273 records, Skills: 73 records).

## Tables

**subjects, units, lessons.** Units form a tree (`units.parent_id`) because Airtable's Unit
field mixed levels (about 49 distinct strings mixing unit, module, and lesson). A lesson
belongs to at most one unit. `lessons.unit_id` is nullable so a lesson can be standalone.
Two paired-key constraints do real work:
- `lessons (unit_id, subject_id)` references `units (id, subject_id)`, so a lesson can only sit
  in a unit of its own subject.
- `unit_id` and `lesson_unit_sequence` are NULL together or set together. Positions are unique
  within a unit, and deferrable so two lessons can swap in one transaction. Unit positions
  work the same way among siblings (`NULLS NOT DISTINCT`, so top-level units are checked too).

`lessons.code` is a stable label and URL slug (letters, digits, hyphens; unique ignoring case).
Foreign keys never use it. `lessons.airtable_id` is temporary, for an idempotent import;
drop it after cutover.

**lesson_blocks.** Replaces Airtable's free-text Timeline. Total lesson minutes is
`SUM(minutes)`, never stored.

**materials, material_types, lesson_materials, block_materials.** `materials.add_prep_task`
says a material needs prep. `block_materials` links a material to a block, and by paired keys
the block must belong to the lesson and the material must already be attached to that lesson.
Resources lines in Airtable ("label | url | type") fit `materials` directly.

**assignments, lesson_assignments.** An assignment is a template: never submissions or scores.
`kind` is formative, assessment, or project. `setting` is `in_class`, `homework`, `either`, or
`exit_ticket` (an exit ticket is always done in class, at the end). `is_group` means students
work together. `due_in_school_days` counts school days after the assigned lesson (0 = same
day); a `due` link takes precedence. `lesson_assignments.role` is `assigned`, `working`, or
`due`, so one assignment can span lessons. An assignment is given out once and collected
once (partial unique indexes); it can be worked on across many lessons. `block_id` optionally
says which block, and the block must belong to the same lesson.

**skills, standards, skill_standards, lesson_skills, skill_materials.** A lesson has many
skills (116 of 251 skilled lessons have more than one) and a skill appears in many lessons.
`skills.domain` merges Airtable's ELA Strand and Domain, which were never both filled.
`skills.is_active` replaces a status; retire skills, don't delete them. Standards are their
own table (60 skills have codes, 49 distinct codes, 7 skills carry two). Anchor charts and
notebook inserts are materials, linked through `skill_materials`; the import creates the
"Anchor Chart" and "Notebook Insert" material types.

**lesson_skill_positions (view).** Where each lesson falls among the lessons teaching a
skill, 0 = first taught. Computed from unit order and lesson order, so it stays right when
lessons move. It replaces Airtable's First Introduction flag.

**prep_tasks.** Tasks not about a material ("book the laptop cart", "cut string into 3 m
lengths"). Belongs to the lesson that needs the prep, shown only while that lesson is
scheduled and upcoming. Print-and-copy prep is generated from materials via `add_prep_task`.

**users, user_sessions.** Added in `20261010212240_create_users_and_sessions.sql`, for
logging in. `users` holds teachers only: `role` has a check that allows just `teacher`, and
no default, so every insert has to say which role it grants. Students never have a row here
(the hard rule); a future student app keeps its own accounts and calls the API with a token.
`username` is 3 to 30 characters: a lowercase letter, then lowercase letters, digits, dot,
underscore, or hyphen. `user_sessions` has one row per logged-in browser. It stores
`token_hash`, a hash of the session token, never the token itself, so a leaked backup cannot
be used to log in. A session lasts a fixed time from login (`expires_at`), and `created_at`
is the login time. Deleting a user deletes their sessions.

## Decisions and rejected alternatives

- Prerequisites are not stored. Within a unit, sequence says it; between units, unit order
  says it. Math WIN enrichment lessons live in their own units with their own sequence
  (matching the "Unit 2 Enrichment Queue" structure), Reading WIN units will be novel studies,
  and a general WIN subject holds unordered one-offs. When a WIN lesson runs is a scheduling
  decision. If a pointer is ever needed, add a nullable `follows_lesson_id` then.
- First Introduction flag dropped (see the view). In the data, 28 of 64 Yes lessons had
  several skills, so the flag was ambiguous, and 19 skills had more than one Yes lesson.
- Standards are a table, not generic tags. Their data lives on skills, they need a
  description, and a free-text tag type loses constraints. Add `tags` and `lesson_tags` when a
  real tag use appears; add `lesson_standards` if a lesson ever needs a standard its skills lack.
- `teaching_notes` stays a single text column. A comments-style table was considered and
  deferred. Block-level notes are also deferred.
- `key_questions` stays on lessons. The separate exit ticket text column was dropped.
- Dropped for now, possibly added later: differentiation support and extension, condensed
  version notes. Dropped: Revision Notes (91, archive them), Strategies (empty).
- Glue-in status ("has this notebook insert been glued in this year?") is state that resets
  each school year, so it does not belong on skills, materials, or links. Plan: in the
  scheduling phase, a `school_years` table plus a table of (school year, material) rows
  meaning "glued in". A new year starts empty, nothing to reset, history kept. The skill-level
  Glue-In Lesson field (6 skills) is dropped.
- Completion of prep tasks and anything else tied to a school year is scheduling state, not
  curriculum, and is not in this schema.
- Role is one column on `users`, not a `roles` table with a `user_roles` link. Only one role
  can exist in this database, the role names live in code either way, and the link would cost
  two joins on every request. An `admin` role, if a colleague ever gets an account, is one
  more value in the check, with the code treating admin as including teacher. A Postgres enum
  was also rejected: the rest of the schema uses text with a check, and an enum is harder to
  change.
- Usernames are stored in lowercase only, enforced by the format check, so each username has
  one spelling and a plain unique constraint is enough. The login code lowercases what was
  typed. Rejected: a unique index on `lower(username)` (as lesson codes have), because a
  username has no spelling worth preserving and every lookup would have to remember
  `lower()`; and `citext`, which needs an extension.
- The session token is stored only as a hash. Which hash function is decided with the guard.
- No `last_used_at` on sessions. It would allow expiry after inactivity and show which
  sessions are still active, at the cost of a write on read requests. A fixed lifetime is
  enough for one teacher; add the column if that changes.

## Import notes (for later; do not migrate data yet)

- Codes: all 273 are unique, also ignoring case. `SCI-U4M1L2-D06a` has a lowercase suffix.
  SEL families are different units, so a bulk rename collides on W1 and W2: `SEL-RESP-W1..W4`
  = Respect, `SEL-RESPON-W1..W2` = Responsibility, `SEL-KIND-W1..W2` and `SEL-START-W1` =
  Kindness Kickoff. The cleanup needs an explicit old-to-new map.
- Units: split the mixed strings into a tree.
- Placeholder lessons standing in for many lessons (an Airtable record-limit workaround) should
  not be imported as lessons; expand them later. Known: `WS-ALL` (all 30 Word Study module
  weeks), probably the two Procedures & Routines lessons, the Reading WIN lesson, and
  `WIN-NTS` (the Number the Stars study, whose prep covers several lessons). Weekly SEL
  lessons hold five days each.
- Prep tasks (81): do not copy "Print X, class set" tasks, since the material flag generates
  them. Flag any task that says "for D##" or "for Day #": it belongs on the lesson with the
  deadline. Skip "None beyond the standing packet print."
- Standards: split the `·`-separated codes (7 skills), flag `5.A.1.a` (missing `MA.` prefix),
  and expect grade 4 codes on prerequisite-review skills.
- Prerequisites: report any link that unit order does not explain.
- Archive, don't import: Revision Notes, First Introduction values, Glue-In Lesson links (6),
  WIN-to-Math prerequisite links (about 23), the free-text Materials field unless Laura
  decides it is worth keeping (a `materials_note` column could hold it).
- Skills: 71 active, 2 retired. Anchor Chart Link on 13, Notebook Insert on 19.
- Assignments (60 entries, 44 Math): about two in five involve work belonging to another lesson.
