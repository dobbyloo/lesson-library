import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBinary } from 'dbmate';
import { config } from './config.ts';

// Runs dbmate against one database. The npm scripts and the test harness both come
// through here, so the flags stay in one place.
// --no-dump-schema: dbmate would otherwise write db/schema.sql with pg_dump, which needs
// the Postgres client tools installed on the host.
export function runDbmate(databaseUrl: string, args: string[], options = { quiet: false }) {
  execFileSync(
    resolveBinary(),
    ['--url', databaseUrl, '--migrations-dir', config.migrationsDir, '--no-dump-schema', ...args],
    { stdio: options.quiet ? 'pipe' : 'inherit' },
  );
}

// Command line use: `npm run migrate` (dbmate up), `npm run migrate -- status`, and so on.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    runDbmate(config.databaseUrl, args.length > 0 ? args : ['up']);
  } catch {
    // dbmate has already printed its own error
    process.exit(1);
  }
}
