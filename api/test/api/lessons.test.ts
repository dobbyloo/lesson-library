import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { loadFixture } from '../helpers/fixture.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ pool: db() });
  await app.ready();
});
afterAll(() => app.close());
beforeEach(() => loadFixture(db()));

// app.inject() sends a request through Fastify without opening a network port.
function getLesson(code: string) {
  return app.inject({ method: 'GET', url: `/api/v1/lessons/${code}` });
}

describe('GET /api/v1/lessons/:code', () => {
  test('returns the lesson with its subject, unit, and teacher fields', async () => {
    const response = await getLesson('MATH-U1-L1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expect.any(Number),
      code: 'MATH-U1-L1',
      title: 'Comparing Fractions',
      subject: { id: expect.any(Number), title: 'Math' },
      unit: { id: expect.any(Number), title: 'Unit 1: Fractions' },
      lesson_unit_sequence: 1,
      objective: 'Compare two fractions with unlike denominators.',
      key_questions: 'How do you know which fraction is larger?',
      teaching_notes: 'Watch for students comparing only the denominators.',
      total_minutes: 45,
    });
  });

  test('returns the blocks in order, each with the ids of its materials', async () => {
    const lesson = (await getLesson('MATH-U1-L1')).json();
    const stripsId = lesson.materials[0].id;

    expect(lesson.blocks).toEqual([
      { id: expect.any(Number), block_sequence: 1, minutes: 10, name: 'Warm-up', description: null, material_ids: [] },
      { id: expect.any(Number), block_sequence: 2, minutes: 20, name: 'Mini-lesson', description: 'Model with fraction strips.', material_ids: [stripsId] },
      { id: expect.any(Number), block_sequence: 3, minutes: 15, name: 'Independent practice', description: null, material_ids: [] },
    ]);
  });

  test('returns the materials attached to the lesson', async () => {
    const lesson = (await getLesson('MATH-U1-L1')).json();

    expect(lesson.materials).toEqual([
      {
        id: expect.any(Number),
        title: 'Fraction strips',
        material_type: 'Worksheet',
        start_page: null,
        end_page: null,
        link: 'https://example.com/fraction-strips.pdf',
        add_prep_task: true,
      },
    ]);
  });

  test('returns each assignment once, with a list of its roles in this lesson', async () => {
    const givenOut = (await getLesson('MATH-U1-L1')).json();
    const practiceBlock = givenOut.blocks.find((block: { name: string }) => block.name === 'Independent practice');
    const assignment = {
      id: expect.any(Number),
      title: 'Comparing fractions practice',
      kind: 'formative',
      setting: 'either',
      is_group: false,
      details: null,
      material_id: null,
      due_in_school_days: 1,
    };
    expect(givenOut.assignments).toEqual([
      { ...assignment, roles: [{ role: 'assigned', block_id: practiceBlock.id }] },
    ]);

    // the same assignment shows up on the lesson where it is collected, with that role
    const collected = (await getLesson('MATH-U2-L1')).json();
    expect(collected.assignments).toEqual([{ ...assignment, roles: [{ role: 'due', block_id: null }] }]);
    expect(collected.assignments[0].id).toBe(givenOut.assignments[0].id);
  });

  test('an assignment with several roles in one lesson is one entry, roles in the order they happen', async () => {
    // also collect and work on the fixture's assignment in the lesson that gives it out;
    // inserted in the wrong order on purpose
    await db().query(
      `INSERT INTO lesson_assignments (lesson_id, assignment_id, role, block_id)
       SELECT l.id, a.id, new_role.role, NULL
       FROM lessons l, assignments a, (VALUES ('working'), ('due')) AS new_role (role)
       WHERE l.code = 'MATH-U2-L1' AND a.title = 'Comparing fractions practice'
       ON CONFLICT DO NOTHING`,
    );

    const lesson = (await getLesson('MATH-U2-L1')).json();

    expect(lesson.assignments).toHaveLength(1);
    expect(lesson.assignments[0].roles).toEqual([
      { role: 'working', block_id: null },
      { role: 'due', block_id: null },
    ]);
  });

  test('assignments are listed by title', async () => {
    await db().query(
      `WITH new_assignment AS (
           INSERT INTO assignments (title, kind, setting) VALUES ('A warm-up exit ticket', 'formative', 'exit_ticket')
           RETURNING id
       )
       INSERT INTO lesson_assignments (lesson_id, assignment_id, role)
       SELECT l.id, new_assignment.id, 'assigned' FROM lessons l, new_assignment WHERE l.code = 'MATH-U1-L1'`,
    );

    const lesson = (await getLesson('MATH-U1-L1')).json();

    expect(lesson.assignments.map((assignment: { title: string }) => assignment.title)).toEqual([
      'A warm-up exit ticket',
      'Comparing fractions practice',
    ]);
  });

  test('a standalone lesson has no unit and empty lists', async () => {
    const response = await getLesson('MATH-REVIEW');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      code: 'MATH-REVIEW',
      unit: null,
      lesson_unit_sequence: null,
      objective: null,
      total_minutes: 0,
      blocks: [],
      materials: [],
      assignments: [],
    });
  });

  test('lookup ignores case and returns the code as stored', async () => {
    for (const code of ['math-u1-l1', 'Math-U1-l1']) {
      const response = await getLesson(code);
      expect(response.statusCode, code).toBe(200);
      expect(response.json().code).toBe('MATH-U1-L1');
    }
  });

  test('an unknown code returns 404', async () => {
    const response = await getLesson('MATH-U9-L9');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'No lesson with code "MATH-U9-L9".' });
  });

  test('a code that could never be valid returns 400', async () => {
    const response = await getLesson('MATH_U1');

    expect(response.statusCode).toBe(400);
  });

  test('the response is limited to the fields in the schema', async () => {
    const lesson = (await getLesson('MATH-U1-L1')).json();

    // airtable_id and the timestamps are columns on lessons but not part of the API
    expect(Object.keys(lesson).sort()).toEqual([
      'assignments', 'blocks', 'code', 'id', 'key_questions', 'lesson_unit_sequence', 'materials',
      'objective', 'subject', 'teaching_notes', 'title', 'total_minutes', 'unit',
    ]);
  });
});

describe('GET /api/v1/openapi.json', () => {
  test('documents the lesson endpoint with its request and response schemas', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    const operation = response.json().paths['/api/v1/lessons/{code}'].get;
    expect(operation.parameters[0]).toMatchObject({ name: 'code', in: 'path', required: true });
    expect(Object.keys(operation.responses)).toEqual(['200', '404']);
  });
});
