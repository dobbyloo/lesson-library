import { describe, expect, test } from 'vitest';
import {
  UNIQUE_VIOLATION,
  inTransaction, insertLesson, insertMaterial, insertSkill, insertStandard, insertSubject, insertUnit,
} from '../helpers/rows.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();

function teach(lessonId: number, skillId: number) {
  return db().query('INSERT INTO lesson_skills (lesson_id, skill_id) VALUES ($1, $2)', [lessonId, skillId]);
}

// The lesson codes that teach a skill, first taught first.
async function lessonOrderFor(skillTitle: string): Promise<string[]> {
  const { rows } = await db().query<{ code: string; position: number }>(
    `SELECT l.code, p.position
     FROM lesson_skill_positions p
     JOIN lessons l ON l.id = p.lesson_id
     JOIN skills s ON s.id = p.skill_id
     WHERE s.title = $1
     ORDER BY p.position`,
    [skillTitle],
  );
  // positions are 0, 1, 2, ... with no gaps
  expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
  return rows.map((row) => row.code);
}

describe('lesson_skill_positions', () => {
  test('ranks follow unit and lesson order regardless of insert order', async () => {
    const math = await insertSubject(db(), 'Math');
    const skill = await insertSkill(db(), 'Compare fractions');
    // units and lessons are created, and linked to the skill, in reverse teaching order
    const unit2 = await insertUnit(db(), { subject_id: math, title: 'Unit 2', unit_sequence: 2 });
    const unit1 = await insertUnit(db(), { subject_id: math, title: 'Unit 1', unit_sequence: 1 });
    await teach(await insertLesson(db(), { code: 'U2-L2', subject_id: math, unit_id: unit2, lesson_unit_sequence: 2 }), skill);
    await teach(await insertLesson(db(), { code: 'U2-L1', subject_id: math, unit_id: unit2, lesson_unit_sequence: 1 }), skill);
    await teach(await insertLesson(db(), { code: 'U1-L2', subject_id: math, unit_id: unit1, lesson_unit_sequence: 2 }), skill);
    await teach(await insertLesson(db(), { code: 'U1-L1', subject_id: math, unit_id: unit1, lesson_unit_sequence: 1 }), skill);

    expect(await lessonOrderFor('Compare fractions')).toEqual(['U1-L1', 'U1-L2', 'U2-L1', 'U2-L2']);
  });

  test('lessons directly in a parent unit rank before lessons in its child units', async () => {
    const math = await insertSubject(db(), 'Math');
    const skill = await insertSkill(db(), 'Compare fractions');
    const unit1 = await insertUnit(db(), { subject_id: math, title: 'Unit 1', unit_sequence: 1 });
    const unit2 = await insertUnit(db(), { subject_id: math, title: 'Unit 2', unit_sequence: 2 });
    const module1 = await insertUnit(db(), { subject_id: math, title: 'U1 Module 1', unit_sequence: 1, parent_id: unit1 });
    const module2 = await insertUnit(db(), { subject_id: math, title: 'U1 Module 2', unit_sequence: 2, parent_id: unit1 });
    await teach(await insertLesson(db(), { code: 'U2-L1', subject_id: math, unit_id: unit2, lesson_unit_sequence: 1 }), skill);
    await teach(await insertLesson(db(), { code: 'U1-M2-L1', subject_id: math, unit_id: module2, lesson_unit_sequence: 1 }), skill);
    await teach(await insertLesson(db(), { code: 'U1-M1-L1', subject_id: math, unit_id: module1, lesson_unit_sequence: 1 }), skill);
    await teach(await insertLesson(db(), { code: 'U1-INTRO', subject_id: math, unit_id: unit1, lesson_unit_sequence: 9 }), skill);

    expect(await lessonOrderFor('Compare fractions')).toEqual(['U1-INTRO', 'U1-M1-L1', 'U1-M2-L1', 'U2-L1']);
  });

  test("a skill's lessons are ranked independently of other skills", async () => {
    const math = await insertSubject(db(), 'Math');
    const compare = await insertSkill(db(), 'Compare fractions');
    const add = await insertSkill(db(), 'Add fractions');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Unit 1', unit_sequence: 1 });
    const lesson1 = await insertLesson(db(), { code: 'L1', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 });
    const lesson2 = await insertLesson(db(), { code: 'L2', subject_id: math, unit_id: unit, lesson_unit_sequence: 2 });
    const lesson3 = await insertLesson(db(), { code: 'L3', subject_id: math, unit_id: unit, lesson_unit_sequence: 3 });
    await teach(lesson1, compare);
    await teach(lesson2, compare);
    await teach(lesson2, add);
    await teach(lesson3, add);

    // L2 is second for one skill and first for the other
    expect(await lessonOrderFor('Compare fractions')).toEqual(['L1', 'L2']);
    expect(await lessonOrderFor('Add fractions')).toEqual(['L2', 'L3']);
  });

  test('standalone lessons rank last', async () => {
    const math = await insertSubject(db(), 'Math');
    const skill = await insertSkill(db(), 'Compare fractions');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Unit 9', unit_sequence: 9 });
    // the standalone lesson is created and linked first
    await teach(await insertLesson(db(), { code: 'STANDALONE', subject_id: math }), skill);
    await teach(await insertLesson(db(), { code: 'U9-L7', subject_id: math, unit_id: unit, lesson_unit_sequence: 7 }), skill);

    expect(await lessonOrderFor('Compare fractions')).toEqual(['U9-L7', 'STANDALONE']);
  });

  test('swapping two lessons changes the ranks with no other update', async () => {
    const math = await insertSubject(db(), 'Math');
    const skill = await insertSkill(db(), 'Compare fractions');
    const unit = await insertUnit(db(), { subject_id: math, title: 'Unit 1', unit_sequence: 1 });
    await teach(await insertLesson(db(), { code: 'SWAP-A', subject_id: math, unit_id: unit, lesson_unit_sequence: 1 }), skill);
    await teach(await insertLesson(db(), { code: 'SWAP-B', subject_id: math, unit_id: unit, lesson_unit_sequence: 2 }), skill);
    expect(await lessonOrderFor('Compare fractions')).toEqual(['SWAP-A', 'SWAP-B']);

    await inTransaction(db(), async (client) => {
      await client.query("UPDATE lessons SET lesson_unit_sequence = 2 WHERE code = 'SWAP-A'");
      await client.query("UPDATE lessons SET lesson_unit_sequence = 1 WHERE code = 'SWAP-B'");
    });

    expect(await lessonOrderFor('Compare fractions')).toEqual(['SWAP-B', 'SWAP-A']);
  });
});

