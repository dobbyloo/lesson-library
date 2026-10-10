import { config } from '../../src/config.ts';

export const TEST_DB_PREFIX = 'lesson_library_test_';
export const TEMPLATE_DB = `${TEST_DB_PREFIX}template`;

// The same server as DATABASE_URL, but a different database.
export function urlForDatabase(name: string): string {
  const url = new URL(config.databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

// The "postgres" maintenance database, used for CREATE DATABASE and DROP DATABASE.
export const adminUrl = urlForDatabase('postgres');
