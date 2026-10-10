-- migrate:up

-- Lesson library schema. Requires PostgreSQL 15 or newer.

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE subjects (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title text NOT NULL
);

CREATE TABLE units (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    parent_id integer REFERENCES units(id) ON DELETE CASCADE,
    subject_id integer NOT NULL REFERENCES subjects(id),
    title text NOT NULL,
    unit_sequence integer NOT NULL,
    CONSTRAINT units_not_own_parent CHECK (parent_id IS DISTINCT FROM id),
    -- referenced as a pair by lessons
    CONSTRAINT units_id_subject_unique UNIQUE (id, subject_id),
    -- one unit per position among its siblings; NULLS NOT DISTINCT so top-level units
    -- (parent_id NULL) are checked too. Deferrable so positions can be swapped.
    CONSTRAINT units_position_unique UNIQUE NULLS NOT DISTINCT (subject_id, parent_id, unit_sequence)
        DEFERRABLE INITIALLY DEFERRED
);

-- unit_id NULL means a standalone lesson. The (unit_id, subject_id) pair must exist in
-- units, so a lesson can only sit in a unit of its own subject. A unit that still has
-- lessons cannot be deleted.
CREATE TABLE lessons (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    -- stable label used as the URL slug; foreign keys use id, never code
    code text NOT NULL,
    title text NOT NULL,
    subject_id integer NOT NULL REFERENCES subjects(id),
    unit_id integer,
    lesson_unit_sequence integer,
    objective text,
    key_questions text,
    teaching_notes text,
    -- temporary: matches rows to Airtable during the import; drop after cutover
    airtable_id text UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (unit_id, subject_id) REFERENCES units (id, subject_id)
        ON DELETE RESTRICT,
    CONSTRAINT lessons_code_format CHECK (code ~ '^[A-Za-z0-9-]+$'),
    -- a position only exists inside a unit
    CONSTRAINT lessons_unit_and_sequence_together
        CHECK ((unit_id IS NULL) = (lesson_unit_sequence IS NULL)),
    -- deferrable so positions can be swapped within one transaction
    CONSTRAINT lessons_unit_position_unique UNIQUE (unit_id, lesson_unit_sequence)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX lessons_code_lower_unique ON lessons (lower(code));
CREATE TRIGGER lessons_set_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE lesson_blocks (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    block_sequence integer NOT NULL,
    minutes integer NOT NULL CHECK (minutes > 0),
    name text NOT NULL,
    description text,
    CONSTRAINT lesson_blocks_order_unique UNIQUE (lesson_id, block_sequence)
        DEFERRABLE INITIALLY DEFERRED,
    -- referenced as a pair so links cannot cross lessons
    CONSTRAINT lesson_blocks_id_lesson_unique UNIQUE (id, lesson_id)
);

CREATE TABLE material_types (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title text NOT NULL,
    file_extension text
);

CREATE TABLE materials (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title text NOT NULL,
    material_type_id integer REFERENCES material_types(id),
    start_page text,
    end_page text,
    link text,
    add_prep_task BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER materials_set_updated_at BEFORE UPDATE ON materials
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE lesson_materials (
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    PRIMARY KEY (lesson_id, material_id)
);

-- lesson_id is repeated on purpose: the block must belong to the lesson, and the
-- material must already be attached to it.
CREATE TABLE block_materials (
    block_id integer NOT NULL,
    lesson_id integer NOT NULL,
    material_id integer NOT NULL,
    PRIMARY KEY (block_id, material_id),
    FOREIGN KEY (block_id, lesson_id) REFERENCES lesson_blocks (id, lesson_id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id, material_id) REFERENCES lesson_materials (lesson_id, material_id) ON DELETE CASCADE
);

-- A template of what is assigned, never student submissions or scores.
CREATE TABLE assignments (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title text,
    kind text NOT NULL CHECK (kind IN ('formative', 'assessment', 'project')),
    setting text NOT NULL CHECK (setting IN ('in_class', 'homework', 'either', 'exit_ticket')),
    is_group boolean NOT NULL DEFAULT FALSE,
    details text,
    material_id integer REFERENCES materials(id) ON DELETE SET NULL,
    -- school days after the assigned lesson (0 = same day); a 'due' link takes precedence
    due_in_school_days integer CHECK (due_in_school_days >= 0)
);

-- roles: assigned = given out, working = worked on, due = collected
CREATE TABLE lesson_assignments (
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    assignment_id integer NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('assigned', 'working', 'due')),
    block_id integer,
    PRIMARY KEY (lesson_id, assignment_id, role),
    FOREIGN KEY (block_id, lesson_id) REFERENCES lesson_blocks (id, lesson_id)
        ON DELETE SET NULL (block_id)
);
-- an assignment is given out once and collected once
CREATE UNIQUE INDEX lesson_assignments_one_assigned ON lesson_assignments (assignment_id) WHERE role = 'assigned';
CREATE UNIQUE INDEX lesson_assignments_one_due ON lesson_assignments (assignment_id) WHERE role = 'due';

-- domain is the subject area a skill belongs to: an ELA strand (W, RP) or a content area (Geometry).
CREATE TABLE skills (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title text NOT NULL,
    description text,
    i_can text,
    domain text,
    -- retire a skill instead of deleting it, so old lessons keep their links
    is_active boolean NOT NULL DEFAULT TRUE
);

CREATE TABLE standards (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    code text NOT NULL,
    description text
);
CREATE UNIQUE INDEX standards_code_lower_unique ON standards (lower(code));

CREATE TABLE skill_standards (
    skill_id integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    standard_id integer NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    PRIMARY KEY (skill_id, standard_id)
);

CREATE TABLE lesson_skills (
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    skill_id integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (lesson_id, skill_id)
);
CREATE INDEX lesson_skills_skill_id_idx ON lesson_skills (skill_id);

-- anchor charts and notebook inserts are materials; material_types says which kind
CREATE TABLE skill_materials (
    skill_id integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    PRIMARY KEY (skill_id, material_id)
);

-- Where each lesson falls among the lessons that teach a skill: 0 = first taught.
-- Computed from unit order and lesson order, so it stays correct when lessons move.
-- Lessons directly in a parent unit sort before lessons in its child units; standalone
-- lessons sort last.
CREATE VIEW lesson_skill_positions AS
WITH RECURSIVE unit_paths (id, path) AS (
    SELECT id, ARRAY[unit_sequence] FROM units WHERE parent_id IS NULL
    UNION ALL
    SELECT u.id, p.path || u.unit_sequence
    FROM units u JOIN unit_paths p ON u.parent_id = p.id
)
SELECT ls.skill_id,
       ls.lesson_id,
       row_number() OVER (
           PARTITION BY ls.skill_id
           ORDER BY up.path NULLS LAST, l.lesson_unit_sequence NULLS LAST, l.id
       ) - 1 AS position
FROM lesson_skills ls
JOIN lessons l ON l.id = ls.lesson_id
LEFT JOIN unit_paths up ON up.id = l.unit_id;

-- Prep for the lesson that needs it, not the lesson where the work happens. Shown only while
-- that lesson is scheduled and upcoming. Print-and-copy prep is generated from materials
-- (add_prep_task); this table holds the tasks that are not about a material.
CREATE TABLE prep_tasks (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    description text NOT NULL
);
CREATE INDEX prep_tasks_lesson_id_idx ON prep_tasks (lesson_id);

-- migrate:down

-- The base schema has no rollback. To start over, drop the database and migrate again.
