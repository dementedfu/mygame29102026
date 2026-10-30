import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateState } from './public/game.js';

const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(project, 'public');
const categories = JSON.parse(await readFile(path.join(root, 'questions.json'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

export async function createGameServer({ stateDir = path.join(project, '.local') } = {}) {
  await mkdir(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'state.json');
  let writes = Promise.resolve();
  async function load() {
    try {
      const value = JSON.parse(await readFile(stateFile, 'utf8'));
      return value === null ? null : validateState(value, categories);
    }
    catch (error) {
      try { return validateState(JSON.parse(await readFile(stateFile + '.bak', 'utf8')), categories); }
      catch (backupError) {
        if (error.code === 'ENOENT' && backupError.code === 'ENOENT') return null;
        throw new Error('Не удалось прочитать сохранение.');
      }
    }
  }
  function store(state) {
    const operation = writes.then(async () => {
      const previous = await load();
      if (previous) {
        await writeFile(stateFile + '.bak.tmp', JSON.stringify(previous));
        await rename(stateFile + '.bak.tmp', stateFile + '.bak');
      }
      await writeFile(stateFile + '.tmp', JSON.stringify(state));
      await rename(stateFile + '.tmp', stateFile);
    });
    writes = operation.catch(() => {});
    return operation;
  }
  return http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/state') {
        if (req.method === 'GET') { await writes; return json(200, await load()); }
        if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return json(405, { error: 'Метод не поддерживается.' }); }
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: 'Недопустимый источник запроса.' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 1000000) return json(413, { error: 'Слишком большой файл.' });
        }
        let state;
        try { state = validateState(JSON.parse(body), categories); }
        catch { return json(400, { error: 'Некорректное сохранение игры.' }); }
        await store(state);
        return json(200, { saved: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      let content;
      try { content = await readFile(file); }
      catch (error) { if (['ENOENT', 'EISDIR'].includes(error.code)) { res.writeHead(404); return res.end('Not found'); } throw error; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error('Ошибка сервера:', error.message);
      if (!res.headersSent) json(500, { error: 'Не удалось сохранить или прочитать игру. Скачайте копию в настройках.' });
      else res.end();
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createGameServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Порт занят. Возможно, игра уже запущена: откройте http://localhost:3000 или закройте предыдущее окно игры.'
      : `Не удалось запустить игру: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`\n🎃 Максимально своя игра\nОткройте в браузере: http://localhost:${server.address().port}\nОставьте это окно открытым во время игры. Для остановки нажмите Ctrl+C.\n`);
  });
}
