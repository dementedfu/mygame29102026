import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AVATARS, initialState, remaining, pausedSnapshot, validateState, openQuestion, toggleTimer, scoreAnswer, finishQuestion } from '../public/game.js';
const categories = JSON.parse(await readFile(new URL('../public/questions.json', import.meta.url)));
const q = categories[0].questions[0];
function game() {
  const s = initialState();
  s.players = [{ name: 'Тыква', avatar: 0, score: 0 }, { name: 'Призрак', avatar: 1, score: 0 }];
  return s;
}
test('seven Halloween avatars and complete original question pack', () => {
  assert.equal(AVATARS.length, 7);
  assert.equal(new Set(AVATARS.map(a => a.icon)).size, 7);
  assert.deepEqual([1, 2].map(round => categories.filter(c => c.round === round).flatMap(c => c.questions).length), [28, 19]);
});
test('old v1 saves acquire avatars and answer tracking without losing score', () => {
  const old = { round: 1, players: [{ name: 'Макс', score: -100 }], used: [], duration: 30,
    active: { id: q.id, left: 20, since: 1000, running: false, revealed: false } };
  const migrated = validateState(old, categories);
  assert.equal(migrated.players[0].score, -100);
  assert.equal(migrated.players[0].avatar, 0);
  assert.deepEqual(migrated.active.attempted, []);
  assert.equal(migrated.active.winner, null);
});
test('timer starts, pauses, resumes and expires at the correct time', () => {
  const s = game(); openQuestion(s, q.id, 1000);
  assert.equal(remaining(s.active, 6000), 25);
  toggleTimer(s, 6000); assert.equal(remaining(s.active, 20000), 25);
  toggleTimer(s, 20000); assert.equal(remaining(s.active, 24000), 21);
  assert.equal(remaining(s.active, 999999), 0);
});
test('wrong answer subtracts once, others can resume and earn points', () => {
  const s = game(); openQuestion(s, q.id, 1000);
  assert.equal(scoreAnswer(s, 0, -1, q, 5000), true);
  assert.equal(s.players[0].score, -100);
  assert.equal(s.active.running, false);
  assert.equal(scoreAnswer(s, 0, -1, q, 5001), false);
  toggleTimer(s, 6000); assert.equal(s.active.running, true);
  scoreAnswer(s, 1, 1, q, 7000);
  assert.equal(s.players[1].score, 100);
  assert.equal(s.active.winner, 1);
  assert.equal(scoreAnswer(s, 1, 1, q, 7100), false);
  assert.equal(toggleTimer(s, 8000), false);
});
test('undo snapshot freezes the actual remaining time, not the original countdown', () => {
  const s = game(); openQuestion(s, q.id, 1000);
  const before = pausedSnapshot(s, 10000);
  scoreAnswer(s, 0, -1, q, 10000);
  assert.equal(before.players[0].score, 0);
  assert.equal(remaining(before.active, 999999), 21);
  assert.equal(before.active.running, false);
});
test('repeated values still identify separate questions; finish prevents reopening', () => {
  const s = game(), questions = categories[2].questions;
  openQuestion(s, questions[0].id); finishQuestion(s);
  assert.equal(openQuestion(s, questions[0].id), false);
  assert.equal(openQuestion(s, questions[1].id), true);
  assert.equal(s.active.id, questions[1].id);
});
test('import rejects malformed state and unknown questions', () => {
  for (const bad of [null, {}, { ...game(), duration: -1 }, { ...game(), used: ['no-question'] },
    { ...game(), players: [{ name: 'x', score: '100' }] }]) assert.throws(() => validateState(bad, categories));
});
