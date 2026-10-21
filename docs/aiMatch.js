// src/aiMatch.js 에서 자동 생성 — 직접 수정하지 마세요 (npm run build:pages)
(function () {
  const module = { exports: {} };
// 🤖 AI 매칭: 로컬 LLM(Ollama)이 후보를 한 명씩 보고 거르기 · 점수 · 이유를 직접 판단
// - 작은 모델도 안정적으로 답하도록 한 번에 한 명씩, JSON 형식을 정해서 물어본다
// - 작은 모델이 틀리기 쉬운 숫자 비교(나이 범위 등)는 코드가 계산해서 [확인된 사실]로 알려 준다
// - AI가 필수 조건을 놓치고 통과시키면 guard(규칙 검사)가 바로잡는다
// - Node(서버)와 브라우저(깃허브 페이지) 양쪽에서 쓰도록 외부 모듈 없이 작성

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
// matching-bot = EXAONE에 이 파일의 지시문과 예시를 넣어 만든 전용 모델 (npm run create:bot)
// 없으면 BASE_MODEL에 지시문과 예시를 매번 같이 보내서 같은 효과를 낸다
const DEFAULT_MODEL = 'matching-bot';
const BASE_MODEL = 'exaone3.5:2.4b';
const isBuiltIn = (model) => /^matching-bot(:|$)/.test(model);

// LLM이 반드시 이 형식으로 답하게 한다 (Ollama structured outputs)
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failReasons: { type: 'array', items: { type: 'string' } },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    tags: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string', maxLength: 250 },
  },
  required: ['pass', 'failReasons', 'score', 'tags', 'reason'],
};

const SYSTEM_PROMPT = `너는 소개팅 매칭 전문가야. 두 사람의 프로필과 [확인된 사실]을 보고 판단해.
[확인된 사실]은 정확하게 계산된 값이니 숫자를 다시 계산하지 말고 그대로 믿어.

1. pass: 두 사람을 소개해도 되는지.
   - [확인된 사실]에 ✖ 조건이 하나라도 있으면 반드시 false.
   - 만남 목적이 정반대이면 false.
   - 조건은 다 맞아도 생활습관이나 가치관이 크게 부딪힌다고 판단되면 false로 해도 돼.
2. failReasons: pass가 false일 때 이유를 한 줄씩 짧게. true면 빈 배열.
3. score: 잘 맞는 정도 0~100. 공통 관심사, 만남 목적, 나이 차이, 지역, 음주·흡연, MBTI, 종교를 종합해서.
   - 90~100: 거의 모든 면이 잘 맞음
   - 70~89: 중요한 공통점이 여러 개
   - 50~69: 공통점과 차이점이 비슷함
   - 30~49: 차이점이 더 많음
   - 0~29: 조건이 안 맞거나 거의 맞지 않음
   사람마다 다르니 같은 점수를 반복하지 말고 1점 단위로 세밀하게 매겨.
4. tags: 잘 맞는 점을 짧은 키워드로 최대 3개 (예: "여행 좋아함", "둘 다 서울").
5. reason: "두 분은"으로 시작하는 해요체 2~3문장, 150자 이내. 잘 맞는 점과 걱정되는 점을 함께. 목록이나 기호 없이 문장으로만.
   - 공통 관심사라고 말할 때는 [확인된 사실]의 "공통 관심사"에 있는 것만 말해.
   - 한국어로만 써.`;

