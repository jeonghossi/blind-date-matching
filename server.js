// 외부 패키지 없이 동작하는 간단한 웹 서버
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { recommend, matchAll, validateProfile, filterPair, scorePair } = require('./src/matching');
const { DEFAULT_OLLAMA_URL, DEFAULT_MODEL, CHAT_MODEL, checkOllama, runAiMatch, askAi } = require('./src/aiMatch');
const { sampleProfiles } = require('./src/sampleData');
const { RandomMatchService } = require('./src/randomMatch');
const { SESSION_TTL_MS, hashPassword, verifyPassword, validateCredentials, SessionStore, parseCookies } = require('./src/auth');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COOKIE = 'sid';
// 로컬 LLM 설정 (환경 변수로 바꿀 수 있음)
const LLM = { baseUrl: process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL, model: process.env.OLLAMA_MODEL || DEFAULT_MODEL };
const PROFILE_FIELDS = ['name', 'gender', 'age', 'height', 'region', 'job', 'religion', 'mbti', 'drinking', 'smoking', 'intent', 'interests', 'preferences'];

// ---------------------------------------------------------------------------
// 데이터 (프로필 + 계정)
// ---------------------------------------------------------------------------

// 샘플 데이터: 샘플 프로필마다 테스트 계정(test1~test20)을 만들고, 관리자 계정(admin)도 만든다
function seedData() {
  const profiles = structuredClone(sampleProfiles);
  const users = profiles.map((p, i) => ({
    id: crypto.randomUUID(), username: `test${i + 1}`, role: 'user', profileId: p.id, ...hashPassword('test1234'),
  }));
  users.push({ id: crypto.randomUUID(), username: 'admin', role: 'admin', profileId: null, ...hashPassword('admin1234') });
  return { profiles, users };
}

let profiles;
let users;

function loadData() {
  try {
    profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    ({ profiles, users } = seedData());
    saveData();
  }
}

function saveData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

loadData();
const sessions = new SessionStore();
const getProfile = (id) => profiles.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// 랜덤 매칭 (실시간: Server-Sent Events)
// ---------------------------------------------------------------------------

const random = new RandomMatchService({ getProfile });
const sseClients = new Map(); // profileId → Set(res)

function pushState(profileId) {
  const data = `data: ${JSON.stringify(random.view(profileId))}\n\n`;
  for (const res of sseClients.get(profileId) || []) res.write(data);
}
random.on('update', pushState);

function openEventStream(req, res, profileId) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  if (!sseClients.has(profileId)) sseClients.set(profileId, new Set());
  sseClients.get(profileId).add(res);
  pushState(profileId);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => {
    clearInterval(ping);
    sseClients.get(profileId)?.delete(res);
  });
}

const RANDOM_ACTIONS = {
  join: (id) => random.join(id),
  bot: (id) => random.joinWithBot(id),
  cancel: (id) => random.cancelWaiting(id),
  answer: (id, b) => random.answer(id, b.answer),
  decide: (id, b) => random.decide(id, b.keepGoing === true),
  leave: (id) => random.leaveCurrent(id),
};

// ---------------------------------------------------------------------------
// HTTP 도우미
// ---------------------------------------------------------------------------

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': `${MIME[path.extname(filePath)] || 'text/plain'}; charset=utf-8` });
    res.end(content);
  });
}

