// AI 매칭 품질 평가: 여러 사람 기준으로 모든 후보를 판단시켜 점수를 매긴다
// 사용법: node scripts/eval-ai.js [모델이름]
const { judgePair } = require('../src/aiMatch');
const { filterPair } = require('../src/matching');
const { sampleProfiles } = require('../src/sampleData');

const model = process.argv[2];
const USERS = ['u1', 'u4', 'u11']; // 김민준(남), 최수아(여), 임현우(남)
const INTERESTS = ['여행', '영화', '음악', '운동', '요리', '독서', '게임', '카페', '등산', '사진', '반려동물', '맛집', '전시회', '캠핑', '드라마'];

(async () => {
  const stats = { total: 0, agree: 0, falsePass: 0, falseFail: 0, invented: 0, english: 0, cut: 0, scores: [], ms: 0 };
  for (const uid of USERS) {
    const me = sampleProfiles.find((p) => p.id === uid);
    for (const other of sampleProfiles.filter((p) => p.id !== uid)) {
      const t = Date.now();
      const r = await judgePair(me, other, model ? { model } : {});
      stats.ms += Date.now() - t;
      stats.total++;
      const truth = filterPair(me, other).passed;
      if (r.pass === truth) stats.agree++;
      else if (r.pass) stats.falsePass++;
      else stats.falseFail++;
      if (truth) stats.scores.push(r.score);

      // 설명에 나온 관심사 중 실제로 둘 다 갖고 있지 않은 것 = 지어낸 공통점
      const common = me.interests.filter((x) => other.interests.includes(x));
      const mentioned = INTERESTS.filter((x) => r.reason.includes(x));
      const invented = mentioned.filter((x) => !common.includes(x) && !(me.interests.includes(x) && r.reason.includes('반면')));
      stats.invented += invented.length;
      if (/[A-Za-z]{3,}/.test(r.reason.replace(/[EI][NS][TF][JP]/g, ''))) stats.english++;
      if (r.reason.endsWith('…')) stats.cut++;
      process.stdout.write(r.pass === truth ? '.' : 'x');
    }
  }
  const s = stats.scores;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  const top = Object.entries(s.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
  console.log(`\n모델: ${model || '기본'}`);
  console.log(`거르기 정확도   ${stats.agree}/${stats.total} (${Math.round((stats.agree / stats.total) * 100)}%)  잘못 통과 ${stats.falsePass} · 잘못 거름 ${stats.falseFail}`);
  console.log(`점수 (통과 대상) 평균 ${mean.toFixed(1)} · 표준편차 ${sd.toFixed(1)} · 서로 다른 점수 ${new Set(s).size}개 · 가장 많은 점수 ${top[0]}점 ${top[1]}/${s.length}번`);
  console.log(`지어낸 관심사   ${stats.invented}건`);
  console.log(`영어 섞임       ${stats.english}건 · 끊긴 문장 ${stats.cut}건`);
  console.log(`속도            한 명당 ${(stats.ms / stats.total / 1000).toFixed(1)}초`);
})();
