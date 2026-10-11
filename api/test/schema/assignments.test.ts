import { describe, expect, test } from 'vitest';
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
  insertAssignment,
  insertBlock,
  insertLesson,
  insertSubject,
} from '../helpers/rows.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();

function link(lessonId: number, assignmentId: number, role: string, blockId: number | null = null) {
  return db().query(
    'INSERT INTO lesson_assignments (lesson_id, assignment_id, role, block_id) VALUES ($1, $2, $3, $4)',
    [lessonId, assignmentId, role, blockId],
  );
}

// Three lessons in one subject and one assignment, enough for every test below.
async function setUp() {
  const math = await insertSubject(db(), 'Math');
  const day1 = await insertLesson(db(), { code: 'MATH-D1', subject_id: math });
  const day2 = await insertLesson(db(), { code: 'MATH-D2', subject_id: math });
  const day3 = await insertLesson(db(), { code: 'MATH-D3', subject_id: math });
  const assignment = await insertAssignment(db(), { title: 'Fraction project' });
  return { day1, day2, day3, assignment };
}

describe('lesson_assignments', () => {
  test('role must be assigned, working, or due', async () => {
    const { day1, assignment } = await setUp();

    for (const role of ['graded', 'Assigned', '']) {
      await expect(link(day1, assignment, role), `role "${role}"`).rejects.toMatchObject({
        code: CHECK_VIOLATION,
        constraint: 'lesson_assignments_role_check',
      });
    }
    // one lesson can hold all three roles for the same assignment
    await link(day1, assignment, 'assigned');
    await link(day1, assignment, 'working');
    await link(day1, assignment, 'due');
  });

  test('a second assigned row for the same assignment is rejected', async () => {
    const { day1, day2, assignment } = await setUp();
    await link(day1, assignment, 'assigned');

    await expect(link(day2, assignment, 'assigned')).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: 'lesson_assignments_one_assigned',
    });
  });

  test('a second due row for the same assignment is rejected', async () => {
    const { day2, day3, assignment } = await setUp();
    await link(day3, assignment, 'due');

    await expect(link(day2, assignment, 'due')).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: 'lesson_assignments_one_due',
    });
  });

  test('several working rows are allowed, and other assignments are unaffected', async () => {
    const { day1, day2, day3, assignment } = await setUp();
    await link(day1, assignment, 'working');
    await link(day2, assignment, 'working');
    await link(day3, assignment, 'working');

    // a different assignment can be assigned and due on the same lessons
    const other = await insertAssignment(db(), { title: 'Exit slip' });
    await link(day1, assignment, 'assigned');
    await link(day1, other, 'assigned');
    await link(day3, assignment, 'due');
    await link(day3, other, 'due');

    const { rows } = await db().query(
      "SELECT count(*) AS total FROM lesson_assignments WHERE role = 'working'",
    );
    expect(rows[0].total).toBe(3);
  });

  test('the block must belong to the same lesson', async () => {
    const { day1, day2, assignment } = await setUp();
    const blockOfDay2 = await insertBlock(db(), { lesson_id: day2, block_sequence: 1 });

    await expect(link(day1, assignment, 'working', blockOfDay2)).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'lesson_assignments_block_id_lesson_id_fkey',
    });
  });

  test('deleting a block clears block_id and keeps the link', async () => {
    const { day1, assignment } = await setUp();
    const block = await insertBlock(db(), { lesson_id: day1, block_sequence: 1 });
    await link(day1, assignment, 'assigned', block);

    await db().query('DELETE FROM lesson_blocks WHERE id = $1', [block]);

    const { rows } = await db().query(
      'SELECT lesson_id, assignment_id, role, block_id FROM lesson_assignments',
    );
    expect(rows).toEqual([
      { lesson_id: day1, assignment_id: assignment, role: 'assigned', block_id: null },
    ]);
  });
});

describe('assignments.setting', () => {
  test('accepts exit_ticket and the other three settings', async () => {
    for (const setting of ['exit_ticket', 'in_class', 'homework', 'either']) {
      await insertAssignment(db(), { title: `A ${setting} assignment`, setting });
    }
    const { rows } = await db().query(
      "SELECT title FROM assignments WHERE setting = 'exit_ticket'",
    );
    expect(rows).toEqual([{ title: 'A exit_ticket assignment' }]);
  });

  test('rejects other values', async () => {
    for (const setting of ['exit ticket', 'Homework', 'quiz', '']) {
      await expect(
        insertAssignment(db(), { title: 'Bad setting', setting }),
        `setting "${setting}"`,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'assignments_setting_check' });
    }
  });
});
