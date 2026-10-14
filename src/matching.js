// 소개팅 매칭 로직
// 1단계: 거르기 (서로의 조건에 맞지 않으면 제외)
// 2단계: 점수 매기기 (같은 점이 많을수록 높은 점수)
// 3단계: 순위 정렬 + 서로 1:1 매칭

const INTENT_LEVEL = { '가벼운 만남': 0, '진지한 연애': 1, '결혼 전제': 2 };
const INTENT_ICON = { '가벼운 만남': '☕', '진지한 연애': '💕', '결혼 전제': '💍' };
const DRINK_LEVEL = { '안 마심': 0, '가끔': 1, '자주': 2 };
const CAPITAL_AREA = ['서울', '경기', '인천'];

// 점수 항목별 최대 점수 (합계 100)
const WEIGHTS = {
  interests: 25,
  intent: 15,
  age: 15,
  region: 15,
  lifestyle: 15,
  mbti: 10,
  religion: 5,
};

const DEFAULT_MIN_SCORE = 40;

// ---------------------------------------------------------------------------
// 1단계: 거르기
// ---------------------------------------------------------------------------

// a가 원하는 조건에 b가 맞는지 확인. 맞지 않는 이유 목록을 반환한다.
function checkPreferences(a, b) {
  const p = a.preferences || {};
  const reasons = [];

  if (p.preferredGender && p.preferredGender !== '상관없음' && p.preferredGender !== b.gender) {
    return [`🚻 ${a.name}님은 ${p.preferredGender} 원함`]; // 성별이 다르면 나머지 조건은 볼 필요 없음
  }
  if ((p.ageMin != null && b.age < p.ageMin) || (p.ageMax != null && b.age > p.ageMax)) {
    reasons.push(`🎂 ${a.name}님은 ${p.ageMin ?? ''}~${p.ageMax ?? ''}세 원함`);
  }
  if ((p.heightMin != null && b.height < p.heightMin) || (p.heightMax != null && b.height > p.heightMax)) {
    reasons.push(`📏 ${a.name}님은 ${p.heightMin ?? ''}~${p.heightMax ?? ''}cm 원함`);
  }
  if (p.nonSmokerOnly && b.smoking) {
    reasons.push(`🚭 ${a.name}님은 비흡연자 원함`);
  }
  if (p.sameReligionOnly && a.religion !== b.religion) {
    reasons.push(`🙏 ${a.name}님은 같은 종교 원함`);
  }
  if (p.sameRegionOnly && a.region !== b.region) {
    reasons.push(`📍 ${a.name}님은 같은 지역 원함`);
  }
  return reasons;
}

