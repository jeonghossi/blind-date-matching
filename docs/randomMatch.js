// src/randomMatch.js 에서 자동 생성 — 직접 수정하지 마세요 (npm run build:pages)
(function () {
  const module = { exports: {} };
// 랜덤 매칭 + 익명 미션
// - 점수와 상관없이 대기 중인 사람끼리 무작위로 연결 (원하는 성별만 확인)
// - 서로 프로필은 모른 채 익명 닉네임으로 미션 수행
// - 미션 1개가 끝날 때마다 계속할지/그만할지 선택. 한 명이라도 그만하면 관계 종료
// - 그만둔 상대와는 다시 매칭되지 않음
// - 모든 미션을 끝내면 서로 프로필 공개

// Node와 브라우저(깃허브 페이지) 양쪽에서 쓰기 위해 외부 모듈 없이 작성
const randomUUID = () => globalThis.crypto.randomUUID();

class Emitter {
  constructor() {
    this.listeners = {};
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  emit(event, ...args) {
    (this.listeners[event] || []).forEach((fn) => fn(...args));
  }
}

const LIKE = ['👍 좋아요', '👎 싫어요'];
const MAX_TEXT = 100;
const MAX_TOPIC = 30;

// ---------------------------------------------------------------------------
// 미션 목록
// ---------------------------------------------------------------------------

const MISSION_POOL = [
  // ⚖️ 밸런스 게임
  { kind: 'balance', title: '⚖️ 밸런스 게임', question: '여행 간다면?', options: ['🌊 바다', '⛰️ 산'] },
  { kind: 'balance', title: '⚖️ 밸런스 게임', question: '첫 데이트는?', options: ['🎬 영화관', '☕ 카페 수다'] },
  { kind: 'balance', title: '⚖️ 밸런스 게임', question: '연락 스타일은?', options: ['📱 자주 연락', '🧘 필요할 때만'] },
  { kind: 'balance', title: '⚖️ 밸런스 게임', question: '쉬는 날엔?', options: ['🏠 집콕', '🚶 밖으로'] },
  { kind: 'balance', title: '⚖️ 밸런스 게임', question: '평생 하나만 먹는다면?', options: ['🍕 피자', '🍗 치킨'] },
  // 💭 취향 질문
  { kind: 'text', title: '🍜 취향 공개', question: '지금 제일 먹고 싶은 음식은?' },
  { kind: 'text', title: '🎵 취향 공개', question: '요즘 자주 듣는 노래 한 곡!' },
  { kind: 'text', title: '🌙 상상하기', question: '완벽한 주말을 한 문장으로 표현하면?' },
  { kind: 'text', title: '✈️ 상상하기', question: '지금 당장 떠날 수 있다면 어디로?' },
  // 🤝 협동: 텔레파시 (같은 걸 고르면 성공)
  { kind: 'telepathy', title: '🔮 텔레파시 게임', question: '같은 걸 고르면 성공! 아이스크림 맛은?', options: ['🍓 딸기', '🍫 초코', '🌿 민트초코', '🍦 바닐라'] },
  { kind: 'telepathy', title: '🔮 텔레파시 게임', question: '같은 걸 고르면 성공! 데이트 장소는?', options: ['🎡 놀이공원', '🏖️ 바다', '🎤 노래방', '🍷 와인바'] },
  { kind: 'telepathy', title: '🔮 텔레파시 게임', question: '같은 걸 고르면 성공! 다시 태어난다면?', options: ['🐱 고양이', '🐶 강아지', '🐬 돌고래', '🦅 독수리'] },
  // 🤝 협동: 숫자 합 맞추기
  { kind: 'sum', title: '🎯 숫자 합 맞추기', question: '둘이 고른 숫자의 합이 딱 10이면 성공!', target: 10 },
  { kind: 'sum', title: '🎯 숫자 합 맞추기', question: '둘이 고른 숫자의 합이 딱 7이면 성공!', target: 7 },
  // 🤝 협동: 이야기 이어 쓰기 (한 명이 시작, 다른 한 명이 이어서)
  { kind: 'relay', title: '📖 이야기 이어 쓰기', question: '우리의 첫 데이트, 어떻게 될까?' },
  { kind: 'relay', title: '📖 이야기 이어 쓰기', question: '둘이 갑자기 로또 1등이 됐다!' },
  // 👍👎 서로 주제를 내고 좋아하는지 물어보기
  { kind: 'topic', title: '👍👎 좋아? 싫어?', question: '상대에게 물어볼 주제를 하나 내 주세요', hint: '예: 민트초코, 공포영화, 등산' },
  { kind: 'topic', title: '👍👎 좋아? 싫어?', question: '상대에게 물어볼 음식을 하나 내 주세요', hint: '예: 고수, 마라탕, 회' },
];
const FINAL_MISSION = { kind: 'text', title: '💬 마지막 미션', question: '지금까지 상대의 답을 보고 느낀 점 한마디!' };
const MISSIONS_PER_SESSION = 4; // 서로 다른 종류로 4개 + 마지막 미션 1개

// ---------------------------------------------------------------------------
// 미션 종류별 규칙
//   steps: 단계 목록. who = both(둘 다) | starter(시작하는 사람) | follower(이어 받는 사람)
//   context: 지금 단계에서 나에게 보여 줄 이전 단계 정보
//   reveal: 미션이 끝난 뒤 보여 줄 결과
// ---------------------------------------------------------------------------

const first = (s) => s.split(' ')[0]; // '👍 좋아요' → '👍'
const card = (label, text, mine) => ({ label, text, mine });
const bothCards = (a, c) => [card('🙋 나', a[c.me], true), card(c.ptNick, a[c.pt], false)];

const KINDS = {
  balance: {
    steps: (m) => [{ who: 'both', input: 'choice', options: m.options }],
    reveal: ([a], c) => ({ cards: bothCards(a, c), outcome: a[c.me] === a[c.pt] ? '🎉 통했다!' : null }),
  },
  text: {
    steps: () => [{ who: 'both', input: 'text' }],
    reveal: ([a], c) => ({ cards: bothCards(a, c), outcome: null }),
  },
  telepathy: {
    steps: (m) => [{ who: 'both', input: 'choice', options: m.options }],
    reveal: ([a], c) => ({
      cards: bothCards(a, c),
      outcome: a[c.me] === a[c.pt] ? '🎉 텔레파시 성공!' : '😅 아쉽게 실패!',
    }),
  },
  sum: {
    steps: (m) => [{ who: 'both', input: 'number', min: 0, max: m.target }],
    reveal: ([a], c, m) => {
      const total = a[c.me] + a[c.pt];
      return {
        cards: bothCards(a, c),
        outcome: total === m.target ? `🎯 합계 ${total}! 협동 성공` : `😅 합계 ${total}… 아깝다!`,
      };
    },
  },
  relay: {
    steps: () => [
      { who: 'starter', input: 'text', prompt: '✍️ 이야기의 첫 문장을 써 주세요' },
      { who: 'follower', input: 'text', prompt: '✍️ 상대 문장에 이어서 써 주세요' },
    ],
    context: (answers, step, c) =>
      step === 1 && c.me === c.follower ? { label: `${c.ptNick}의 첫 문장`, text: answers[0][c.starter] } : null,
    reveal: ([a, b], c) => ({
      cards: [
        card(c.me === c.starter ? '🙋 나 (시작)' : `${c.ptNick} (시작)`, a[c.starter], c.me === c.starter),
        card(c.me === c.follower ? '🙋 나 (이어서)' : `${c.ptNick} (이어서)`, b[c.follower], c.me === c.follower),
      ],
      outcome: '📖 둘이 함께 만든 이야기 완성!',
    }),
  },
  topic: {
    steps: (m) => [
      { who: 'both', input: 'topic', options: LIKE, hint: m.hint, prompt: '🗂️ 주제를 내고, 나는 어떤지도 골라 주세요' },
      { who: 'both', input: 'choice', options: LIKE, prompt: '🤔 상대가 낸 주제, 어때요?' },
    ],
    context: (answers, step, c) =>
      step === 1 ? { label: `${c.ptNick}가 낸 주제`, text: answers[0][c.pt].topic } : null,
    reveal: ([a, b], c) => {
      const mine = a[c.me];
      const theirs = a[c.pt];
      const same = (mine.taste === b[c.pt]) + (theirs.taste === b[c.me]);
      return {
        cards: [
          card('🙋 내 주제', `「${mine.topic}」 나 ${first(mine.taste)} · 상대 ${first(b[c.pt])}`, true),
          card(`${c.ptNick}의 주제`, `「${theirs.topic}」 상대 ${first(theirs.taste)} · 나 ${first(b[c.me])}`, false),
        ],
        outcome: ['😮 정반대 취향!', '🙂 반은 통했어요', '🎉 취향 완전 일치!'][same],
      };
    },
  },
};

function validateInput(spec, raw) {
  if (spec.input === 'choice') {
    if (!spec.options.includes(raw)) throw new Error('보기 중에서 고르세요');
    return raw;
  }
  if (spec.input === 'number') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < spec.min || n > spec.max) throw new Error(`${spec.min}~${spec.max} 사이 숫자를 고르세요`);
    return n;
  }
  if (spec.input === 'topic') {
    const topic = String(raw?.topic ?? '').trim();
    if (!topic) throw new Error('주제를 입력하세요');
    if (topic.length > MAX_TOPIC) throw new Error(`주제는 ${MAX_TOPIC}자 이내로 입력하세요`);
    if (!spec.options.includes(raw?.taste)) throw new Error('좋아요/싫어요를 골라 주세요');
    return { topic, taste: raw.taste };
  }
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('답을 입력하세요');
  if (text.length > MAX_TEXT) throw new Error(`답은 ${MAX_TEXT}자 이내로 입력하세요`);
  return text;
}

// 화면에 보여 줄 형태로 답 바꾸기
function displayValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return `「${value.topic}」 ${first(value.taste)}`;
  return String(value);
}

