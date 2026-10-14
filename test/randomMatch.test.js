const test = require('node:test');
const assert = require('node:assert');
const { RandomMatchService, MISSION_POOL, FINAL_MISSION, LIKE } = require('../src/randomMatch');

const people = {
  m1: { id: 'm1', name: '남1', gender: '남성', age: 30, preferences: { preferredGender: '여성' } },
  m2: { id: 'm2', name: '남2', gender: '남성', age: 31, preferences: { preferredGender: '여성' } },
  w1: { id: 'w1', name: '여1', gender: '여성', age: 29, preferences: { preferredGender: '남성' } },
};
const make = () => new RandomMatchService({ getProfile: (id) => people[id], botDelay: 5 });

// 입력 방식에 맞는 답 만들기
function valueFor(input) {
  if (input.input === 'choice') return input.options[0];
  if (input.input === 'number') return input.min;
  if (input.input === 'topic') return { topic: '민트초코', taste: LIKE[0] };
  return '테스트 답';
}

// 현재 미션을 끝까지 진행 (차례에 맞게 답하기)
function finishMission(svc, ids = ['m1', 'w1']) {
  while (svc.view(ids[0]).phase === 'answering') {
    for (const id of ids) {
      const v = svc.view(id);
      if (v.phase === 'answering' && v.myTurn && v.myAnswer == null) svc.answer(id, valueFor(v.input));
    }
  }
}

function matched() {
  const svc = make();
  svc.join('m1');
  svc.join('w1');
  return svc;
}

// 특정 미션으로 바꿔서 테스트
function withMission(svc, mission) {
  const session = svc.sessionOf('m1');
  session.missions = [mission, FINAL_MISSION];
  svc.startMission(session);
  return session;
}
const missionOf = (kind) => MISSION_POOL.find((m) => m.kind === kind);

test('혼자면 대기, 맞는 상대가 오면 매칭', () => {
  const svc = make();
  svc.join('m1');
  assert.strictEqual(svc.view('m1').status, 'waiting');
  svc.join('w1');
  assert.strictEqual(svc.view('m1').status, 'playing');
  assert.strictEqual(svc.view('w1').status, 'playing');
});

test('원하는 성별이 아니면 매칭되지 않음', () => {
  const svc = make();
  svc.join('m1');
  svc.join('m2');
  assert.strictEqual(svc.view('m1').status, 'waiting');
  assert.strictEqual(svc.view('m2').status, 'waiting');
});

test('미션은 종류가 겹치지 않게 4개 + 마지막 미션', () => {
  const svc = matched();
  const { missions } = svc.sessionOf('m1');
  assert.strictEqual(missions.length, 5);
  assert.strictEqual(new Set(missions.slice(0, 4).map((m) => m.kind)).size, 4);
  assert.strictEqual(missions[4], FINAL_MISSION);
});

test('공개 전에는 상대 인적사항이 보이지 않음', () => {
  const svc = matched();
  const json = JSON.stringify(svc.view('m1'));
  assert.ok(!json.includes('여1'));
  assert.ok(!json.includes('partnerProfile'));
});

test('둘 다 답해야 상대 답이 공개됨', () => {
  const svc = matched();
  withMission(svc, missionOf('balance'));
  svc.answer('m1', valueFor(svc.view('m1').input));
  assert.strictEqual(svc.view('m1').reveal, undefined);
  assert.strictEqual(svc.view('w1').partnerAnswered, true);
  svc.answer('w1', valueFor(svc.view('w1').input));
  assert.strictEqual(svc.view('m1').phase, 'deciding');
  assert.strictEqual(svc.view('m1').reveal.cards.length, 2);
});

test('🔮 텔레파시: 같은 걸 고르면 성공', () => {
  const svc = matched();
  const m = withMission(svc, missionOf('telepathy')).missions[0];
  svc.answer('m1', m.options[1]);
  svc.answer('w1', m.options[1]);
  assert.match(svc.view('m1').reveal.outcome, /성공/);
});

test('🎯 숫자 합: 합이 목표와 같으면 성공, 범위 밖 숫자는 거부', () => {
  const svc = matched();
  withMission(svc, { kind: 'sum', title: 't', question: 'q', target: 10 });
  assert.throws(() => svc.answer('m1', 11));
  svc.answer('m1', 4);
  svc.answer('w1', 6);
  assert.match(svc.view('w1').reveal.outcome, /성공/);
});

