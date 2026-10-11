import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createPool } from '../../src/db.ts';
import { TEMPLATE_DB, TEST_DB_PREFIX, adminUrl, urlForDatabase } from './urls.ts';

// Every table in the schema except dbmate's schema_migrations.
const TABLES = [
  'subjects',
  'units',
  'lessons',
  'lesson_blocks',
  'material_types',
  'materials',
  'lesson_materials',
  'block_materials',
  'assignments',
  'lesson_assignments',
  'skills',
  'standards',
  'skill_standards',
  'lesson_skills',
  'skill_materials',
  'prep_tasks',
  'users',
  'user_sessions',
];

async function withAdminClient(run: (client: pg.Client) => Promise<void>) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

// Call at the top of a test file. The file gets its own database, copied from the
// migrated template, so test files cannot affect each other. Every table is emptied
// before each test, so tests inside a file cannot either. Identity counters are left
// running on purpose: ids are never predictable, so a test cannot get away with
// hardcoding one.
//
// Returns a function rather than the pool itself because the pool does not exist until
// beforeAll has run.
export function useTestDatabase(): () => pg.Pool {
  const name = `${TEST_DB_PREFIX}${randomBytes(6).toString('hex')}`;
  let pool: pg.Pool | undefined;

  beforeAll(async () => {
    await withAdminClient(async (client) => {
      await client.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
    });
    pool = createPool(urlForDatabase(name));
  });

  beforeEach(async () => {
    await pool!.query(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
  });

  afterAll(async () => {
    await pool?.end();
    await withAdminClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${name}"`);
    });
  });

  return () => {
    if (!pool) throw new Error('The test database is only available inside tests and hooks.');
    return pool;
  };
}
