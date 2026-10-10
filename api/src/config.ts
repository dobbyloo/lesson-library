import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The repo root, two levels up from api/src/.
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// A .env file at the repo root is optional; the defaults below match docker-compose.yml.
const envFile = `${repoRoot}.env`;
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/lesson_library?sslmode=disable',
  port: Number(process.env.PORT ?? 3000),
  migrationsDir: `${repoRoot}db/migrations`,
};
