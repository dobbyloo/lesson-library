import type pg from 'pg';
import type { LessonDetail } from '../schemas/lesson.ts';

// Finds one lesson by its code, ignoring case, with its blocks, materials, and assignments.
// Returns null when no lesson has that code.
//
// Four small queries rather than one large join: joining blocks, materials, and
// assignments in one statement multiplies the rows, and each list wants its own order.
export async function findLessonByCode(pool: pg.Pool, code: string): Promise<LessonDetail | null> {
  // lower(l.code) matches the lessons_code_lower_unique index
  const lessonResult = await pool.query(
    `SELECT l.id, l.code, l.title, l.lesson_unit_sequence,
            l.objective, l.key_questions, l.teaching_notes,
            s.id AS subject_id, s.title AS subject_title,
            u.id AS unit_id, u.title AS unit_title
     FROM lessons l
     JOIN subjects s ON s.id = l.subject_id
     LEFT JOIN units u ON u.id = l.unit_id
     WHERE lower(l.code) = lower($1)`,
    [code],
  );
  const lesson = lessonResult.rows[0];
  if (!lesson) return null;

  const blocks = await pool.query(
    `SELECT b.id, b.block_sequence, b.minutes, b.name, b.description,
            ARRAY(
                SELECT bm.material_id FROM block_materials bm
                WHERE bm.block_id = b.id
                ORDER BY bm.material_id
            ) AS material_ids
     FROM lesson_blocks b
     WHERE b.lesson_id = $1
     ORDER BY b.block_sequence`,
    [lesson.id],
  );

  const materials = await pool.query(
    `SELECT m.id, m.title, mt.title AS material_type,
            m.start_page, m.end_page, m.link, m.add_prep_task
     FROM lesson_materials lm
     JOIN materials m ON m.id = lm.material_id
     LEFT JOIN material_types mt ON mt.id = m.material_type_id
     WHERE lm.lesson_id = $1
     ORDER BY m.title, m.id`,
    [lesson.id],
  );

  // One row per assignment. Its lesson_assignments rows are folded into a JSON list,
  // ordered assigned, working, due: the order things happen in.
  const assignments = await pool.query(
    `SELECT a.id, a.title, a.kind, a.setting, a.is_group, a.details,
            a.material_id, a.due_in_school_days,
            json_agg(
                json_build_object('role', la.role, 'block_id', la.block_id)
                ORDER BY array_position(ARRAY['assigned', 'working', 'due'], la.role)
            ) AS roles
     FROM lesson_assignments la
     JOIN assignments a ON a.id = la.assignment_id
     WHERE la.lesson_id = $1
     GROUP BY a.id
     ORDER BY a.title, a.id`,
    [lesson.id],
  );

  return {
    id: lesson.id,
    code: lesson.code,
    title: lesson.title,
    subject: { id: lesson.subject_id, title: lesson.subject_title },
    unit: lesson.unit_id === null ? null : { id: lesson.unit_id, title: lesson.unit_title },
    lesson_unit_sequence: lesson.lesson_unit_sequence,
    objective: lesson.objective,
    key_questions: lesson.key_questions,
    teaching_notes: lesson.teaching_notes,
    total_minutes: blocks.rows.reduce((total, block) => total + block.minutes, 0),
    blocks: blocks.rows,
    materials: materials.rows,
    assignments: assignments.rows,
  };
}
