import { describe, expect, test } from 'vitest';
import {
  CHECK_VIOLATION, FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION,
  inTransaction, insertBlock, insertLesson, insertMaterial, insertAssignment, insertSubject, insertUnit,
} from '../helpers/rows.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();

describe('lessons and their units', () => {
  test('a lesson cannot sit in a unit of a different subject', async () => {
    const math = await insertSubject(db(), 'Math');
    const science = await insertSubject(db(), 'Science');
    const mathUnit = await insertUnit(db(), { subject_id: math, title: 'Fractions', unit_sequence: 1 });

    await expect(
      insertLesson(db(), { code: 'SCI-1', subject_id: science, unit_id: mathUnit, lesson_unit_sequence: 1 }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION, constraint: 'lessons_unit_id_subject_id_fkey' });

    // the same lesson in its own subject's unit is fine
    await insertLesson(db(), { code: 'MATH-1', subject_id: math, unit_id: mathUnit, lesson_unit_sequence: 1 });
  });

  test('a unit that still has lessons cannot be deleted', async () => {
    const math = await insertSubject(db(), 'Math');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Fractions', unit_sequence: 1 });
    const lesson = await insertLesson(db(), { code: 'MATH-1', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 });

    // Only the constraint name is checked: Postgres 18 changed the SQLSTATE for RESTRICT.
    await expect(db().query('DELETE FROM units WHERE id = $1', [unit])).rejects.toMatchObject({
      constraint: 'lessons_unit_id_subject_id_fkey',
    });

    // deleting a parent unit cascades to the child, which is then blocked the same way
    const child = await insertUnit(db(), { subject_id: math, title: 'Module 1', unit_sequence: 1, parent_id: unit });
    await db().query('UPDATE lessons SET unit_id = $1 WHERE id = $2', [child, lesson]);
    await expect(db().query('DELETE FROM units WHERE id = $1', [unit])).rejects.toMatchObject({
      constraint: 'lessons_unit_id_subject_id_fkey',
    });

    // once the lesson is gone, the unit can go
    await db().query('DELETE FROM lessons WHERE id = $1', [lesson]);
    await db().query('DELETE FROM units WHERE id = $1', [unit]);
    const { rows } = await db().query('SELECT title FROM units');
    expect(rows).toEqual([]);
  });

  test('unit_id and lesson_unit_sequence must be set together', async () => {
    const math = await insertSubject(db(), 'Math');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Fractions', unit_sequence: 1 });
    const violation = { code: CHECK_VIOLATION, constraint: 'lessons_unit_and_sequence_together' };

    await expect(
      insertLesson(db(), { code: 'UNIT-ONLY', subject_id: math, unit_id: unit }),
    ).rejects.toMatchObject(violation);
    await expect(
      insertLesson(db(), { code: 'SEQ-ONLY', subject_id: math, lesson_unit_sequence: 1 }),
    ).rejects.toMatchObject(violation);

    await insertLesson(db(), { code: 'BOTH', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 });
    await insertLesson(db(), { code: 'NEITHER', subject_id: math });
  });

  test('two lessons cannot share a position in a unit', async () => {
    const math = await insertSubject(db(), 'Math');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Fractions', unit_sequence: 1 });
    const otherUnit = await insertUnit(db(), { subject_id: math, title: 'Decimals', unit_sequence: 2 });
    await insertLesson(db(), { code: 'FIRST', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 });

    await expect(
      insertLesson(db(), { code: 'CLASH', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'lessons_unit_position_unique' });

    // another unit may reuse the position
    await insertLesson(db(), { code: 'OTHER', subject_id: math, unit_id: otherUnit, lesson_unit_sequence: 1 });
  });

  test('two lessons can swap positions inside one transaction', async () => {
    const math = await insertSubject(db(), 'Math');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Fractions', unit_sequence: 1 });
    await insertLesson(db(), { code: 'SWAP-A', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 });
    await insertLesson(db(), { code: 'SWAP-B', subject_id: math, unit_id: unit, lesson_unit_sequence: 2 });

    await inTransaction(db(), async (client) => {
      await client.query("UPDATE lessons SET lesson_unit_sequence = 2 WHERE code = 'SWAP-A'");
      await client.query("UPDATE lessons SET lesson_unit_sequence = 1 WHERE code = 'SWAP-B'");
    });

    const { rows } = await db().query('SELECT code FROM lessons ORDER BY lesson_unit_sequence');
    expect(rows.map((row) => row.code)).toEqual(['SWAP-B', 'SWAP-A']);

    // a transaction that ends with a clash still fails, at COMMIT
    await expect(
      inTransaction(db(), async (client) => {
        await client.query("UPDATE lessons SET lesson_unit_sequence = 1 WHERE code = 'SWAP-A'");
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'lessons_unit_position_unique' });
  });
});

describe('unit positions', () => {
  test('two sibling units cannot share a position, including top-level units', async () => {
    const math = await insertSubject(db(), 'Math');
    const violation = { code: UNIQUE_VIOLATION, constraint: 'units_position_unique' };

    const top = await insertUnit(db(), { subject_id: math, title: 'Unit 1', unit_sequence: 1 });
    await expect(
      insertUnit(db(), { subject_id: math, title: 'Top-level clash', unit_sequence: 1 }),
    ).rejects.toMatchObject(violation);

    await insertUnit(db(), { subject_id: math, title: 'Module 1', unit_sequence: 1, parent_id: top });
    await expect(
      insertUnit(db(), { subject_id: math, title: 'Child clash', unit_sequence: 1, parent_id: top }),
    ).rejects.toMatchObject(violation);
  });

  test('other subjects and other parents may reuse a position', async () => {
    const math = await insertSubject(db(), 'Math');
    const science = await insertSubject(db(), 'Science');

    const mathUnit1 = await insertUnit(db(), { subject_id: math, title: 'Math Unit 1', unit_sequence: 1 });
    const mathUnit2 = await insertUnit(db(), { subject_id: math, title: 'Math Unit 2', unit_sequence: 2 });
    await insertUnit(db(), { subject_id: science, title: 'Science Unit 1', unit_sequence: 1 });
    await insertUnit(db(), { subject_id: math, title: 'U1 Module 1', unit_sequence: 1, parent_id: mathUnit1 });
    await insertUnit(db(), { subject_id: math, title: 'U2 Module 1', unit_sequence: 1, parent_id: mathUnit2 });

    const { rows } = await db().query('SELECT count(*) AS total FROM units WHERE unit_sequence = 1');
    expect(rows[0].total).toBe(4);
  });
});

describe('lesson codes', () => {
  test('codes are URL-safe', async () => {
    const math = await insertSubject(db(), 'Math');
    const violation = { code: CHECK_VIOLATION, constraint: 'lessons_code_format' };

    for (const code of ['MATH 1', 'MATH/1', 'MATH_1', 'MATH.1', 'MÄTH-1', '']) {
      await expect(insertLesson(db(), { code, subject_id: math }), `code "${code}"`).rejects.toMatchObject(violation);
    }
    // a real code from the Airtable base, with its lowercase suffix
    await insertLesson(db(), { code: 'SCI-U4M1L2-D06a', subject_id: math });
  });

  test('codes are unique ignoring case', async () => {
    const math = await insertSubject(db(), 'Math');
    await insertLesson(db(), { code: 'MATH-U1-L1', subject_id: math });

    for (const code of ['MATH-U1-L1', 'math-u1-l1', 'Math-U1-l1']) {
      await expect(insertLesson(db(), { code, subject_id: math }), `code "${code}"`).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'lessons_code_lower_unique',
      });
    }
  });
});

