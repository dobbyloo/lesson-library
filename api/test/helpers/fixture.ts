import type { Db } from './rows.ts';
import {
  insertAssignment,
  insertBlock,
  insertLesson,
  insertMaterial,
  insertSubject,
  insertUnit,
} from './rows.ts';

// A small hand-written data set: one subject, two units, three lessons (one standalone),
// three blocks, one material, one assignment. Tests find rows by code or title.
//
//   Math
//   ├─ Unit 1: Fractions      MATH-U1-L1  Comparing Fractions (blocks, material, assignment given out)
//   ├─ Unit 2: Decimals       MATH-U2-L1  Decimal Place Value (assignment collected)
//   └─ (no unit)              MATH-REVIEW Mixed Review        (nothing attached)
export async function loadFixture(db: Db) {
  const math = await insertSubject(db, 'Math');
  const fractions = await insertUnit(db, {
    subject_id: math,
    title: 'Unit 1: Fractions',
    unit_sequence: 1,
  });
  const decimals = await insertUnit(db, {
    subject_id: math,
    title: 'Unit 2: Decimals',
    unit_sequence: 2,
  });

  const comparing = await insertLesson(db, {
    code: 'MATH-U1-L1',
    title: 'Comparing Fractions',
    subject_id: math,
    unit_id: fractions,
    lesson_unit_sequence: 1,
  });
  await db.query(
    `UPDATE lessons
     SET objective = 'Compare two fractions with unlike denominators.',
         key_questions = 'How do you know which fraction is larger?',
         teaching_notes = 'Watch for students comparing only the denominators.'
     WHERE id = $1`,
    [comparing],
  );
  const placeValue = await insertLesson(db, {
    code: 'MATH-U2-L1',
    title: 'Decimal Place Value',
    subject_id: math,
    unit_id: decimals,
    lesson_unit_sequence: 1,
  });
  await insertLesson(db, { code: 'MATH-REVIEW', title: 'Mixed Review', subject_id: math });

  // Blocks are inserted out of order on purpose; the API must sort by block_sequence.
  const practice = await insertBlock(db, {
    lesson_id: comparing,
    block_sequence: 3,
    name: 'Independent practice',
    minutes: 15,
  });
  await insertBlock(db, { lesson_id: comparing, block_sequence: 1, name: 'Warm-up', minutes: 10 });
  const miniLesson = await insertBlock(db, {
    lesson_id: comparing,
    block_sequence: 2,
    name: 'Mini-lesson',
    minutes: 20,
  });
  await db.query(
    "UPDATE lesson_blocks SET description = 'Model with fraction strips.' WHERE id = $1",
    [miniLesson],
  );

  const {
    rows: [worksheetType],
  } = await db.query<{ id: number }>(
    "INSERT INTO material_types (title, file_extension) VALUES ('Worksheet', 'pdf') RETURNING id",
  );
  const strips = await insertMaterial(db, 'Fraction strips');
  await db.query(
    "UPDATE materials SET material_type_id = $1, link = 'https://example.com/fraction-strips.pdf' WHERE id = $2",
    [worksheetType!.id, strips],
  );
  await db.query('INSERT INTO lesson_materials (lesson_id, material_id) VALUES ($1, $2)', [
    comparing,
    strips,
  ]);
  await db.query(
    'INSERT INTO block_materials (block_id, lesson_id, material_id) VALUES ($1, $2, $3)',
    [miniLesson, comparing, strips],
  );

  // Given out during independent practice in the fractions lesson, collected in the decimals lesson.
  const practicePage = await insertAssignment(db, {
    title: 'Comparing fractions practice',
    setting: 'either',
  });
  await db.query('UPDATE assignments SET due_in_school_days = 1 WHERE id = $1', [practicePage]);
  await db.query(
    "INSERT INTO lesson_assignments (lesson_id, assignment_id, role, block_id) VALUES ($1, $2, 'assigned', $3)",
    [comparing, practicePage, practice],
  );
  await db.query(
    "INSERT INTO lesson_assignments (lesson_id, assignment_id, role) VALUES ($1, $2, 'due')",
    [placeValue, practicePage],
  );
}
