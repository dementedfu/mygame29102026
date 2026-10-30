import { AVATARS, initialState, remaining, pausedSnapshot, validateState, openQuestion, toggleTimer, scoreAnswer, finishQuestion } from './game.js';

const $ = id => document.getElementById(id);
const escape = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let categories, state, history = [], saveQueue = Promise.resolve(), revision = 0, dirty = false;
let editingPlayer = null, toastTimeout, audio;
const CACHE = 'max-game-backup-v1';
const avatar = player => AVATARS[player.avatar ?? 0];
const questionById = id => categories.flatMap(c => c.questions).find(q => q.id === id);
let soundEnabled = false;
try { soundEnabled = localStorage.getItem('max-game-sound') === 'on'; } catch { /* Storage can be unavailable in private browsing. */ }

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function save() {
  const body = JSON.stringify(state), current = ++revision;
  dirty = true;
  $('save').textContent = '● Сохраняем…';
  $('save').className = '';
  try { localStorage.setItem(CACHE, body); } catch { /* Server remains the primary save. */ }
  saveQueue = saveQueue.then(async () => {
    try {
      const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('save');
      if (current === revision) {
        dirty = false;
        $('save').textContent = '● Игра сохранена';
        $('save').className = 'saved';
      }
    } catch {
      if (current === revision) {
        $('save').textContent = '● Нет связи с сервером — не закрывайте игру. Скачайте копию в настройках.';
        $('save').className = 'save-error';
      }
    }
  });
}
function checkpoint() {
  history.push(pausedSnapshot(state));
  if (history.length > 100) history.shift();
}
function commit() { save(); render(); }
function undo() {
  if (!history.length) return;
  state = history.pop();
  commit();
  toast('Последнее действие отменено. Таймер на паузе.');
}
function render() {
  $('duration').value = state.duration;
  $('sound').checked = soundEnabled;
  const best = Math.max(...state.players.map(p => p.score));
  const hasScores = state.players.some(p => p.score !== 0);
  $('players').innerHTML = state.players.length ? state.players.map((p, i) => `
    <button class="player ${hasScores && p.score === best ? 'leader' : ''}" data-player="${i}" aria-label="Изменить участника ${escape(p.name)}, счёт ${p.score}">
      <span class="avatar" aria-hidden="true">${avatar(p).icon}</span><span class="player-info"><span class="player-name">${escape(p.name)}</span><strong>${p.score.toLocaleString('ru-RU')}</strong></span>
      ${hasScores && p.score === best ? '<span class="crown" aria-label="Лидирует">♛</span>' : ''}
    </button>`).join('') : '<button class="empty-players" id="first-player">👻 Кто сегодня играет? <span>Добавить участников →</span></button>';
  $('board').innerHTML = categories.filter(c => c.round === state.round).map(c => `
    <section class="category"><h2>${escape(c.name)}<span>${c.questions.filter(q => !state.used.includes(q.id)).length} из ${c.questions.length} осталось</span></h2>
      <div class="tiles">${c.questions.map((q, i) => `<button data-q="${q.id}" ${state.used.includes(q.id) ? 'disabled' : ''} aria-label="${escape(c.name)}, вопрос ${i + 1}, ${q.value} очков${state.used.includes(q.id) ? ', сыгран' : ''}"><span>${state.used.includes(q.id) ? '👻' : q.value}</span><small>№ ${i + 1}</small></button>`).join('')}</div>
    </section>`).join('');
  for (const n of [1, 2]) {
    $('r' + n).classList.toggle('selected', state.round === n);
    $('r' + n).setAttribute('aria-pressed', String(state.round === n));
  }
  $('undo').disabled = $('undo-card').disabled = !history.length;
  $('add').disabled = state.players.length >= 40;
  const questions = categories.filter(c => c.round === state.round).flatMap(c => c.questions);
  const done = questions.filter(q => state.used.includes(q.id)).length;
  $('round-name').textContent = `Раунд ${state.round === 1 ? 'I' : 'II'} · ${state.round === 1 ? 'Знакомимся с легендой' : 'Максимальный уровень'}`;
  $('progress').textContent = `${done} / ${questions.length} сыграно`;
  $('round-end').hidden = done !== questions.length;
  $('round-end').innerHTML = state.round === 1
    ? '<span>🎃 Первый раунд пройден. Самое интересное впереди!</span><button id="next-round" class="primary">Ко второму раунду →</button>'
    : '<span>🎉 Все вопросы сыграны. Время поздравлений!</span><button id="final-results" class="primary">Показать итоги →</button>';
  renderCard();
}
function pictures(paths, label) {
  return paths.length ? `<div class="photos">${paths.map((src, i) => `<button class="photo-button" data-photo="${escape(src)}" aria-label="Увеличить ${label} ${i + 1}"><img src="${encodeURI(src)}" alt="${label} ${i + 1}"><span>⛶ Увеличить</span></button>`).join('')}</div>` : '';
}
function renderCard() {
  const a = state.active;
  if (!a) { $('card').close(); return; }
  const q = questionById(a.id), category = categories.find(c => c.questions.some(item => item.id === q.id));
  $('question-meta').textContent = `${category.name} · ${q.value} очков`;
  $('question').innerHTML = `<h2 id="question-text">${escape(q.question)}</h2>${!a.revealed ? pictures(q.images, 'Фото к вопросу') : ''}
    ${a.revealed ? `<section class="reveal"><span class="eyebrow">ПРАВИЛЬНЫЙ ОТВЕТ</span>${q.answer ? `<p>${escape(q.answer)}</p>` : ''}${pictures(q.answerImages.length ? q.answerImages : q.images, q.answerImages.length ? 'Фото с ответом' : 'Фото к вопросу')}</section>` : ''}`;
  $('answer').disabled = a.revealed;
  $('answer').textContent = a.revealed ? '✓ Ответ открыт' : 'Показать ответ';
  $('timer-reset').disabled = a.revealed || a.winner !== null;
  $('back').disabled = a.attempted.length > 0;
  $('back').title = a.attempted.length ? 'Сначала отмените начисление или списание очков' : 'Вопрос останется доступным';
  $('judges').innerHTML = state.players.length ? state.players.map((p, i) => {
    const attempted = a.attempted.includes(i), disabled = attempted || a.winner !== null;
    return `<div class="judge ${a.winner === i ? 'correct' : ''}"><span class="judge-name">${avatar(p).icon} ${escape(p.name)} <small>${p.score}</small></span>
      <div><button class="right" data-judge="${i}" data-sign="1" ${disabled ? 'disabled' : ''} aria-label="${escape(p.name)}: верно, плюс ${q.value}">✓ +${q.value}</button>
      <button class="wrong" data-judge="${i}" data-sign="-1" ${disabled ? 'disabled' : ''} aria-label="${escape(p.name)}: неверно, минус ${q.value}">✕ −${q.value}</button></div>
      <small class="attempt">${a.winner === i ? 'Верный ответ!' : attempted ? 'Ответ уже принят' : '&nbsp;'}</small></div>`;
  }).join('') : '<p class="muted">Участников пока нет. Верните вопрос на табло и добавьте игроков.</p>';
  if (!$('card').open) $('card').showModal();
  tick();
  const revealed = $('question').querySelector('.reveal');
  if (revealed) {
    // Wait for real image dimensions before moving the answer into view.
    const loaded = [...revealed.querySelectorAll('img')].map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
    void Promise.all(loaded).then(() => {
      if (revealed.isConnected) revealed.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
}
function gentleSignal() {
  if (!soundEnabled) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    for (const [offset, frequency] of [[0, 660], [.2, 880]]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + offset;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.06, start + .02);
      gain.gain.exponentialRampToValueAtTime(.001, start + .25);
      oscillator.connect(gain).connect(audio.destination); oscillator.start(start); oscillator.stop(start + .26);
    }
  } catch { /* Audio is optional. */ }
}
function tick() {
  const a = state?.active;
  if (!a) return;
  const left = remaining(a);
  $('clock').textContent = Math.ceil(left).toString().padStart(2, '0');
  $('timer-fill').style.width = `${Math.min(100, left / state.duration * 100)}%`;
  $('card').classList.toggle('time-low', left <= 5 && left > 0 && !a.revealed);
  $('timer-status').textContent = a.winner !== null ? 'Ответ принят' : a.revealed ? 'Ответ открыт' : left <= 0 ? 'Время вышло' : a.running ? 'Время на вопрос' : 'Пауза';
  $('pause').textContent = a.running ? '⏸ Пауза' : '▶ Продолжить';
  $('pause').disabled = a.revealed || a.winner !== null || left <= 0;
  if (a.running && left <= 0) {
    a.left = 0; a.running = false;
    save(); gentleSignal(); toast('Время вышло! Решение за ведущим.');
  }
}
function pause() {
  if (!state.active || state.active.revealed || state.active.winner !== null || remaining(state.active) <= 0) return;
  checkpoint(); toggleTimer(state); commit();
}
function reveal() {
  if (!state.active || state.active.revealed) return;
  checkpoint();
  state.active.left = remaining(state.active); state.active.running = false; state.active.revealed = true;
  commit();
}
function editPlayer(index = null) {
  editingPlayer = index;
  const p = index === null ? { name: '', score: 0, avatar: state.players.length % AVATARS.length } : state.players[index];
  $('player-title').textContent = index === null ? 'Новый участник' : 'Участник и счёт';
  $('avatars').innerHTML = `<legend>Аватар</legend><div class="avatar-options">${AVATARS.map((a, i) => `<label class="avatar-option" title="${a.name}"><input type="radio" name="avatar" value="${i}" ${p.avatar === i ? 'checked' : ''} required><span aria-hidden="true">${a.icon}</span><span class="sr-only">${a.name}</span></label>`).join('')}</div>`;
  $('player-name').value = p.name; $('player-score').value = p.score;
  $('player-dialog').showModal(); $('player-name').focus();
}
function showResults() {
  let lastScore = null, rank = 0;
  $('standings').innerHTML = [...state.players].sort((a, b) => b.score - a.score).map((p, i) => {
    if (p.score !== lastScore) rank = i + 1;
    lastScore = p.score;
    return `<div class="standing ${rank === 1 ? 'first' : ''}"><span class="rank">${rank}</span><span class="avatar">${avatar(p).icon}</span><span>${escape(p.name)}</span><strong>${p.score}</strong></div>`;
  }).join('') || '<p class="muted">Сначала добавьте участников.</p>';
  $('results-dialog').showModal();
}

$('board').onclick = event => {
  const button = event.target.closest('[data-q]');
  if (!button || button.disabled) return;
  checkpoint(); openQuestion(state, button.dataset.q); commit();
};
$('judges').onclick = event => {
  const button = event.target.closest('[data-judge]');
  if (!button || button.disabled) return;
  checkpoint();
  if (scoreAnswer(state, Number(button.dataset.judge), Number(button.dataset.sign), questionById(state.active.id))) {
    commit(); toast(Number(button.dataset.sign) === 1 ? 'Верно! Очки начислены 🎉' : 'Очки списаны. Остальные могут отвечать.');
  }
};
$('players').onclick = event => {
  const player = event.target.closest('[data-player]');
  if (player) editPlayer(Number(player.dataset.player));
  else if (event.target.closest('#first-player')) editPlayer();
};
$('player-form').onsubmit = event => {
  event.preventDefault();
  const name = $('player-name').value.trim(), score = Number($('player-score').value);
  if (!name || !Number.isSafeInteger(score) || Math.abs(score) > 1e6) return;
  checkpoint();
  const player = { name, score, avatar: Number($('avatars').querySelector('input:checked').value) };
  if (editingPlayer === null) state.players.push(player); else state.players[editingPlayer] = player;
  $('player-dialog').close(); commit();
};
$('add').onclick = () => editPlayer();
for (const n of [1, 2]) $('r' + n).onclick = () => {
  if (state.round === n) return;
  checkpoint(); state.round = n; commit();
};
$('round-end').onclick = event => {
  if (event.target.id === 'next-round') { checkpoint(); state.round = 2; commit(); }
  if (event.target.id === 'final-results') showResults();
};
$('settings').onclick = () => $('settings-dialog').showModal();
$('duration').onchange = () => {
  checkpoint(); state.duration = Math.round(Math.min(300, Math.max(5, Number($('duration').value) || 30))); commit();
};
$('sound').onchange = () => {
  soundEnabled = $('sound').checked;
  try { localStorage.setItem('max-game-sound', soundEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  if (soundEnabled) gentleSignal();
};
$('pause').onclick = pause;
$('timer-reset').onclick = () => {
  const a = state.active;
  if (!a || a.revealed || a.winner !== null) return;
  if (remaining(a) > 0 && !confirm('Заново запустить таймер этого вопроса?')) return;
  checkpoint(); a.left = state.duration; a.since = Date.now(); a.running = true; commit();
};
$('answer').onclick = reveal;
$('close').onclick = () => {
  if (!state.active) return;
  if (!state.active.revealed && state.active.winner === null && !confirm('Завершить вопрос без показа ответа?')) return;
  checkpoint(); finishQuestion(state); commit();
};
$('back').onclick = () => {
  if (!state.active || state.active.attempted.length) return;
  if (state.active.revealed && !confirm('Ответ уже показан. Вернуть этот вопрос на табло?')) return;
  checkpoint(); state.active = null; commit();
};
$('card').oncancel = event => { event.preventDefault(); if (state.active?.running) pause(); };
$('undo').onclick = $('undo-card').onclick = undo;
$('results').onclick = showResults;
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Полноэкранный режим недоступен. Можно развернуть окно браузера.'); }
}
$('full').onclick = fullscreen;
$('reset').onclick = () => {
  if (!confirm('Начать заново? Счёт и сыгранные вопросы будут сброшены. Участники останутся.')) return;
  checkpoint(); state = { ...initialState(), duration: state.duration, players: state.players.map(p => ({ ...p, score: 0 })) };
  $('settings-dialog').close(); commit(); toast('Новая игра. Все снова на равных 🎃');
};
$('export').onclick = () => {
  const data = { format: 'max-game', version: 1, exportedAt: new Date().toISOString(), state: pausedSnapshot(state) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `svoya-igra-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Копия скачана. Её можно загрузить в настройках.');
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; $('import-file').value = '';
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Слишком большой файл сохранения.');
    const parsed = JSON.parse(await file.text());
    const next = validateState(parsed.format === 'max-game' && parsed.version === 1 ? parsed.state : parsed, categories);
    if (!confirm('Загрузить сохранение вместо текущей игры? Текущее состояние можно будет вернуть кнопкой «Отменить».')) return;
    checkpoint(); state = pausedSnapshot(next);
    $('settings-dialog').close(); commit(); toast('Игра восстановлена. Таймер на паузе.');
  } catch { toast('Не удалось загрузить копию. Нужен JSON-файл сохранения этой игры.'); }
};
document.addEventListener('click', event => {
  const close = event.target.closest('[data-dismiss]');
  if (close) $(close.dataset.dismiss).close();
  const photo = event.target.closest('[data-photo]');
  if (photo) {
    if (state.active?.running) pause();
    $('photo-large').src = photo.dataset.photo; $('photo-dialog').showModal();
  }
});
$('photo-close').onclick = () => $('photo-dialog').close();
document.addEventListener('keydown', event => {
  if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
  if (['player-dialog', 'settings-dialog', 'results-dialog', 'photo-dialog'].some(id => $(id).open)) return;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.code === 'KeyZ') { event.preventDefault(); undo(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.code === 'Space' && state.active) { event.preventDefault(); pause(); }
  if (event.code === 'KeyA' && state.active) { event.preventDefault(); reveal(); }
  if (event.code === 'KeyF') { event.preventDefault(); void fullscreen(); }
});
window.addEventListener('online', () => { if (dirty) save(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

try {
  const response = await fetch('/questions.json');
  if (!response.ok) throw new Error('Не удалось загрузить вопросы.');
  categories = await response.json();
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('server');
    const loaded = await response.json();
    state = loaded === null ? initialState() : validateState(loaded, categories);
    $('save').textContent = '● Игра сохранена'; $('save').className = 'saved';
  } catch {
    let backup;
    try { backup = localStorage.getItem(CACHE); } catch { /* No browser copy. */ }
    state = backup ? validateState(JSON.parse(backup), categories) : initialState();
    state = pausedSnapshot(state);
    dirty = true;
    $('save').textContent = '● Сервер недоступен. Скачайте копию в настройках.'; $('save').className = 'save-error';
    toast(backup ? 'Открыта резервная копия браузера. Таймер на паузе.' : 'Нет связи с сервером. Изменения пока сохранятся в браузере.');
  }
  render();
  setInterval(tick, 100);
  setInterval(() => { if (dirty) save(); }, 15000);
} catch {
  $('save').textContent = 'Не удалось открыть игру. Перезапустите сервер и обновите страницу.';
  $('save').className = 'save-error';
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
}