// 예시 판단 (few-shot): 가상의 인물로 "이렇게 판단하면 돼"를 보여 준다
const g = (preferredGender, ageMin, ageMax, heightMin, heightMax, extra = {}) => ({ preferredGender, ageMin, ageMax, heightMin, heightMax, ...extra });
const EXAMPLES = [
  {
    a: { name: '박서준', gender: '남성', age: 31, height: 180, region: '서울', job: '마케터', religion: '무교', mbti: 'ENTJ', drinking: '가끔', smoking: false, intent: '진지한 연애', interests: ['운동', '맛집', '여행', '캠핑'], preferences: g('여성', 26, 33, 155, 170) },
    b: { name: '김하늘', gender: '여성', age: 29, height: 164, region: '서울', job: '간호사', religion: '무교', mbti: 'INFP', drinking: '가끔', smoking: false, intent: '진지한 연애', interests: ['캠핑', '여행', '맛집', '독서'], preferences: g('남성', 28, 35, 172, 188) },
    answer: {
      pass: true, failReasons: [], score: 91, tags: ['캠핑·여행 좋아함', '둘 다 서울', '진지한 연애'],
      reason: '두 분은 맛집, 여행, 캠핑을 함께 좋아하고 둘 다 서울에서 진지한 연애를 원해서 잘 맞아요. 술 마시는 습관도 같아 데이트 계획이 편할 거예요. 다만 ENTJ와 INFP는 대화 방식이 달라 맞춰 가는 시간이 조금 필요해요.',
    },
  },
  {
    a: { name: '이도현', gender: '남성', age: 36, height: 175, region: '경기', job: '회사원', religion: '무교', mbti: 'ISTJ', drinking: '자주', smoking: true, intent: '결혼 전제', interests: ['등산', '영화'], preferences: g('여성', 28, 34, 155, 170) },
    b: { name: '정유진', gender: '여성', age: 27, height: 160, region: '경기', job: '디자이너', religion: '무교', mbti: 'ENFP', drinking: '가끔', smoking: false, intent: '진지한 연애', interests: ['영화', '카페', '전시회'], preferences: g('남성', 27, 33, 170, 185, { nonSmokerOnly: true }) },
    answer: {
      pass: false, failReasons: ['이도현님 36세가 정유진님 희망 나이 27~33세를 넘어요', '정유진님은 비흡연자를 원하지만 이도현님은 흡연자예요'], score: 22, tags: ['영화 좋아함'],
      reason: '두 분은 영화를 좋아하는 공통점이 있지만, 정유진님이 원하는 나이와 비흡연 조건에 맞지 않아요. 만남 목적도 결혼 전제와 진지한 연애로 달라서 이번에는 소개하지 않는 게 좋겠어요.',
    },
  },
  {
    a: { name: '최민호', gender: '남성', age: 28, height: 172, region: '부산', job: '대학원생', religion: '기독교', mbti: 'INTP', drinking: '안 마심', smoking: false, intent: '진지한 연애', interests: ['게임', '독서', '음악'], preferences: g('여성', 24, 30, 150, 170) },
    b: { name: '한소라', gender: '여성', age: 26, height: 158, region: '대구', job: '승무원', religion: '불교', mbti: 'ESFJ', drinking: '자주', smoking: false, intent: '진지한 연애', interests: ['여행', '맛집', '음악', '운동'], preferences: g('남성', 25, 32, 168, 185) },
    answer: {
      pass: true, failReasons: [], score: 54, tags: ['음악 좋아함', '진지한 연애'],
      reason: '두 분은 둘 다 진지한 연애를 원하고 음악을 좋아하는 공통점이 있어요. 하지만 부산과 대구로 지역이 다르고, 술을 안 마시는 분과 자주 마시는 분이라 생활 패턴이 꽤 달라요. 천천히 알아가 보는 정도를 추천해요.',
    },
  },
];

const INTENT_LEVEL = { '가벼운 만남': 0, '진지한 연애': 1, '결혼 전제': 2 };
const mark = (cond) => (cond ? '✔' : '✖');

function describe(label, p) {
  const pref = p.preferences || {};
  const musts = [
    pref.nonSmokerOnly && '비흡연자만',
    pref.sameReligionOnly && '같은 종교만',
    pref.sameRegionOnly && '같은 지역만',
  ].filter(Boolean);
  return [
    `[${label}: ${p.name}님]`,
    `- ${p.gender}, ${p.age}세, ${p.height}cm, ${p.region}, 직업 ${p.job || '비공개'}`,
    `- 종교 ${p.religion}, MBTI ${p.mbti || '모름'}, 술 ${p.drinking}, ${p.smoking ? '흡연' : '비흡연'}`,
    `- 만남 목적: ${p.intent}`,
    `- 관심사: ${(p.interests || []).join(', ') || '없음'}`,
    `- 원하는 상대: ${pref.preferredGender || '상관없음'}, ${pref.ageMin ?? '?'}~${pref.ageMax ?? '?'}세, 키 ${pref.heightMin ?? '?'}~${pref.heightMax ?? '?'}cm${musts.length ? `, ${musts.join(', ')}` : ''}`,
  ].join('\n');
}