describe('deleting a lesson', () => {
  test('removes its prep tasks, blocks, and links', async () => {
    const math = await insertSubject(db(), 'Math');
    const doomed = await insertLesson(db(), { code: 'DOOMED', subject_id: math });
    const kept = await insertLesson(db(), { code: 'KEPT', subject_id: math });

    // give both lessons one of everything a lesson owns or links to
    const material = await insertMaterial(db(), 'Fraction strips');
    const assignment = await insertAssignment(db(), { title: 'Practice page' });
    const { rows: [skill] } = await db().query("INSERT INTO skills (title) VALUES ('Compare fractions') RETURNING id");
    for (const lesson of [doomed, kept]) {
      const block = await insertBlock(db(), { lesson_id: lesson, block_sequence: 1 });
      await db().query('INSERT INTO prep_tasks (lesson_id, description) VALUES ($1, $2)', [lesson, 'Book the laptop cart']);
      await db().query('INSERT INTO lesson_materials (lesson_id, material_id) VALUES ($1, $2)', [lesson, material]);
      await db().query('INSERT INTO block_materials (block_id, lesson_id, material_id) VALUES ($1, $2, $3)', [block, lesson, material]);
      await db().query("INSERT INTO lesson_assignments (lesson_id, assignment_id, role, block_id) VALUES ($1, $2, 'working', $3)", [lesson, assignment, block]);
      await db().query('INSERT INTO lesson_skills (lesson_id, skill_id) VALUES ($1, $2)', [lesson, skill.id]);
    }

    await db().query('DELETE FROM lessons WHERE id = $1', [doomed]);

    // every owned or linking table now holds only the kept lesson's row
    for (const table of ['prep_tasks', 'lesson_blocks', 'lesson_materials', 'block_materials', 'lesson_assignments', 'lesson_skills']) {
      const { rows } = await db().query(`SELECT lesson_id FROM ${table}`);
      expect(rows, table).toEqual([{ lesson_id: kept }]);
    }
    // the things it linked to are shared, and survive
    for (const table of ['materials', 'assignments', 'skills']) {
      const { rows } = await db().query(`SELECT count(*) AS total FROM ${table}`);
      expect(rows[0].total, table).toBe(1);
    }
  });
});