test('📖 이어 쓰기: 시작하는 사람이 먼저 쓰고, 상대는 그 문장을 보고 이어 씀', () => {
  const svc = matched();
  const session = withMission(svc, missionOf('relay'));
  const starter = session.starter;
  const follower = starter === 'm1' ? 'w1' : 'm1';
  assert.strictEqual(svc.view(starter).myTurn, true);
  assert.strictEqual(svc.view(follower).myTurn, false);
  assert.throws(() => svc.answer(follower, '먼저 쓰기'));
  svc.answer(starter, '비가 오던 날');
  assert.strictEqual(svc.view(follower).myTurn, true);
  assert.strictEqual(svc.view(follower).context.text, '비가 오던 날');
  assert.strictEqual(svc.view(starter).context, null);
  svc.answer(follower, '우산을 같이 썼다');
  const reveal = svc.view('m1').reveal;
  assert.deepStrictEqual(reveal.cards.map((c) => c.text), ['비가 오던 날', '우산을 같이 썼다']);
});

test('👍👎 좋아? 싫어?: 서로 낸 주제를 보고 답하고, 취향 일치 여부를 알려 줌', () => {
  const svc = matched();
  withMission(svc, missionOf('topic'));
  assert.throws(() => svc.answer('m1', { topic: '', taste: LIKE[0] }));
  svc.answer('m1', { topic: '민트초코', taste: LIKE[0] });
  svc.answer('w1', { topic: '고수', taste: LIKE[1] });
  assert.strictEqual(svc.view('m1').context.text, '고수');
  assert.strictEqual(svc.view('w1').context.text, '민트초코');
  svc.answer('m1', LIKE[1]); // 고수 싫어요 → w1과 같음
  svc.answer('w1', LIKE[0]); // 민트초코 좋아요 → m1과 같음
  assert.match(svc.view('m1').reveal.outcome, /완전 일치/);
});

test('그만하기를 누르면 관계가 끝나고 다시 매칭되지 않음', () => {
  const svc = matched();
  finishMission(svc);
  svc.decide('w1', false);
  assert.strictEqual(svc.view('m1').status, 'ended');
  assert.strictEqual(svc.view('m1').byMe, false);
  assert.strictEqual(svc.view('w1').byMe, true);
  svc.join('m1');
  svc.join('w1');
  assert.strictEqual(svc.view('m1').status, 'waiting');
  assert.strictEqual(svc.view('w1').status, 'waiting');
});

test('둘 다 계속하면 다음 미션, 모두 끝내면 프로필 공개', () => {
  const svc = matched();
  const total = svc.view('m1').totalMissions;
  for (let i = 0; i < total; i++) {
    finishMission(svc);
    svc.decide('m1', true);
    if (i < total - 1) assert.strictEqual(svc.view('m1').phase, 'deciding'); // 상대 선택 전
    svc.decide('w1', true);
  }
  const v = svc.view('m1');
  assert.strictEqual(v.status, 'revealed');
  assert.strictEqual(v.partnerProfile.name, '여1');
  assert.strictEqual(v.history.length, total);
});

test('봇과 매칭하면 봇이 모든 종류의 미션을 알아서 진행함', async () => {
  const svc = make();
  svc.joinWithBot('m1');
  const tick = () => new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 5; i++) {
    while (svc.view('m1').phase === 'answering') {
      const v = svc.view('m1');
      if (v.myTurn && v.myAnswer == null) svc.answer('m1', valueFor(v.input));
      await tick();
    }
    svc.decide('m1', true);
    await tick();
  }
  assert.strictEqual(svc.view('m1').status, 'revealed');
});

test('상태를 저장했다가 불러와도 이어서 진행됨 (깃허브 페이지 버전용)', () => {
  const svc = matched();
  finishMission(svc);
  const saved = JSON.parse(JSON.stringify(svc.toJSON()));
  const restored = make();
  restored.loadState(saved);
  assert.strictEqual(restored.view('m1').phase, 'deciding');
  restored.decide('m1', true);
  restored.decide('w1', true);
  assert.strictEqual(restored.view('w1').missionIndex, 1);
});
