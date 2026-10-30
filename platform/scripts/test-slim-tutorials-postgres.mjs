import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL: exact migration, actual SQL grants/RLS/constraints, no network.
const pg = new PGlite();
let checks = 0;
const owner = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e';
const viewer = '00000000-0000-4000-8000-000000000001';
const moduleId = '00000000-0000-4000-8000-000000000101';
const lessonId = '00000000-0000-4000-8000-000000000102';
async function actor(id) {
  await pg.exec('reset role; set role authenticated;');
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function rejects(sql, args, code) {
  await assert.rejects(pg.query(sql, args), error => error.code === code);
  checks++;
}
try {
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261019185019_slim_tutorials.sql', import.meta.url), 'utf8'));
  await actor(owner);
  await pg.query('insert into tutorial_modules(id,title,position) values ($1,$2,2)', [moduleId, 'Isolated module']); checks++;
  await pg.query('insert into tutorial_lessons(id,module_id,title,video_id) values ($1,$2,$3,$4)', [lessonId, moduleId, 'Isolated lesson', 'dQw4w9WgXcQ']); checks++;
  assert.equal((await pg.query('update tutorial_modules set title=$1,position=1 where id=$2 returning id', ['Renamed module', moduleId])).rows.length, 1); checks++;
  assert.equal((await pg.query('update tutorial_lessons set title=$1,position=3 where id=$2 returning id', ['Renamed lesson', lessonId])).rows.length, 1); checks++;
  await rejects('insert into tutorial_modules(title) values ($1)', ['  '], '23514');
  await rejects('update tutorial_lessons set video_id=$1 where id=$2', ['javascript:alert(1)', lessonId], '23514');
  await rejects('update tutorial_lessons set position=-1 where id=$1', [lessonId], '23514');
  await rejects('update tutorial_lessons set module_id=$1 where id=$2', [viewer, lessonId], '23503');
  await actor(viewer);
  assert.equal((await pg.query('select * from tutorial_modules')).rows.length, 1); checks++;
  assert.equal((await pg.query('select * from tutorial_lessons')).rows.length, 1); checks++;
  for (const table of ['tutorial_modules', 'tutorial_lessons']) {
    const payload = table === 'tutorial_modules' ? "(title) values ('Denied')" : `(title,module_id,video_id) values ('Denied','${moduleId}','dQw4w9WgXcQ')`;
    await rejects(`insert into ${table} ${payload}`, [], '42501');
    assert.equal((await pg.query(`update ${table} set title='Denied' returning id`)).rows.length, 0); checks++;
    assert.equal((await pg.query(`delete from ${table} returning id`)).rows.length, 0); checks++;
  }
  // Forging the editor display name in user metadata cannot authorize writing.
  await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: viewer, user_metadata: { full_name: 'Ruan Andrade Negócios' } })]);
  await rejects("insert into tutorial_modules(title) values ('Forged editor')", [], '42501');
  await pg.exec('reset role; set role anon');
  await rejects('select * from tutorial_modules', [], '42501');
  await rejects('select * from tutorial_lessons', [], '42501');
  await actor(owner);
  assert.equal((await pg.query('delete from tutorial_lessons where id=$1 returning id', [lessonId])).rows.length, 1); checks++;
  await pg.query('insert into tutorial_lessons(module_id,title,video_id) values ($1,$2,$3)', [moduleId, 'Cascade lesson', 'dQw4w9WgXcQ']);
  assert.equal((await pg.query('delete from tutorial_modules where id=$1 returning id', [moduleId])).rows.length, 1); checks++;
  assert.equal((await pg.query('select * from tutorial_lessons')).rows.length, 0); checks++;
  console.log(`PASS: ${checks} PostgreSQL checks (CRUD editor, viewer read-only, forged name, anon, constraints, cascade).`);
} finally { await pg.close(); }
