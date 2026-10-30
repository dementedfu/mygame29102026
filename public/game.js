// Shared game rules. No browser or server state is kept in this module.
export const AVATARS = [
  { icon: '🎃', name: 'Тыква' }, { icon: '👻', name: 'Привидение' },
  { icon: '🦇', name: 'Летучая мышь' }, { icon: '🐈‍⬛', name: 'Чёрный кот' },
  { icon: '🧙', name: 'Ведьма' }, { icon: '🧛', name: 'Вампир' },
  { icon: '🧟', name: 'Зомби' },
];
export const initialState = () => ({ round: 1, players: [], used: [], duration: 30, active: null });
export function remaining(active, now = Date.now()) {
  return active ? Math.max(0, active.left - (active.running ? Math.max(0, now - active.since) / 1000 : 0)) : 0;
}
export function pausedSnapshot(state, now = Date.now()) {
  const copy = structuredClone(state);
  if (copy.active) {
    copy.active.left = remaining(copy.active, now);
    copy.active.running = false;
    copy.active.since = now;
  }
  return copy;
}
export function validateState(value, categories) {
  const fail = () => { throw new Error('Файл не похож на сохранение этой игры.'); };
  if (!value || typeof value !== 'object' || ![1, 2].includes(value.round) ||
      !Array.isArray(value.players) || value.players.length > 40 || !Array.isArray(value.used) ||
      !Number.isInteger(value.duration) || value.duration < 5 || value.duration > 300) fail();
  const ids = new Set(categories.flatMap(c => c.questions.map(q => q.id)));
  const players = value.players.map((p, i) => {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 ||
        !Number.isSafeInteger(p.score) || Math.abs(p.score) > 1e9) fail();
    return { name: p.name.trim(), score: p.score,
      avatar: Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar < AVATARS.length ? p.avatar : i % AVATARS.length };
  });
  if (value.used.some(id => !ids.has(id))) fail();
  let active = null;
  if (value.active != null) {
    const a = value.active;
    if (!ids.has(a.id) || value.used.includes(a.id) || typeof a.running !== 'boolean' ||
        typeof a.revealed !== 'boolean' || !Number.isFinite(a.left) || a.left < 0 || a.left > 300 ||
        !Number.isFinite(a.since) || a.since < 0) fail();
    const attempted = a.attempted ?? [];
    const winner = a.winner ?? null;
    if (!Array.isArray(attempted) || attempted.some(i => !Number.isInteger(i) || !players[i]) ||
        (winner !== null && (!Number.isInteger(winner) || !players[winner]))) fail();
    active = { id: a.id, running: a.running && !a.revealed && winner === null, revealed: a.revealed,
      left: a.left, since: a.since, attempted: [...new Set(attempted)], winner };
  }
  return { round: value.round, players, used: [...new Set(value.used)], duration: value.duration, active };
}
export function openQuestion(state, id, now = Date.now()) {
  if (state.active || state.used.includes(id)) return false;
  state.active = { id, left: state.duration, since: now, running: true, revealed: false, attempted: [], winner: null };
  return true;
}
export function toggleTimer(state, now = Date.now()) {
  const a = state.active;
  if (!a || a.revealed || a.winner !== null) return false;
  a.left = remaining(a, now);
  a.running = !a.running && a.left > 0;
  a.since = now;
  return true;
}
export function scoreAnswer(state, playerIndex, sign, question, now = Date.now()) {
  const a = state.active;
  if (!a || a.id !== question.id || !state.players[playerIndex] || ![1, -1].includes(sign) ||
      a.winner !== null || a.attempted.includes(playerIndex)) return false;
  state.players[playerIndex].score += sign * question.value;
  a.left = remaining(a, now);
  a.running = false;
  a.attempted.push(playerIndex);
  if (sign === 1) a.winner = playerIndex;
  return true;
}
export function finishQuestion(state) {
  if (!state.active) return;
  state.used = [...new Set([...state.used, state.active.id])];
  state.active = null;
}