// a의 "원하는 상대" 조건을 b가 충족하는지 항목별로
function conditionLines(a, b) {
  const p = a.preferences || {};
  const lines = [];
  if (p.preferredGender && p.preferredGender !== '상관없음') {
    lines.push(`${mark(p.preferredGender === b.gender)} 성별: ${p.preferredGender} 원함 → ${b.name}님 ${b.gender}`);
  }
  if (p.ageMin != null || p.ageMax != null) {
    const fits = (p.ageMin == null || b.age >= p.ageMin) && (p.ageMax == null || b.age <= p.ageMax);
    lines.push(`${mark(fits)} 나이: ${p.ageMin ?? ''}~${p.ageMax ?? ''}세 원함 → ${b.name}님 ${b.age}세`);
  }
  if (p.heightMin != null || p.heightMax != null) {
    const fits = (p.heightMin == null || b.height >= p.heightMin) && (p.heightMax == null || b.height <= p.heightMax);
    lines.push(`${mark(fits)} 키: ${p.heightMin ?? ''}~${p.heightMax ?? ''}cm 원함 → ${b.name}님 ${b.height}cm`);
  }
  if (p.nonSmokerOnly) lines.push(`${mark(!b.smoking)} 비흡연자만 원함 → ${b.name}님 ${b.smoking ? '흡연' : '비흡연'}`);
  if (p.sameReligionOnly) lines.push(`${mark(a.religion === b.religion)} 같은 종교만 원함 → ${a.religion} vs ${b.religion}`);
  if (p.sameRegionOnly) lines.push(`${mark(a.region === b.region)} 같은 지역만 원함 → ${a.region} vs ${b.region}`);
  return lines.length ? lines.map((l) => `  ${l}`) : ['  (특별한 조건 없음)'];
}

// 작은 모델이 틀리기 쉬운 비교·계산은 코드가 미리 해서 알려 준다
function facts(a, b) {
  const common = (a.interests || []).filter((x) => (b.interests || []).includes(x));
  const intentDiff = Math.abs((INTENT_LEVEL[a.intent] ?? 1) - (INTENT_LEVEL[b.intent] ?? 1));
  const same = (x, y, label) => (x === y ? `같음 (${x})` : `다름 (${x} / ${y})`);
  return [
    '[확인된 사실]',
    `- ${a.name}님의 조건:`,
    ...conditionLines(a, b),
    `- ${b.name}님의 조건:`,
    ...conditionLines(b, a),
    `- 만남 목적: ${['같음', '한 단계 차이', '정반대'][intentDiff]} (${a.intent} / ${b.intent})`,
    `- 나이 차이: ${Math.abs(a.age - b.age)}살`,
    `- 공통 관심사: ${common.length ? `${common.join(', ')} (${common.length}개)` : '없음'}`,
    `- 지역: ${same(a.region, b.region)}`,
    `- 음주: ${same(a.drinking, b.drinking)}`,
    `- 흡연: ${a.smoking === b.smoking ? (a.smoking ? '둘 다 흡연' : '둘 다 비흡연') : '한 명만 흡연'}`,
    `- 종교: ${same(a.religion, b.religion)}`,
  ].join('\n');
}

const userMessage = (a, b) => ({
  role: 'user',
  content: `${describe('A', a)}\n\n${describe('B', b)}\n\n${facts(a, b)}\n\n두 사람을 판단해서 JSON으로 답해.`,
});

// 지시문 + 예시 대화 (matching-bot 모델에는 이미 들어 있음)
function teachingMessages() {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...EXAMPLES.flatMap((ex) => [userMessage(ex.a, ex.b), { role: 'assistant', content: JSON.stringify(ex.answer) }]),
  ];
}

function buildMessages(me, other, model = DEFAULT_MODEL) {
  return isBuiltIn(model) ? [userMessage(me, other)] : [...teachingMessages(), userMessage(me, other)];
}

