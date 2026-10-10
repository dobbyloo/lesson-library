import { config } from '../src/config.ts';
import { createPool } from '../src/db.ts';
import { loadFixture } from '../test/helpers/fixture.ts';

// Loads the test fixture into the development database, so there is something to look at
// before the Airtable import exists. Refuses to run if the database already has lessons.
const pool = createPool(config.databaseUrl);
try {
  const { rows } = await pool.query('SELECT count(*) AS total FROM lessons');
  if (rows[0].total > 0) {
    console.error(`The database already has ${rows[0].total} lessons; not seeding.`);
    process.exitCode = 1;
  } else {
    await loadFixture(pool);
    console.log('Seeded 3 lessons. Try: curl http://localhost:3000/api/v1/lessons/MATH-U1-L1');
  }
} finally {
  await pool.end();
}
