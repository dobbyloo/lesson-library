import { Type, type Static, type TSchema } from 'typebox';

// Request and response shapes for the lesson endpoints. Fastify validates requests against
// these, serializes responses through them, and the OpenAPI document is generated from them.
//
// Serializing through the schema means a field is only sent if it is listed here. That is
// the guard for teacher-only data: a future student role gets its own, smaller schema, and
// a new column never leaks by default.

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

export const LessonParams = Type.Object({
  // same rule as the lessons_code_format constraint
  code: Type.String({ pattern: '^[A-Za-z0-9-]+$', maxLength: 100 }),
});

const Block = Type.Object({
  id: Type.Integer(),
  block_sequence: Type.Integer(),
  minutes: Type.Integer(),
  name: Type.String(),
  description: Nullable(Type.String()),
  // ids of entries in the lesson's materials list
  material_ids: Type.Array(Type.Integer()),
});

const Material = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  material_type: Nullable(Type.String()),
  start_page: Nullable(Type.String()),
  end_page: Nullable(Type.String()),
  link: Nullable(Type.String()),
  add_prep_task: Nullable(Type.Boolean()),
});

// What an assignment is doing in this lesson. block_id says which block, when known; it
// belongs to the role because the same assignment can be worked on in one block and
// collected in another.
const AssignmentRole = Type.Object({
  role: Type.Union([Type.Literal('assigned'), Type.Literal('working'), Type.Literal('due')]),
  block_id: Nullable(Type.Integer()),
});

// One entry per assignment, however many roles it has in this lesson.
const LessonAssignment = Type.Object({
  id: Type.Integer(),
  title: Nullable(Type.String()),
  kind: Type.Union([
    Type.Literal('formative'),
    Type.Literal('assessment'),
    Type.Literal('project'),
  ]),
  setting: Type.Union([
    Type.Literal('in_class'),
    Type.Literal('homework'),
    Type.Literal('either'),
    Type.Literal('exit_ticket'),
  ]),
  is_group: Type.Boolean(),
  details: Nullable(Type.String()),
  material_id: Nullable(Type.Integer()),
  due_in_school_days: Nullable(Type.Integer()),
  // in the order things happen: assigned, working, due
  roles: Type.Array(AssignmentRole),
});

// The teacher's view of a lesson: includes key_questions and teaching_notes.
export const LessonDetail = Type.Object({
  id: Type.Integer(),
  code: Type.String(),
  title: Type.String(),
  subject: Type.Object({ id: Type.Integer(), title: Type.String() }),
  unit: Nullable(Type.Object({ id: Type.Integer(), title: Type.String() })),
  lesson_unit_sequence: Nullable(Type.Integer()),
  objective: Nullable(Type.String()),
  key_questions: Nullable(Type.String()),
  teaching_notes: Nullable(Type.String()),
  // the sum of the blocks' minutes; never stored
  total_minutes: Type.Integer(),
  blocks: Type.Array(Block),
  materials: Type.Array(Material),
  assignments: Type.Array(LessonAssignment),
});
export type LessonDetail = Static<typeof LessonDetail>;

// The shape Fastify itself uses for error responses.
export const ErrorResponse = Type.Object({
  statusCode: Type.Integer(),
  error: Type.String(),
  message: Type.String(),
});