describe('standards and skills', () => {
  test('standard codes are unique ignoring case', async () => {
    await insertStandard(db(), 'MA.5.N.1.a');

    for (const code of ['MA.5.N.1.a', 'ma.5.n.1.A']) {
      await expect(insertStandard(db(), code), `code "${code}"`).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'standards_code_lower_unique',
      });
    }
  });

  test("deleting a skill removes its standard and material links but leaves other skills' lesson links alone", async () => {
    const math = await insertSubject(db(), 'Math');
    const lesson = await insertLesson(db(), { code: 'MATH-1', subject_id: math });
    const standard = await insertStandard(db(), 'MA.5.N.1.a');
    const material = await insertMaterial(db(), 'Fractions anchor chart');
    const doomed = await insertSkill(db(), 'Doomed skill');
    const kept = await insertSkill(db(), 'Kept skill');
    for (const skill of [doomed, kept]) {
      await db().query('INSERT INTO skill_standards (skill_id, standard_id) VALUES ($1, $2)', [skill, standard]);
      await db().query('INSERT INTO skill_materials (skill_id, material_id) VALUES ($1, $2)', [skill, material]);
      await teach(lesson, skill);
    }

    await db().query('DELETE FROM skills WHERE id = $1', [doomed]);

    for (const table of ['skill_standards', 'skill_materials', 'lesson_skills']) {
      const { rows } = await db().query(`SELECT skill_id FROM ${table}`);
      expect(rows, table).toEqual([{ skill_id: kept }]);
    }
    // the standard, the material, and the lesson themselves are untouched
    for (const table of ['standards', 'materials', 'lessons']) {
      const { rows } = await db().query(`SELECT count(*) AS total FROM ${table}`);
      expect(rows[0].total, table).toBe(1);
    }
  });
});
