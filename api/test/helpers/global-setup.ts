import pg from 'pg';
import { runDbmate } from '../../src/migrate.ts';
import { TEMPLATE_DB, TEST_DB_PREFIX, adminUrl, urlForDatabase } from './urls.ts';

// Runs once per `vitest run`. Migrates one template database with dbmate; each test file
// then copies it (see test-db.ts), which is much faster than migrating per file.

async function connectWithRetry(): Promise<pg.Client> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const client = new pg.Client({ connectionString: adminUrl });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) {
        throw new Error(
          `Could not reach Postgres at ${adminUrl}. Is it running? Try: docker compose up -d`,
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

// Removes the template and anything a crashed earlier run left behind.
async function dropTestDatabases(client: pg.Client) {
  const { rows } = await client.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE datname LIKE $1',
    [`${TEST_DB_PREFIX.replaceAll('_', '\\_')}%`],
  );
  for (const { datname } of rows) {
    await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }
}

export async function setup() {
  const client = await connectWithRetry();
  try {
    await dropTestDatabases(client);
    await client.query(`CREATE DATABASE "${TEMPLATE_DB}"`);
  } finally {
    await client.end();
  }
  runDbmate(urlForDatabase(TEMPLATE_DB), ['up'], { quiet: true });
}

export async function teardown() {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await dropTestDatabases(client);
  } finally {
    await client.end();
  }
}