const sessionCookie = (token) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
const clearCookie = `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  const userId = sessions.get(token);
  return userId ? users.find((u) => u.id === userId) : null;
}

// 로그인/프로필/관리자 권한 확인. 통과하지 못하면 응답을 보내고 null 반환
function requireUser(req, res, { profile = false, admin = false } = {}) {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: '로그인이 필요해요' }), null;
  if (admin && user.role !== 'admin') return sendJson(res, 403, { error: '관리자만 할 수 있어요' }), null;
  if (profile && !getProfile(user.profileId)) return sendJson(res, 403, { error: '먼저 프로필을 만들어 주세요' }), null;
  return user;
}

const publicUser = (u) => ({ username: u.username, role: u.role });
const meResponse = (u) => ({ user: publicUser(u), profile: getProfile(u.profileId) || null });

// ---------------------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // ---- 계정 ----
    if (route === 'POST /api/auth/signup') {
      const { username, password } = await readBody(req);
      const errors = validateCredentials(username, password);
      if (users.some((u) => u.username === username)) errors.push('이미 있는 아이디예요');
      if (errors.length) return sendJson(res, 400, { errors });
      const user = { id: crypto.randomUUID(), username, role: 'user', profileId: null, ...hashPassword(password) };
      users.push(user);
      saveData();
      return sendJson(res, 201, meResponse(user), { 'Set-Cookie': sessionCookie(sessions.create(user.id)) });
    }

    if (route === 'POST /api/auth/login') {
      const { username, password } = await readBody(req);
      const user = users.find((u) => u.username === username);
      if (!user || !verifyPassword(password ?? '', user)) {
        return sendJson(res, 401, { error: '아이디 또는 비밀번호가 틀렸어요' });
      }
      return sendJson(res, 200, meResponse(user), { 'Set-Cookie': sessionCookie(sessions.create(user.id)) });
    }

    if (route === 'POST /api/auth/logout') {
      sessions.delete(parseCookies(req.headers.cookie)[COOKIE]);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    if (route === 'GET /api/auth/me') {
      const user = currentUser(req);
      return sendJson(res, 200, user ? meResponse(user) : { user: null, profile: null });
    }

    // ---- 내 프로필 (계정 1개당 1개) ----
    if (route === 'POST /api/profiles/me' || route === 'PUT /api/profiles/me') {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role === 'admin') return sendJson(res, 403, { error: '관리자 계정은 프로필을 만들 수 없어요' });
      const existing = getProfile(user.profileId);
      if (req.method === 'POST' && existing) return sendJson(res, 409, { error: '이미 프로필이 있어요' });
      if (req.method === 'PUT' && !existing) return sendJson(res, 404, { error: '프로필이 없어요' });

      const body = await readBody(req);
      const errors = validateProfile(body);
      if (errors.length) return sendJson(res, 400, { errors });
      // 정해진 항목만 저장 (id 등을 바꿔치기 못 하게)
      const fields = Object.fromEntries(PROFILE_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
      if (existing) {
        Object.assign(existing, fields, { id: existing.id });
      } else {
        const profile = { ...fields, id: crypto.randomUUID() };
        profiles.push(profile);
        user.profileId = profile.id;
      }
      saveData();
      return sendJson(res, 200, meResponse(user));
    }

    // ---- 내 추천 ----
    if (route === 'GET /api/recommendations/me') {
      const user = requireUser(req, res, { profile: true });
      if (!user) return;
      return sendJson(res, 200, recommend(getProfile(user.profileId), profiles));
    }

    // ---- 🤖 AI 매칭 (로컬 LLM) ----
    if (route === 'GET /api/ai/status') {
      if (!requireUser(req, res)) return;
      return sendJson(res, 200, await checkOllama(LLM));
    }

    // 진행 상황을 SSE로 하나씩 보내 준다. 브라우저가 연결을 끊으면 LLM 호출도 멈춤
    if (route === 'GET /api/ai-match/stream') {
      const user = requireUser(req, res, { profile: true });
      if (!user) return;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      const status = await checkOllama(LLM);
      if (!status.ok) {
        send({ type: 'error', error: status.error });
        return res.end();
      }
      await runAiMatch(getProfile(user.profileId), profiles, {
        ...LLM,
        model: status.model,
        guard: filterPair,
        ruleScore: (a, b) => scorePair(a, b).score,
        onEvent: send,
        signal: controller.signal,
      });
      return res.end();
    }

    // 💬 AI에게 물어보기: 답을 한 조각씩 NDJSON으로 흘려보낸다
    if (route === 'POST /api/ai/ask') {
      const user = requireUser(req, res, { profile: true });
      if (!user) return;
      const { candidateId, messages, aiJudgment } = await readBody(req);
      const me = getProfile(user.profileId);
      const other = getProfile(candidateId);
      if (!other || other.id === me.id) return sendJson(res, 404, { error: '상대를 찾을 수 없어요' });
      const status = await checkOllama({ ...LLM, model: CHAT_MODEL });
      if (!status.ok) return sendJson(res, 503, { error: status.error });

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      const send = (event) => res.write(`${JSON.stringify(event)}\n`);
      try {
        await askAi(me, other, {
          baseUrl: LLM.baseUrl,
          history: messages,
          breakdown: scorePair(me, other).breakdown,
          aiJudgment,
          onToken: (text) => send({ type: 'token', text }),
          signal: controller.signal,
        });
        send({ type: 'done' });
      } catch (e) {
        if (!controller.signal.aborted) send({ type: 'error', error: e.message });
      }
      return res.end();
    }

    // ---- 랜덤 매칭 (항상 로그인한 본인 프로필로만) ----
    if (route === 'GET /api/random/events') {
      const user = requireUser(req, res, { profile: true });
      if (!user) return;
      return openEventStream(req, res, user.profileId);
    }

    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'random' && RANDOM_ACTIONS[parts[2]]) {
      const user = requireUser(req, res, { profile: true });
      if (!user) return;
      const body = await readBody(req);
      try {
        RANDOM_ACTIONS[parts[2]](user.profileId, body);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
      return sendJson(res, 200, random.view(user.profileId));
    }

    // ---- 관리자 ----
    if (route === 'GET /api/admin/profiles') {
      if (!requireUser(req, res, { admin: true })) return;
      const owner = Object.fromEntries(users.map((u) => [u.profileId, u.username]));
      return sendJson(res, 200, profiles.map((p) => ({ ...p, username: owner[p.id] || null })));
    }

    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'profiles' && parts[3]) {
      if (!requireUser(req, res, { admin: true })) return;
      random.leaveCurrent(parts[3]);
      profiles = profiles.filter((p) => p.id !== parts[3]);
      users.forEach((u) => {
        if (u.profileId === parts[3]) u.profileId = null;
      });
      saveData();
      return sendJson(res, 200, { ok: true });
    }

    if (route === 'POST /api/admin/reset') {
      if (!requireUser(req, res, { admin: true })) return;
      ({ profiles, users } = seedData());
      saveData();
      sessions.clear();
      random.reset();
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    if (route === 'GET /api/admin/matches') {
      if (!requireUser(req, res, { admin: true })) return;
      const minScore = Number(url.searchParams.get('minScore') ?? 40);
      return sendJson(res, 200, matchAll(profiles, { minScore }));
    }

    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveStatic(req, res);
    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`소개팅 매칭 서버 실행 중: http://localhost:${PORT}`);
});
