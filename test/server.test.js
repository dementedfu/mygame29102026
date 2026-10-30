import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server.mjs';
import { initialState } from '../public/game.js';

test('HTTP serves all materials, validates saves, persists and recovers a backup', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'max-game-test-'));
  const server = await createGameServer({ stateDir: dir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = state => fetch(base + '/api/state', { method: 'PUT', body: JSON.stringify(state) });
  assert.equal(await (await fetch(base + '/api/state')).json(), null);
  for (const file of ['/', '/app.js', '/game.js', '/style.css']) assert.equal((await fetch(base + file)).status, 200);
  const cats = await (await fetch(base + '/questions.json')).json();
  let count = 0;
  for (const cat of cats) for (const q of cat.questions) for (const src of [...q.images, ...q.answerImages]) {
    const response = await fetch(base + encodeURI(src));
    assert.equal(response.status, 200, src); assert.ok((await response.arrayBuffer()).byteLength > 0); count++;
  }
  assert.equal(count, 26);
  const first = initialState(); first.players.push({ name: '👻', avatar: 6, score: -100 });
  assert.equal((await put(first)).status, 200);
  assert.deepEqual(await (await fetch(base + '/api/state')).json(), first);
  assert.equal((await put({ invalid: true })).status, 400);
  assert.deepEqual(await (await fetch(base + '/api/state')).json(), first);
  const second = structuredClone(first); second.players[0].score = 500;
  assert.equal((await put(second)).status, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'state.json.bak'), 'utf8')), first);
  await writeFile(path.join(dir, 'state.json'), '{truncated');
  assert.deepEqual(await (await fetch(base + '/api/state')).json(), first);
  assert.equal((await put(second)).status, 200);
  assert.deepEqual(await (await fetch(base + '/api/state')).json(), second);
  assert.equal((await fetch(base + '/missing')).status, 404);
  assert.equal((await fetch(base + '/api/state', { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(base + '/api/state', { method: 'PUT', headers: { Origin: 'http://other.example' }, body: JSON.stringify(first) })).status, 403);
});
