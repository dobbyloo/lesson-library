import { expect, test } from 'vitest';
import {
  FOREIGN_KEY_VIOLATION,
  insertBlock,
  insertLesson,
  insertMaterial,
  insertSubject,
} from '../helpers/rows.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();

function linkBlockToMaterial(blockId: number, lessonId: number, materialId: number) {
  return db().query(
    'INSERT INTO block_materials (block_id, lesson_id, material_id) VALUES ($1, $2, $3)',
    [blockId, lessonId, materialId],
  );
}

test('a material cannot be linked to a block until it is attached to that lesson', async () => {
  const math = await insertSubject(db(), 'Math');
  const lesson = await insertLesson(db(), { code: 'MATH-1', subject_id: math });
  const block = await insertBlock(db(), { lesson_id: lesson, block_sequence: 1 });
  const material = await insertMaterial(db(), 'Fraction strips');

  await expect(linkBlockToMaterial(block, lesson, material)).rejects.toMatchObject({
    code: FOREIGN_KEY_VIOLATION,
    constraint: 'block_materials_lesson_id_material_id_fkey',
  });

  await db().query('INSERT INTO lesson_materials (lesson_id, material_id) VALUES ($1, $2)', [
    lesson,
    material,
  ]);
  await linkBlockToMaterial(block, lesson, material);
});

test('a block cannot be linked to a material of a different lesson', async () => {
  const math = await insertSubject(db(), 'Math');
  const lessonA = await insertLesson(db(), { code: 'MATH-A', subject_id: math });
  const lessonB = await insertLesson(db(), { code: 'MATH-B', subject_id: math });
  const blockOfA = await insertBlock(db(), { lesson_id: lessonA, block_sequence: 1 });
  const materialOfB = await insertMaterial(db(), 'Number line');
  await db().query('INSERT INTO lesson_materials (lesson_id, material_id) VALUES ($1, $2)', [
    lessonB,
    materialOfB,
  ]);

  // claiming the link belongs to lesson B: the block is not in lesson B
  await expect(linkBlockToMaterial(blockOfA, lessonB, materialOfB)).rejects.toMatchObject({
    code: FOREIGN_KEY_VIOLATION,
    constraint: 'block_materials_block_id_lesson_id_fkey',
  });
  // claiming it belongs to lesson A: the material is not attached to lesson A
  await expect(linkBlockToMaterial(blockOfA, lessonA, materialOfB)).rejects.toMatchObject({
    code: FOREIGN_KEY_VIOLATION,
    constraint: 'block_materials_lesson_id_material_id_fkey',
  });
});

test('detaching a material from a lesson removes its block links', async () => {
  const math = await insertSubject(db(), 'Math');
  const lesson = await insertLesson(db(), { code: 'MATH-1', subject_id: math });
  const block = await insertBlock(db(), { lesson_id: lesson, block_sequence: 1 });
  const material = await insertMaterial(db(), 'Fraction strips');
  await db().query('INSERT INTO lesson_materials (lesson_id, material_id) VALUES ($1, $2)', [
    lesson,
    material,
  ]);
  await linkBlockToMaterial(block, lesson, material);

  await db().query('DELETE FROM lesson_materials WHERE lesson_id = $1 AND material_id = $2', [
    lesson,
    material,
  ]);

  const { rows } = await db().query('SELECT * FROM block_materials');
  expect(rows).toEqual([]);
});
