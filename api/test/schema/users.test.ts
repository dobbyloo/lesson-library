import { expect, test } from 'vitest';
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  NULL_VIOLATION,
  UNIQUE_VIOLATION,
  insertSession,
  insertUser,
} from '../helpers/rows.ts';
import { useTestDatabase } from '../helpers/test-db.ts';

const db = useTestDatabase();

test('usernames outside the format are rejected', async () => {
  // each one breaks exactly one rule, so a failure points at that rule
  const badUsernames = [
    'ab', // too short: 2 characters
    'a'.repeat(31), // too long: 31 characters
    'Laura', // uppercase first letter
    'lauraD', // uppercase later on
    '5laura', // starts with a digit
    '.laura', // starts with a separator
    'laura d', // space inside
    'laura ', // trailing space
    ' laura', // leading space
    'laura@school', // a character outside the allowed set
  ];

  for (const username of badUsernames) {
    await expect(insertUser(db(), username), `username "${username}"`).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'users_username_format',
    });
  }
});

test('usernames inside the format are accepted', async () => {
  const goodUsernames = [
    'abc', // shortest allowed: 3 characters
    'a'.repeat(30), // longest allowed: 30 characters
    'dobbyloo123', // digits after the first letter
    'dobby-loo', // each of the three separators
    'dobby.loo',
    'dobby_loo',
  ];

  for (const username of goodUsernames) {
    await insertUser(db(), username);
  }
});

test('an invalid role is rejected', async () => {
  const badRoles = ['student', 'Teacher', 'admin'];

  for (const role of badRoles) {
    await expect(insertUser(db(), 'dobbyloo', { role }), `role "${role}"`).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'users_role_check',
    });
  }
});

test('a role is required and has no default', async () => {
  await expect(insertUser(db(), 'dobbyloo', { role: null })).rejects.toMatchObject({
    code: NULL_VIOLATION,
    column: 'role',
  });

  await expect(
    db().query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [
      'dobbyloo',
      'passwordhash',
    ]),
  ).rejects.toMatchObject({
    code: NULL_VIOLATION,
    column: 'role',
  });
});

test('two users cannot share a username', async () => {
  await insertUser(db(), 'dobbyloo');

  await expect(insertUser(db(), 'dobbyloo')).rejects.toMatchObject({
    code: UNIQUE_VIOLATION,
    constraint: 'users_username_unique',
  });

  // a different username is fine
  await insertUser(db(), 'dobbyloo2');
});

test('a session must belong to an existing user', async () => {
  const user = await insertUser(db(), 'dobbyloo');
  await db().query('DELETE FROM users WHERE id = $1', [user]);

  // the id was real a moment ago, so this is a user that no longer exists
  await expect(insertSession(db(), { user_id: user, token_hash: 'hash-1' })).rejects.toMatchObject({
    code: FOREIGN_KEY_VIOLATION,
    constraint: 'user_sessions_user_id_fkey',
  });
});

test('two sessions cannot share a token hash, even for different users', async () => {
  const laura = await insertUser(db(), 'laura');
  const colleague = await insertUser(db(), 'colleague');
  await insertSession(db(), { user_id: laura, token_hash: 'hash-1' });

  for (const user of [laura, colleague]) {
    await expect(
      insertSession(db(), { user_id: user, token_hash: 'hash-1' }),
    ).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: 'user_sessions_token_hash_unique',
    });
  }

  // one user can have several sessions, one per device, as long as the hashes differ
  await insertSession(db(), { user_id: laura, token_hash: 'hash-2' });
});

test("deleting a user removes their sessions and leaves other users' sessions alone", async () => {
  const doomed = await insertUser(db(), 'doomed');
  const kept = await insertUser(db(), 'kept');
  await insertSession(db(), { user_id: doomed, token_hash: 'doomed-laptop' });
  await insertSession(db(), { user_id: doomed, token_hash: 'doomed-phone' });
  await insertSession(db(), { user_id: kept, token_hash: 'kept-laptop' });

  await db().query('DELETE FROM users WHERE id = $1', [doomed]);

  const { rows } = await db().query('SELECT token_hash FROM user_sessions');
  expect(rows).toEqual([{ token_hash: 'kept-laptop' }]);
});
