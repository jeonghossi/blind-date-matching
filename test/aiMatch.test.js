const test = require('node:test');
const assert = require('node:assert');
const { sanitize, facts, runAiMatch, checkOllama } = require('../src/aiMatch');
const { filterPair, scorePair } = require('../src/matching');
const { sampleProfiles } = require('../src/sampleData');

const P = (id) => sampleProfiles.find((p) => p.id === id);

// 가짜 Ollama: 후보 이름별로 정해 둔 답을 돌려준다
function fakeOllama(answers) {
  return async (url, opts) => {
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: [{ name: 'exaone3.5:2.4b' }] }) };
    }
    const prompt = JSON.parse(opts.body).messages.at(-1).content; // 마지막 메시지 = 판단할 두 사람
    const name = prompt.match(/\[B: (.+?)님\]/)[1];
    const answer = answers[name] ?? { pass: false, failReasons: ['기타'], score: 10, tags: [], reason: '두 분은 잘 안 맞아요.' };
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(answer) } }) };
  };
}

test('LLM 답 정리: 점수 범위, 끊긴 문장, 마크다운 제거', () => {
  const r = sanitize({
    pass: true, failReasons: [], score: 140, tags: ['a', 'b', 'c', 'd'],
    reason: '**두 분은** 잘 맞아요. 여행을 좋아해요. 그런데 지역이 조금 멀어서',
  });
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.tags.length, 3);
  assert.strictEqual(r.reason, '두 분은 잘 맞아요. 여행을 좋아해요.');
  assert.strictEqual(sanitize({ pass: 'yes' }).pass, false);
});

test('[확인된 사실]에 조건 충족 여부와 계산값이 들어간다', () => {
  const f = facts(P('u1'), P('u3'));
  assert.match(f, /✖ 성별: 여성 원함 → 박지훈님 남성/);
  assert.match(f, /나이 차이: 4살/);
  assert.match(facts(P('u1'), P('u2')), /공통 관심사: 여행, 카페, 사진 \(3개\)/);
});

test('AI가 통과시킨 사람을 점수순으로 추천하고, 조건 위반은 바로잡는다', async () => {
  const fetchImpl = fakeOllama({
    이서연: { pass: true, failReasons: [], score: 85, tags: ['여행'], reason: '두 분은 잘 맞아요.' },
    한지민: { pass: true, failReasons: [], score: 90, tags: ['영화'], reason: '두 분은 아주 잘 맞아요.' },
    박지훈: { pass: true, failReasons: [], score: 70, tags: [], reason: '두 분은 괜찮아요.' }, // 성별 안 맞는데 AI가 통과시킴
  });
  const events = [];
  await runAiMatch(P('u1'), sampleProfiles, {
    fetchImpl, guard: filterPair, ruleScore: (a, b) => scorePair(a, b).score, onEvent: (e) => events.push(e),
  });
  const done = events.find((e) => e.type === 'done');
  assert.deepStrictEqual(done.recommended.map((r) => r.profile.name), ['한지민', '이서연']);
  assert.strictEqual(done.recommended[0].rank, 1);
  const park = done.filteredOut.find((r) => r.profile.name === '박지훈');
  assert.strictEqual(park.corrected, true);
  assert.ok(park.ruleReasons.length > 0);
  assert.strictEqual(events.filter((e) => e.type === 'result').length, sampleProfiles.length - 1);
});

test('중지하면 더 이상 판단하지 않음', async () => {
  const controller = new AbortController();
  const events = [];
  await runAiMatch(P('u1'), sampleProfiles, {
    fetchImpl: fakeOllama({}),
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'result') controller.abort();
    },
    signal: controller.signal,
  });
  assert.strictEqual(events.filter((e) => e.type === 'result').length, 1);
  assert.ok(!events.some((e) => e.type === 'done'));
});

test('Ollama가 꺼져 있거나 모델이 없으면 알려 준다', async () => {
  const off = await checkOllama({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.strictEqual(off.ok, false);
  const noModel = await checkOllama({ model: 'qwen3:8b', fetchImpl: fakeOllama({}) });
  assert.match(noModel.error, /qwen3:8b/);
  assert.strictEqual((await checkOllama({ fetchImpl: fakeOllama({}) })).ok, true);
});

test('LLM 호출이 실패하면 error 이벤트', async () => {
  const events = [];
  await runAiMatch(P('u1'), sampleProfiles, {
    fetchImpl: async () => ({ ok: false, status: 500 }),
    onEvent: (e) => events.push(e),
  });
  assert.strictEqual(events.at(-1).type, 'error');
});

test('matching-bot이 없으면 기본 모델 + 지시문·예시로 대신한다', async () => {
  const status = await checkOllama({ fetchImpl: fakeOllama({}) }); // 가짜 Ollama에는 exaone만 있음
  assert.deepStrictEqual(status, { ok: true, model: 'exaone3.5:2.4b' });
  const { buildMessages } = require('../src/aiMatch');
  assert.strictEqual(buildMessages(P('u1'), P('u2'), 'matching-bot').length, 1); // 모델에 이미 들어 있음
  assert.strictEqual(buildMessages(P('u1'), P('u2'), 'exaone3.5:2.4b').length, 8); // 지시문 1 + 예시 6 + 질문 1
});
