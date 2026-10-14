const test = require('node:test');
const assert = require('node:assert');
const { filterPair, scorePair, recommend, matchAll, validateProfile } = require('../src/matching');
const { sampleProfiles } = require('../src/sampleData');

const base = (overrides = {}) => ({
  id: 'x', name: '테스트', gender: '남성', age: 30, height: 175, region: '서울', religion: '무교',
  smoking: false, drinking: '가끔', mbti: 'ENFP', intent: '진지한 연애', interests: ['여행', '영화'],
  preferences: { preferredGender: '여성', ageMin: 20, ageMax: 40, heightMin: 150, heightMax: 190 },
  ...overrides,
});
const man = base({ id: 'm' });
const woman = base({ id: 'w', name: '상대', gender: '여성', height: 162, mbti: 'INFJ', preferences: { preferredGender: '남성', ageMin: 20, ageMax: 40, heightMin: 160, heightMax: 190 } });

test('조건이 서로 맞으면 통과', () => {
  assert.strictEqual(filterPair(man, woman).passed, true);
});

test('성별 선호가 안 맞으면 걸러짐', () => {
  const r = filterPair(man, { ...woman, gender: '남성' });
  assert.strictEqual(r.passed, false);
});

test('상대 선호 나이 밖이면 걸러짐 (양방향 확인)', () => {
  const r = filterPair(man, { ...woman, preferences: { ...woman.preferences, ageMax: 28 } });
  assert.strictEqual(r.passed, false);
  assert.match(r.reasons[0], /세 원함/);
});

test('키 조건이 안 맞으면 걸러짐', () => {
  const r = filterPair({ ...man, height: 165 }, { ...woman, preferences: { ...woman.preferences, heightMin: 175 } });
  assert.strictEqual(r.passed, false);
});

test('비흡연자만 원하는데 흡연자면 걸러짐', () => {
  const r = filterPair({ ...man, smoking: true }, { ...woman, preferences: { ...woman.preferences, nonSmokerOnly: true } });
  assert.strictEqual(r.passed, false);
});

test('가벼운 만남 vs 결혼 전제는 걸러짐', () => {
  const r = filterPair({ ...man, intent: '가벼운 만남' }, { ...woman, intent: '결혼 전제' });
  assert.strictEqual(r.passed, false);
});

test('점수는 0~100 사이이고 공통점이 많을수록 높다', () => {
  const similar = scorePair(man, woman);
  const different = scorePair(man, { ...woman, region: '제주', age: 39, interests: ['게임'], drinking: '안 마심', smoking: true });
  assert.ok(similar.score >= 0 && similar.score <= 100);
  assert.ok(similar.score > different.score);
});

test('매칭 이유에 공통 관심사 태그가 나온다', () => {
  const r = scorePair(man, woman);
  assert.ok(r.reasons.some((x) => x.startsWith('🎯')));
  assert.ok(r.summary.length > 0);
});

test('추천 결과는 점수 내림차순', () => {
  const { recommended } = recommend(sampleProfiles[0], sampleProfiles);
  for (let i = 1; i < recommended.length; i++) {
    assert.ok(recommended[i - 1].score >= recommended[i].score);
  }
});

test('전체 매칭에서 한 사람은 한 번만 매칭된다', () => {
  const { matches } = matchAll(sampleProfiles);
  const ids = matches.flatMap((m) => [m.a.id, m.b.id]);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const m of matches) assert.strictEqual(filterPair(m.a, m.b).passed, true);
});

test('프로필 검증', () => {
  assert.deepStrictEqual(validateProfile(man), []);
  assert.ok(validateProfile({ ...man, age: 15 }).length > 0);
  assert.ok(validateProfile({ ...man, name: '' }).length > 0);
});

test('모든 점수 항목에 왜 그 점수인지 설명이 있다 (0점 항목 포함)', () => {
  const r = scorePair(man, { ...woman, region: '제주', religion: '불교', mbti: '' });
  for (const item of r.breakdown) assert.ok(item.detail && item.detail.length > 0, item.key);
  assert.match(r.breakdown.find((b) => b.key === 'region').detail, /서울 vs 제주/);
  assert.match(r.breakdown.find((b) => b.key === 'mbti').detail, /입력하지 않은/);
});
