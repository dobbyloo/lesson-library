import { buildApp } from './app.ts';
import { config } from './config.ts';
import { createPool } from './db.ts';

const pool = createPool(config.databaseUrl);
const app = buildApp({ pool, logger: true });

// Listens on localhost only. Nothing checks who is calling yet, so the API must not be
// reachable from the network until the teacher role and login exist.
try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