// 목록 기호·마크다운을 지우고 길이 제한
function tidy(s, max) {
  return String(s ?? '').replace(/[*#>`]/g, '').replace(/\s*\n+\s*-?\s*/g, ' ').trim().slice(0, max);
}

// 문장: 중간에 끊겼으면 마지막으로 끝난 문장까지만 남긴다
function sentences(s, max) {
  const t = tidy(s, max);
  if (!t || /[.!?]$/.test(t)) return t;
  const end = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
  return end > 0 ? t.slice(0, end + 1) : `${t}…`;
}

// LLM 답을 화면에 쓰기 안전한 형태로 정리
function sanitize(raw) {
  const list = (arr, n, fn) => (Array.isArray(arr) ? arr : []).map(fn).filter(Boolean).slice(0, n);
  return {
    pass: raw.pass === true,
    failReasons: list(raw.failReasons, 3, (x) => sentences(x, 90)),
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    tags: list(raw.tags, 3, (x) => tidy(x, 20)),
    reason: sentences(raw.reason, 230),
  };
}

// Ollama 연결 상태 확인 → 실제로 쓸 모델을 알려 준다
// matching-bot이 아직 없으면 기본 모델(EXAONE)에 지시문·예시를 같이 보내는 방식으로 대신한다
async function checkOllama({ baseUrl = DEFAULT_OLLAMA_URL, model = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`);
    if (!res.ok) return { ok: false, model, error: `Ollama 응답 오류 (${res.status})` };
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name);
    const has = (name) => names.includes(name) || names.includes(`${name}:latest`);
    if (has(model)) return { ok: true, model };
    if (isBuiltIn(model) && has(BASE_MODEL)) return { ok: true, model: BASE_MODEL };
    return { ok: false, model, error: `모델 ${model}이(가) 없어요 (ollama pull ${isBuiltIn(model) ? BASE_MODEL : model})` };
  } catch {
    return { ok: false, model, error: 'Ollama에 연결할 수 없어요 (Ollama를 켜 주세요)' };
  }
}

// 두 사람을 LLM에게 판단시키기
async function judgePair(me, other, { baseUrl = DEFAULT_OLLAMA_URL, model = DEFAULT_MODEL, fetchImpl = fetch, signal } = {}) {
  const res = await fetchImpl(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages: buildMessages(me, other, model),
      stream: false,
      format: ANSWER_SCHEMA,
      options: { temperature: 0.2, num_ctx: 4096, num_predict: 500 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama 응답 오류 (${res.status})`);
  const data = await res.json();
  return sanitize(JSON.parse(data.message?.content || '{}'));
}

// 나를 기준으로 모든 후보를 AI가 판단. onEvent로 진행 상황을 하나씩 알려 준다
//   guard(me, other) → { passed, reasons }  규칙상 필수 조건 검사 (AI가 놓친 것 바로잡기용)
//   ruleScore(me, other) → number          비교용 규칙 점수
async function runAiMatch(me, profiles, { guard, ruleScore, onEvent, signal, ...llm } = {}) {
  const candidates = profiles.filter((p) => p.id !== me.id);
  const results = [];
  onEvent({ type: 'start', total: candidates.length, model: llm.model || DEFAULT_MODEL });

  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) return;
    const other = candidates[i];
    onEvent({ type: 'progress', done: i, total: candidates.length, current: other.name });

    let ai;
    try {
      ai = await judgePair(me, other, { ...llm, signal });
    } catch (e) {
      if (signal?.aborted) return;
      onEvent({ type: 'error', error: e.message || 'AI 판단 중 오류가 났어요' });
      return;
    }

    const rule = guard ? guard(me, other) : { passed: true, reasons: [] };
    const item = {
      profile: other,
      ...ai,
      // AI는 통과시켰지만 필수 조건 위반 → 규칙이 바로잡음
      corrected: ai.pass && !rule.passed,
      ruleReasons: rule.passed ? [] : rule.reasons,
      ruleScore: ruleScore ? ruleScore(me, other) : null,
    };
    if (item.corrected) item.pass = false;
    results.push(item);
    onEvent({ type: 'result', item });
  }

  // 작은 모델은 같은 점수를 자주 주므로, AI 점수가 같으면 규칙 점수로 순서를 정한다
  const recommended = results.filter((r) => r.pass).sort((a, b) => b.score - a.score || (b.ruleScore ?? 0) - (a.ruleScore ?? 0));
  recommended.forEach((r, i) => (r.rank = i + 1));
  onEvent({ type: 'done', recommended, filteredOut: results.filter((r) => !r.pass) });
}

module.exports = {
  DEFAULT_OLLAMA_URL, DEFAULT_MODEL, BASE_MODEL, SYSTEM_PROMPT, ANSWER_SCHEMA,
  teachingMessages, buildMessages, facts, sanitize, checkOllama, judgePair, runAiMatch,
};

  window.AiMatch = module.exports;
})();