// 두 사람이 서로 맞는지 양방향으로 확인
function filterPair(a, b) {
  const reasons = [];

  if (a.id === b.id) {
    return { passed: false, reasons: ['본인'] };
  }

  reasons.push(...checkPreferences(a, b));
  if (!reasons[0]?.startsWith('🚻')) reasons.push(...checkPreferences(b, a));

  // 만남 목적이 정반대면 제외 (가벼운 만남 ↔ 결혼 전제)
  const ia = INTENT_LEVEL[a.intent];
  const ib = INTENT_LEVEL[b.intent];
  if (ia != null && ib != null && Math.abs(ia - ib) >= 2) {
    reasons.push(`💔 만남 목적이 달라요 (${a.intent} ↔ ${b.intent})`);
  }

  return { passed: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// 2단계: 점수 매기기
// 각 항목은 { points, reasons, detail } 를 반환한다.
//   reasons: 매칭 이유 태그 (점수를 받은 항목만)
//   detail:  왜 이 점수가 나왔는지 계산 과정 (모든 항목, "a vs b" 순서)
// ---------------------------------------------------------------------------

const fmt = (n) => String(Math.round(n * 10) / 10);

function scoreInterests(a, b) {
  const setB = new Set(b.interests || []);
  const common = (a.interests || []).filter((x) => setB.has(x));
  const smaller = Math.min((a.interests || []).length, (b.interests || []).length);
  const ratio = smaller === 0 ? 0 : common.length / smaller;
  let detail;
  if (smaller === 0) detail = '관심사를 고르지 않은 사람이 있음 → 0점';
  else if (common.length === 0) detail = '겹치는 관심사가 없음 → 0점';
  else detail = `관심사가 적은 쪽(${smaller}개) 중 ${common.length}개가 겹쳐요 → ${Math.round(ratio * 100)}% × ${WEIGHTS.interests}점`;
  return {
    points: WEIGHTS.interests * ratio,
    reasons: common.length > 0 ? [`🎯 ${common.join('·')}`] : [],
    detail,
  };
}

function scoreIntent(a, b) {
  const diff = Math.abs(INTENT_LEVEL[a.intent] - INTENT_LEVEL[b.intent]);
  if (diff === 0) {
    return { points: WEIGHTS.intent, reasons: [`${INTENT_ICON[a.intent]} 둘 다 ${a.intent}`], detail: `둘 다 「${a.intent}」 → 만점` };
  }
  if (diff === 1) {
    return { points: WEIGHTS.intent / 2, reasons: [], detail: `「${a.intent}」 vs 「${b.intent}」 한 단계 차이 → 절반` };
  }
  return { points: 0, reasons: [], detail: `「${a.intent}」 vs 「${b.intent}」 목적이 정반대 → 0점` };
}

function scoreAge(a, b) {
  const diff = Math.abs(a.age - b.age);
  const points = WEIGHTS.age * Math.max(0, 1 - diff / 10);
  const perYear = WEIGHTS.age / 10;
  return {
    points,
    reasons: diff <= 3 ? [diff === 0 ? '🎂 동갑' : `🎂 ${diff}살 차이`] : [],
    detail: diff === 0
      ? `둘 다 ${a.age}세 동갑 → 만점`
      : `${a.age}세 vs ${b.age}세, ${diff}살 차이 → 1살마다 -${fmt(perYear)}점 (10살 이상이면 0점)`,
  };
}

function scoreRegion(a, b) {
  if (a.region === b.region) {
    return { points: WEIGHTS.region, reasons: [`📍 둘 다 ${a.region}`], detail: `둘 다 ${a.region} → 만점` };
  }
  if (CAPITAL_AREA.includes(a.region) && CAPITAL_AREA.includes(b.region)) {
    return { points: WEIGHTS.region / 2, reasons: ['📍 둘 다 수도권'], detail: `${a.region} vs ${b.region}, 같은 수도권 → 절반` };
  }
  return { points: 0, reasons: [], detail: `${a.region} vs ${b.region}, 다른 지역 → 0점` };
}

function scoreLifestyle(a, b) {
  let points = 0;
  const reasons = [];
  const parts = [];
  const drinkDiff = Math.abs(DRINK_LEVEL[a.drinking] - DRINK_LEVEL[b.drinking]);
  if (drinkDiff === 0) {
    points += 10;
    reasons.push(a.drinking === '안 마심' ? '🥤 둘 다 술 안 마심' : `🍻 둘 다 술 ${a.drinking}`);
    parts.push(`음주 둘 다 「${a.drinking}」 +10`);
  } else if (drinkDiff === 1) {
    points += 5;
    parts.push(`음주 「${a.drinking}」 vs 「${b.drinking}」 한 단계 차이 +5`);
  } else {
    parts.push(`음주 「${a.drinking}」 vs 「${b.drinking}」 정반대 +0`);
  }
  if (Boolean(a.smoking) === Boolean(b.smoking)) {
    points += 5;
    reasons.push(a.smoking ? '🚬 둘 다 흡연' : '🚭 둘 다 비흡연');
    parts.push(`흡연 둘 다 ${a.smoking ? '흡연' : '비흡연'} +5`);
  } else {
    parts.push('흡연 여부 다름 +0');
  }
  return { points, reasons, detail: parts.join(' · ') };
}

// MBTI 궁합 (참고용): N/S가 같고 E/I는 서로 다르면 잘 맞는다고 본다
function scoreMbti(a, b) {
  const ma = (a.mbti || '').toUpperCase();
  const mb = (b.mbti || '').toUpperCase();
  if (ma.length !== 4 || mb.length !== 4) {
    return { points: 0, reasons: [], detail: 'MBTI를 입력하지 않은 사람이 있음 → 0점' };
  }
  const rules = [
    [1, 'same', 4, 'N/S'], // N/S 같음 → 대화가 잘 통함
    [0, 'diff', 3, 'E/I'], // E/I 다름 → 서로 보완
    [2, 'diff', 1.5, 'T/F'],
    [3, 'diff', 1.5, 'J/P'],
  ];
  let points = 0;
  const parts = rules.map(([i, want, pts, name]) => {
    const same = ma[i] === mb[i];
    const ok = want === 'same' ? same : !same;
    if (ok) points += pts;
    return `${name} ${same ? '같음' : '다름'} ${ok ? `+${pts}` : '+0'}`;
  });
  return {
    points,
    reasons: points >= 7 ? [`🧠 ${ma}×${mb} 찰떡`] : [],
    detail: `${ma} vs ${mb}: ${parts.join(' · ')} (N/S는 같으면, 나머지는 다르면 점수)`,
  };
}

function scoreReligion(a, b) {
  if (a.religion === b.religion) {
    return { points: WEIGHTS.religion, reasons: [`🙏 둘 다 ${a.religion}`], detail: `둘 다 ${a.religion} → 만점` };
  }
  return { points: 0, reasons: [], detail: `${a.religion} vs ${b.religion}, 다름 → 0점` };
}

const SCORERS = [
  ['interests', '🎯 관심사', scoreInterests],
  ['intent', '💕 만남 목적', scoreIntent],
  ['age', '🎂 나이', scoreAge],
  ['region', '📍 지역', scoreRegion],
  ['lifestyle', '🍻 생활습관', scoreLifestyle],
  ['mbti', '🧠 MBTI', scoreMbti],
  ['religion', '🙏 종교', scoreReligion],
];

// 두 사람의 궁합 점수(0~100)와 항목별 점수, 매칭 이유를 계산
function scorePair(a, b) {
  const breakdown = SCORERS.map(([key, label, fn]) => {
    const { points, reasons, detail } = fn(a, b);
    return { key, label, points: Math.round(points * 10) / 10, max: WEIGHTS[key], reasons, detail };
  });
  const score = Math.round(breakdown.reduce((sum, item) => sum + item.points, 0));
  const reasons = [...breakdown]
    .sort((x, y) => y.points - x.points)
    .flatMap((item) => item.reasons);
  return { score, breakdown, reasons, summary: summarize(score) };
}

function summarize(score) {
  if (score >= 80) return '💖 천생연분';
  if (score >= 60) return '😊 잘 맞아요';
  if (score >= 40) return '🙂 무난해요';
  return '🤔 공통점이 적어요';
}

// ---------------------------------------------------------------------------
// 3단계: 순위 & 매칭
// ---------------------------------------------------------------------------

// 한 사람 기준 추천 순위 (걸러진 사람과 이유도 함께 반환)
function recommend(user, profiles) {
  const recommended = [];
  const filteredOut = [];
  for (const other of profiles) {
    if (other.id === user.id) continue;
    const filter = filterPair(user, other);
    if (!filter.passed) {
      filteredOut.push({ profile: other, reasons: filter.reasons });
      continue;
    }
    recommended.push({ profile: other, ...scorePair(user, other) });
  }
  recommended.sort((x, y) => y.score - x.score);
  recommended.forEach((item, i) => (item.rank = i + 1));
  return { recommended, filteredOut };
}

// 전체 1:1 매칭: 서로 조건이 맞는 쌍을 점수 높은 순으로 짝지어 준다
function matchAll(profiles, { minScore = DEFAULT_MIN_SCORE } = {}) {
  const pairs = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      if (!filterPair(a, b).passed) continue;
      const result = scorePair(a, b);
      if (result.score >= minScore) pairs.push({ a, b, ...result });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const taken = new Set();
  const matches = [];
  for (const pair of pairs) {
    if (taken.has(pair.a.id) || taken.has(pair.b.id)) continue;
    taken.add(pair.a.id);
    taken.add(pair.b.id);
    matches.push(pair);
  }
  const unmatched = profiles.filter((p) => !taken.has(p.id));
  return { matches, unmatched };
}

// ---------------------------------------------------------------------------
// 프로필 검증
// ---------------------------------------------------------------------------

function validateProfile(p) {
  const errors = [];
  if (!p.name || !String(p.name).trim()) errors.push('이름을 입력하세요');
  if (!['남성', '여성'].includes(p.gender)) errors.push('성별을 선택하세요');
  if (!(p.age >= 19 && p.age <= 80)) errors.push('나이는 19~80세여야 합니다');
  if (!(p.height >= 130 && p.height <= 230)) errors.push('키는 130~230cm여야 합니다');
  if (!p.region) errors.push('지역을 선택하세요');
  if (!(p.intent in INTENT_LEVEL)) errors.push('만남 목적을 선택하세요');
  if (!(p.drinking in DRINK_LEVEL)) errors.push('음주 여부를 선택하세요');
  const pref = p.preferences || {};
  if (pref.ageMin != null && pref.ageMax != null && pref.ageMin > pref.ageMax) {
    errors.push('선호 나이 범위가 올바르지 않습니다');
  }
  if (pref.heightMin != null && pref.heightMax != null && pref.heightMin > pref.heightMax) {
    errors.push('선호 키 범위가 올바르지 않습니다');
  }
  return errors;
}

module.exports = {
  WEIGHTS,
  DEFAULT_MIN_SCORE,
  filterPair,
  scorePair,
  recommend,
  matchAll,
  validateProfile,
};
