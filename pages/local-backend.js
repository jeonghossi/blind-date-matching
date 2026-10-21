// 깃허브 페이지 버전: server.js가 하던 일을 브라우저 안에서 대신한다
// - 데이터(계정, 프로필, 랜덤 매칭 상태)는 localStorage → 같은 브라우저의 모든 탭이 공유
// - 로그인은 sessionStorage → 탭마다 다른 계정으로 로그인 가능 (두 사람처럼 테스트)
// - 다른 탭의 변경은 storage 이벤트로 실시간 반영
(function () {
  const { recommend, matchAll, validateProfile, filterPair, scorePair } = window.Matching;
  const { checkOllama, runAiMatch } = window.AiMatch;
  const { RandomMatchService } = window.RandomMatch;
  const { sampleProfiles } = window.SampleData;

  const KEYS = { profiles: 'bdm:profiles', users: 'bdm:users', random: 'bdm:random' };
  const SESSION_KEY = 'bdm:userId';
  const PROFILE_FIELDS = ['name', 'gender', 'age', 'height', 'region', 'job', 'religion', 'mbti', 'drinking', 'smoking', 'intent', 'interests', 'preferences'];

  // ---- 저장소 (막혀 있어도 동작하도록 try/catch) ----

  const memory = {};
  const store = {
    get(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch {
        return memory[key] ?? null;
      }
    },
    set(key, value) {
      memory[key] = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
    remove(key) {
      delete memory[key];
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };

  let tabUserId = null;
  const session = {
    get() {
      try {
        return sessionStorage.getItem(SESSION_KEY);
      } catch {
        return tabUserId;
      }
    },
    set(id) {
      tabUserId = id;
      try {
        if (id) sessionStorage.setItem(SESSION_KEY, id);
        else sessionStorage.removeItem(SESSION_KEY);
      } catch {}
    },
  };

  // ---- 비밀번호 해시 (Web Crypto PBKDF2) ----

  const enc = (s) => new TextEncoder().encode(s);
  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function derive(password, salt) {
    const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc(salt), iterations: 50000, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }

  async function hashPassword(password) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await derive(password, salt) };
  }

  async function verifyPassword(password, { salt, hash }) {
    return (await derive(String(password), salt)) === hash;
  }

  function validateCredentials(username, password) {
    const errors = [];
    if (!/^[a-z0-9_]{4,20}$/.test(username || '')) errors.push('아이디는 영문 소문자·숫자·_ 4~20자');
    if (typeof password !== 'string' || password.length < 8) errors.push('비밀번호는 8자 이상');
    return errors;
  }

  // ---- 데이터 ----

  let profiles = [];
  let users = [];
  const getProfile = (id) => profiles.find((p) => p.id === id);

  async function seedData() {
    profiles = structuredClone(sampleProfiles);
    const testHash = await hashPassword('test1234'); // 테스트 계정은 같은 해시를 같이 씀 (첫 실행 속도용)
    users = profiles.map((p, i) => ({ id: crypto.randomUUID(), username: `test${i + 1}`, role: 'user', profileId: p.id, ...testHash }));
    users.push({ id: crypto.randomUUID(), username: 'admin', role: 'admin', profileId: null, ...(await hashPassword('admin1234')) });
    saveData();
  }

  async function loadData() {
    profiles = store.get(KEYS.profiles);
    users = store.get(KEYS.users);
    if (!profiles || !users) await seedData();
  }

  function saveData() {
    store.set(KEYS.profiles, profiles);
    store.set(KEYS.users, users);
  }

  // ---- 랜덤 매칭 (상태를 localStorage에 저장해 탭끼리 공유) ----

  class LocalRandom extends RandomMatchService {
    runBot(sessionId, key) {
      loadRandom();
      super.runBot(sessionId, key);
      saveRandom();
      broadcast();
    }
  }

  const random = new LocalRandom({ getProfile });
  const loadRandom = () => random.loadState(store.get(KEYS.random));
  const saveRandom = () => store.set(KEYS.random, random.toJSON());

  const RANDOM_ACTIONS = {
    join: (id) => random.join(id),
    bot: (id) => random.joinWithBot(id),
    cancel: (id) => random.cancelWaiting(id),
    answer: (id, b) => random.answer(id, b.answer),
    decide: (id, b) => random.decide(id, b.keepGoing === true),
    leave: (id) => random.leaveCurrent(id),
  };

  // 이 탭에서 랜덤 매칭 화면을 보고 있는 구독자들
  const listeners = new Set();

  function broadcast() {
    const user = currentUser();
    if (!user || !getProfile(user.profileId)) return;
    const view = random.view(user.profileId);
    listeners.forEach((fn) => fn(view));
  }

  // 다른 탭에서 바뀌면 다시 읽어서 화면 갱신
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.random || e.key === KEYS.profiles || e.key === KEYS.users) {
      profiles = store.get(KEYS.profiles) || profiles;
      users = store.get(KEYS.users) || users;
      loadRandom();
      broadcast();
    }
  });

  // ---- 요청 처리 (server.js의 라우팅과 같은 규칙) ----

  const ok = (data) => ({ status: 200, data });
  const fail = (status, error) => ({ status, data: Array.isArray(error) ? { errors: error } : { error } });
  const currentUser = () => users.find((u) => u.id === session.get()) || null;
  const meResponse = (u) => ({ user: { username: u.username, role: u.role }, profile: getProfile(u.profileId) || null });

  function requireUser({ profile = false, admin = false } = {}) {
    const user = currentUser();
    if (!user) return [null, fail(401, '로그인이 필요해요')];
    if (admin && user.role !== 'admin') return [null, fail(403, '관리자만 할 수 있어요')];
    if (profile && !getProfile(user.profileId)) return [null, fail(403, '먼저 프로필을 만들어 주세요')];
    return [user, null];
  }

  async function route(method, path, body) {
    const url = new URL(path, location.href);
    const r = `${method} ${url.pathname}`;
    const parts = url.pathname.split('/').filter(Boolean);

    // 계정
    if (r === 'POST /api/auth/signup') {
      const { username, password } = body;
      const errors = validateCredentials(username, password);
      if (users.some((u) => u.username === username)) errors.push('이미 있는 아이디예요');
      if (errors.length) return fail(400, errors);
      const user = { id: crypto.randomUUID(), username, role: 'user', profileId: null, ...(await hashPassword(password)) };
      users.push(user);
      saveData();
      session.set(user.id);
      return ok(meResponse(user));
    }
    if (r === 'POST /api/auth/login') {
      const user = users.find((u) => u.username === body.username);
      if (!user || !(await verifyPassword(body.password ?? '', user))) return fail(401, '아이디 또는 비밀번호가 틀렸어요');
      session.set(user.id);
      return ok(meResponse(user));
    }
    if (r === 'POST /api/auth/logout') {
      session.set(null);
      return ok({ ok: true });
    }
    if (r === 'GET /api/auth/me') {
      const user = currentUser();
      return ok(user ? meResponse(user) : { user: null, profile: null });
    }

    // 내 프로필
    if (r === 'POST /api/profiles/me' || r === 'PUT /api/profiles/me') {
      const [user, err] = requireUser();
      if (err) return err;
      if (user.role === 'admin') return fail(403, '관리자 계정은 프로필을 만들 수 없어요');
      const existing = getProfile(user.profileId);
      if (method === 'POST' && existing) return fail(409, '이미 프로필이 있어요');
      if (method === 'PUT' && !existing) return fail(404, '프로필이 없어요');
      const errors = validateProfile(body);
      if (errors.length) return fail(400, errors);
      const fields = Object.fromEntries(PROFILE_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
      if (existing) {
        Object.assign(existing, fields, { id: existing.id });
      } else {
        const profile = { ...fields, id: crypto.randomUUID() };
        profiles.push(profile);
        user.profileId = profile.id;
      }
      saveData();
      return ok(meResponse(user));
    }

    // 추천
    if (r === 'GET /api/recommendations/me') {
      const [user, err] = requireUser({ profile: true });
      if (err) return err;
      return ok(recommend(getProfile(user.profileId), profiles));
    }

    // 랜덤 매칭
    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'random' && RANDOM_ACTIONS[parts[2]]) {
      const [user, err] = requireUser({ profile: true });
      if (err) return err;
      try {
        RANDOM_ACTIONS[parts[2]](user.profileId, body);
      } catch (e) {
        return fail(400, e.message);
      }
      saveRandom();
      setTimeout(broadcast);
      return ok(random.view(user.profileId));
    }

    // AI 매칭: 이 컴퓨터에서 Ollama가 켜져 있어야 함
    if (r === 'GET /api/ai/status') {
      const [, err] = requireUser();
      if (err) return err;
      const status = await checkOllama();
      if (!status.ok && status.error.includes('연결할 수 없어요')) {
        status.error = '이 컴퓨터의 Ollama에 연결할 수 없어요 (README의 "깃허브 페이지에서 AI 쓰기" 참고)';
      }
      return ok(status);
    }

    // 관리자
    if (r === 'GET /api/admin/profiles') {
      const [, err] = requireUser({ admin: true });
      if (err) return err;
      const owner = Object.fromEntries(users.map((u) => [u.profileId, u.username]));
      return ok(profiles.map((p) => ({ ...p, username: owner[p.id] || null })));
    }
    if (method === 'DELETE' && parts[1] === 'admin' && parts[2] === 'profiles' && parts[3]) {
      const [, err] = requireUser({ admin: true });
      if (err) return err;
      random.leaveCurrent(parts[3]);
      saveRandom();
      profiles = profiles.filter((p) => p.id !== parts[3]);
      users.forEach((u) => {
        if (u.profileId === parts[3]) u.profileId = null;
      });
      saveData();
      return ok({ ok: true });
    }
    if (r === 'POST /api/admin/reset') {
      const [, err] = requireUser({ admin: true });
      if (err) return err;
      store.remove(KEYS.random);
      random.reset();
      await seedData();
      session.set(null);
      return ok({ ok: true });
    }
    if (r === 'GET /api/admin/matches') {
      const [, err] = requireUser({ admin: true });
      if (err) return err;
      return ok(matchAll(profiles, { minScore: Number(url.searchParams.get('minScore') ?? 40) }));
    }

    return fail(404, 'not found');
  }

  window.localBackend = {
    async request(method, path, body = {}) {
      await loadData();
      loadRandom();
      return route(method, path, body);
    },
    // AI 매칭: 브라우저에서 바로 이 컴퓨터의 Ollama를 호출 → 중지 함수 반환
    aiMatch(onEvent) {
      const controller = new AbortController();
      (async () => {
        await loadData();
        const user = currentUser();
        const me = user && getProfile(user.profileId);
        if (!me) return onEvent({ type: 'error', error: '먼저 프로필을 만들어 주세요' });
        const status = await checkOllama();
        if (!status.ok) return onEvent({ type: 'error', error: status.error });
        await runAiMatch(me, profiles, {
          model: status.model,
          guard: filterPair,
          ruleScore: (a, b) => scorePair(a, b).score,
          onEvent,
          signal: controller.signal,
        });
      })().catch((e) => onEvent({ type: 'error', error: e.message }));
      return () => controller.abort();
    },
    // 랜덤 매칭 상태 구독 → 구독 해제 함수 반환
    subscribe(fn) {
      listeners.add(fn);
      loadData().then(() => {
        loadRandom();
        broadcast();
      });
      return () => listeners.delete(fn);
    },
  };
})();
