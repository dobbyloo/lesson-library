import type pg from 'pg';

// Small insert helpers for tests. Each returns the new row's id, so tests pass ids along
// without ever hardcoding one. Only the columns a test cares about are required.

// A pool or a single client inside a transaction; both have query().
export type Db = pg.Pool | pg.PoolClient;

async function insertRow(db: Db, table: string, values: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  return rows[0]!.id;
}

export function insertSubject(db: Db, title: string) {
  return insertRow(db, 'subjects', { title });
}

export function insertUnit(
  db: Db,
  unit: { subject_id: number; title: string; unit_sequence: number; parent_id?: number | null },
) {
  return insertRow(db, 'units', unit);
}

export function insertLesson(
  db: Db,
  lesson: {
    code: string;
    subject_id: number;
    title?: string;
    unit_id?: number | null;
    lesson_unit_sequence?: number | null;
  },
) {
  return insertRow(db, 'lessons', { title: `Lesson ${lesson.code}`, ...lesson });
}

export function insertBlock(
  db: Db,
  block: { lesson_id: number; block_sequence: number; name?: string; minutes?: number },
) {
  return insertRow(db, 'lesson_blocks', { name: 'Block', minutes: 10, ...block });
}

export function insertMaterial(db: Db, title: string) {
  return insertRow(db, 'materials', { title });
}

export function insertAssignment(
  db: Db,
  assignment: { title: string; kind?: string; setting?: string },
) {
  return insertRow(db, 'assignments', { kind: 'formative', setting: 'in_class', ...assignment });
}

export function insertSkill(db: Db, title: string) {
  return insertRow(db, 'skills', { title });
}

export function insertStandard(db: Db, code: string) {
  return insertRow(db, 'standards', { code });
}

export function insertUser(
  db: Db,
  username: string,
  user: { password_hash?: string; role?: string | null } = {},
) {
  return insertRow(db, 'users', {
    username,
    password_hash: 'hashedstring',
    role: 'teacher',
    ...user,
  });
}

// A session that expires tomorrow, unless the test says otherwise.
export function insertSession(
  db: Db,
  session: { user_id: number; token_hash: string; expires_at?: Date },
) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return insertRow(db, 'user_sessions', { expires_at: tomorrow, ...session });
}

// Runs the callback on one client inside BEGIN ... COMMIT. Deferred constraints are
// checked at the COMMIT, so a violation makes this function reject.
export async function inTransaction(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await run(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// SQLSTATE codes Postgres reports for the constraint kinds this schema uses.
export const FOREIGN_KEY_VIOLATION = '23503';
export const UNIQUE_VIOLATION = '23505';
export const CHECK_VIOLATION = '23514';
export const NULL_VIOLATION = '23502';
