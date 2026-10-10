import pg from 'pg';

// Postgres returns bigint (count, row_number) as a string by default. Nothing in this
// schema comes near 2^53, so read them as numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}