// ---------------------------------------------------------------------------
// 봇 (혼자 테스트용)
// ---------------------------------------------------------------------------

const BOT_PROFILE = { id: 'bot', name: '테스트 봇', gender: '?', age: 0, height: 0, region: '서버', job: '봇', mbti: 'BOT', interests: ['미션'] };
const BOT_TEXTS = ['떡볶이!', '아이유 - 밤편지', '늦잠 자고 카페에서 책 읽기', '제주도', '갑자기 비가 와서 우산을 같이 썼다', '답이 다 재밌었어요 😊'];
const BOT_TOPICS = ['민트초코', '공포영화', '고수', '등산', '마라탕'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function botAnswer(spec) {
  if (spec.input === 'choice') return pick(spec.options);
  if (spec.input === 'number') return spec.min + Math.floor(Math.random() * (spec.max - spec.min + 1));
  if (spec.input === 'topic') return { topic: pick(BOT_TOPICS), taste: pick(spec.options) };
  return pick(BOT_TEXTS);
}

// ---------------------------------------------------------------------------

const ANIMALS = ['🦊 여우', '🐰 토끼', '🐻 곰', '🐱 고양이', '🐶 강아지', '🐼 판다', '🐧 펭귄', '🦁 사자', '🐨 코알라', '🦄 유니콘'];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 종류가 겹치지 않게 미션 고르기
function pickMissions() {
  const used = new Set();
  const picked = [];
  for (const m of shuffle(MISSION_POOL)) {
    if (used.has(m.kind)) continue;
    used.add(m.kind);
    picked.push(m);
    if (picked.length === MISSIONS_PER_SESSION) break;
  }
  return [...picked, FINAL_MISSION];
}

const pairKey = (a, b) => [a, b].sort().join('|');

function wantsGender(profile, other) {
  const g = profile.preferences?.preferredGender;
  return !g || g === '상관없음' || g === other.gender;
}

class RandomMatchService extends Emitter {
  // getProfile(id) → 프로필, botDelay: 봇이 답하는 데 걸리는 시간(ms)
  constructor({ getProfile, botDelay = 2000 } = {}) {
    super();
    this.getProfile = getProfile;
    this.botDelay = botDelay;
    this.reset();
  }

  reset() {
    this.queue = []; // 대기 중인 userId
    this.sessions = new Map(); // sessionId → session
    this.userSession = new Map(); // userId → sessionId
    this.lastEnded = new Map(); // userId → 끝난 세션 정보
    this.blocked = new Set(); // 그만둔 쌍
  }

  // ---- 대기열 ----

  join(userId) {
    const me = this.getProfile(userId);
    if (!me) throw new Error('프로필을 찾을 수 없습니다');
    this.leaveCurrent(userId);
    this.lastEnded.delete(userId);

    const candidates = this.queue.filter((otherId) => {
      if (otherId === userId || this.blocked.has(pairKey(userId, otherId))) return false;
      const other = this.getProfile(otherId);
      return other && wantsGender(me, other) && wantsGender(other, me);
    });

    if (candidates.length === 0) {
      if (!this.queue.includes(userId)) this.queue.push(userId);
      this.notify(userId);
      return;
    }
    const partnerId = pick(candidates);
    this.queue = this.queue.filter((id) => id !== partnerId);
    this.startSession(userId, partnerId);
  }

  joinWithBot(userId) {
    if (!this.getProfile(userId)) throw new Error('프로필을 찾을 수 없습니다');
    this.leaveCurrent(userId);
    this.lastEnded.delete(userId);
    this.startSession(userId, `bot:${randomUUID()}`);
  }

  cancelWaiting(userId) {
    this.queue = this.queue.filter((id) => id !== userId);
    this.notify(userId);
  }

  // 대기 중이거나 진행 중인 매칭에서 빠지기 (진행 중이면 그만하기로 처리)
  leaveCurrent(userId) {
    this.queue = this.queue.filter((id) => id !== userId);
    const session = this.sessionOf(userId);
    if (!session) return;
    if (session.status === 'playing') this.endSession(session, userId);
    else this.userSession.delete(userId);
  }

  // ---- 세션 ----

  startSession(a, b) {
    const [nickA, nickB] = shuffle(ANIMALS);
    const session = {
      id: randomUUID(),
      users: [a, b],
      nick: { [a]: nickA, [b]: nickB },
      missions: pickMissions(),
      index: 0,
      status: 'playing', // playing | ended | revealed
      history: [],
    };
    this.startMission(session);
    this.sessions.set(session.id, session);
    for (const id of session.users) this.userSession.set(id, session.id);
    session.users.forEach((id) => this.notify(id));
    this.scheduleBot(session);
  }

  startMission(session) {
    session.phase = 'answering'; // answering → deciding
    session.step = 0;
    session.answers = [{}]; // 단계별 답
    session.decisions = {};
    session.starter = pick(session.users); // 이어 쓰기에서 먼저 쓰는 사람
  }

  sessionOf(userId) {
    const sid = this.userSession.get(userId);
    return sid ? this.sessions.get(sid) : null;
  }

  partnerOf(session, userId) {
    return session.users.find((id) => id !== userId);
  }

  stepsOf(session) {
    const mission = session.missions[session.index];
    return KINDS[mission.kind].steps(mission);
  }

  // 지금 단계에서 답해야 하는 사람들
  requiredUsers(session, spec) {
    if (spec.who === 'starter') return [session.starter];
    if (spec.who === 'follower') return [this.partnerOf(session, session.starter)];
    return session.users;
  }

  answer(userId, raw) {
    const session = this.sessionOf(userId);
    if (!session || session.status !== 'playing') throw new Error('진행 중인 매칭이 없습니다');
    if (session.phase !== 'answering') throw new Error('지금은 답할 수 없습니다');

    const steps = this.stepsOf(session);
    const spec = steps[session.step];
    const required = this.requiredUsers(session, spec);
    if (!required.includes(userId)) throw new Error('지금은 상대 차례예요');
    const current = session.answers[session.step];
    if (current[userId] != null) throw new Error('이미 답했습니다');

    current[userId] = validateInput(spec, raw);

    if (required.every((id) => current[id] != null)) {
      session.step += 1;
      if (session.step < steps.length) {
        session.answers.push({});
      } else {
        session.phase = 'deciding';
        session.history.push({
          mission: session.missions[session.index],
          answers: session.answers,
          starter: session.starter,
        });
      }
    }
    session.users.forEach((id) => this.notify(id));
    this.scheduleBot(session);
  }

  decide(userId, keepGoing) {
    const session = this.sessionOf(userId);
    if (!session || session.status !== 'playing') throw new Error('진행 중인 매칭이 없습니다');
    if (session.phase !== 'deciding') throw new Error('아직 미션이 끝나지 않았습니다');

    if (!keepGoing) {
      this.endSession(session, userId);
      return;
    }
    session.decisions[userId] = true;
    if (session.users.every((id) => session.decisions[id])) {
      session.index += 1;
      if (session.index >= session.missions.length) session.status = 'revealed';
      else this.startMission(session);
    }
    session.users.forEach((id) => this.notify(id));
    this.scheduleBot(session);
  }

  endSession(session, endedBy) {
    session.status = 'ended';
    this.blocked.add(pairKey(...session.users));
    for (const id of session.users) {
      this.userSession.delete(id);
      this.lastEnded.set(id, {
        byMe: id === endedBy,
        partnerNickname: session.nick[this.partnerOf(session, id)],
        missionsDone: session.history.length,
      });
    }
    this.sessions.delete(session.id);
    session.users.forEach((id) => this.notify(id));
  }

  // ---- 봇 ----

  stateKey(session) {
    return `${session.index}:${session.phase}:${session.step}`;
  }

  scheduleBot(session) {
    const botId = session.users.find((id) => id.startsWith('bot:'));
    if (!botId || session.status !== 'playing') return;
    const key = this.stateKey(session);
    const timer = setTimeout(() => this.runBot(session.id, key), this.botDelay);
    timer.unref?.();
  }

  // 봇 차례면 답하거나 계속하기 (그 사이 상태가 바뀌었으면 아무것도 안 함)
  runBot(sessionId, key) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'playing' || this.stateKey(session) !== key) return;
    const botId = session.users.find((id) => id.startsWith('bot:'));
    if (session.phase === 'answering') {
      const spec = this.stepsOf(session)[session.step];
      const mine = session.answers[session.step][botId];
      if (this.requiredUsers(session, spec).includes(botId) && mine == null) this.answer(botId, botAnswer(spec));
    } else if (!session.decisions[botId]) {
      this.decide(botId, true);
    }
  }

  // ---- 저장/불러오기 (깃허브 페이지 버전은 브라우저 저장소에 상태를 저장) ----

  toJSON() {
    return {
      queue: this.queue,
      sessions: [...this.sessions.values()],
      userSession: [...this.userSession],
      lastEnded: [...this.lastEnded],
      blocked: [...this.blocked],
    };
  }

  loadState(data) {
    this.reset();
    if (!data) return;
    this.queue = data.queue || [];
    this.sessions = new Map((data.sessions || []).map((s) => [s.id, s]));
    this.userSession = new Map(data.userSession || []);
    this.lastEnded = new Map(data.lastEnded || []);
    this.blocked = new Set(data.blocked || []);
  }

  // ---- 화면에 보여 줄 상태 (상대 인적사항은 공개 전까지 절대 포함하지 않음) ----

  revealFor(entry, ctx) {
    return KINDS[entry.mission.kind].reveal(entry.answers, { ...ctx, starter: entry.starter, follower: ctx.users.find((id) => id !== entry.starter) }, entry.mission);
  }

  view(userId) {
    if (this.queue.includes(userId)) return { status: 'waiting' };

    const session = this.sessionOf(userId);
    if (!session) {
      const ended = this.lastEnded.get(userId);
      return ended ? { status: 'ended', ...ended } : { status: 'idle' };
    }

    const partnerId = this.partnerOf(session, userId);
    const ctx = { me: userId, pt: partnerId, ptNick: session.nick[partnerId], users: session.users };
    const base = {
      status: session.status,
      myNickname: session.nick[userId],
      partnerNickname: session.nick[partnerId],
      missionIndex: session.index,
      totalMissions: session.missions.length,
      history: session.history.map((h) => ({ title: h.mission.title, question: h.mission.question, ...this.revealFor(h, ctx) })),
    };

    if (session.status === 'revealed') {
      const p = partnerId.startsWith('bot:') ? BOT_PROFILE : this.getProfile(partnerId) || {};
      return {
        ...base,
        partnerProfile: {
          name: p.name, gender: p.gender, age: p.age, height: p.height,
          region: p.region, job: p.job, mbti: p.mbti, interests: p.interests,
        },
      };
    }

    const mission = session.missions[session.index];
    const missionInfo = { kind: mission.kind, title: mission.title, question: mission.question };

    if (session.phase === 'deciding') {
      return {
        ...base,
        phase: 'deciding',
        mission: missionInfo,
        reveal: this.revealFor(session.history[session.history.length - 1], ctx),
        myDecision: session.decisions[userId] ?? null,
        partnerDecided: Boolean(session.decisions[partnerId]),
      };
    }

    const steps = this.stepsOf(session);
    const spec = steps[session.step];
    const required = this.requiredUsers(session, spec);
    const current = session.answers[session.step];
    const kind = KINDS[mission.kind];
    const follower = this.partnerOf(session, session.starter);
    return {
      ...base,
      phase: 'answering',
      mission: missionInfo,
      step: session.step,
      totalSteps: steps.length,
      input: spec,
      myTurn: required.includes(userId),
      myAnswer: displayValue(current[userId]),
      partnerTurn: required.includes(partnerId),
      partnerAnswered: current[partnerId] != null,
      context: kind.context?.(session.answers, session.step, { ...ctx, starter: session.starter, follower }) ?? null,
    };
  }

  notify(userId) {
    if (!userId.startsWith('bot:')) this.emit('update', userId);
  }
}

module.exports = { RandomMatchService, MISSION_POOL, FINAL_MISSION, KINDS, LIKE };

  window.RandomMatch = module.exports;
})();
