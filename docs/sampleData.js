// src/sampleData.js 에서 자동 생성 — 직접 수정하지 마세요 (npm run build:pages)
(function () {
  const module = { exports: {} };
// 테스트용 샘플 프로필
const pref = (preferredGender, ageMin, ageMax, heightMin, heightMax, extra = {}) => ({
  preferredGender, ageMin, ageMax, heightMin, heightMax,
  nonSmokerOnly: false, sameReligionOnly: false, sameRegionOnly: false,
  ...extra,
});

const sampleProfiles = [
  { id: 'u1', name: '김민준', gender: '남성', age: 29, height: 178, region: '서울', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ENFP', intent: '진지한 연애', job: '개발자', interests: ['여행', '영화', '카페', '사진'], preferences: pref('여성', 25, 31, 155, 172) },
  { id: 'u2', name: '이서연', gender: '여성', age: 27, height: 163, region: '서울', religion: '무교', smoking: false, drinking: '가끔', mbti: 'INFJ', intent: '진지한 연애', job: '디자이너', interests: ['여행', '카페', '전시회', '사진'], preferences: pref('남성', 27, 33, 172, 190, { nonSmokerOnly: true }) },
  { id: 'u3', name: '박지훈', gender: '남성', age: 33, height: 182, region: '경기', religion: '기독교', smoking: false, drinking: '안 마심', mbti: 'ISTJ', intent: '결혼 전제', job: '회계사', interests: ['독서', '등산', '요리'], preferences: pref('여성', 28, 34, 155, 175, { sameReligionOnly: true }) },
  { id: 'u4', name: '최수아', gender: '여성', age: 31, height: 160, region: '경기', religion: '기독교', smoking: false, drinking: '안 마심', mbti: 'ESFJ', intent: '결혼 전제', job: '교사', interests: ['독서', '요리', '반려동물', '등산'], preferences: pref('남성', 30, 36, 170, 190) },
  { id: 'u5', name: '정도윤', gender: '남성', age: 25, height: 172, region: '부산', religion: '무교', smoking: true, drinking: '자주', mbti: 'ESTP', intent: '가벼운 만남', job: '대학원생', interests: ['게임', '운동', '맛집'], preferences: pref('여성', 21, 28, 150, 170) },
  { id: 'u6', name: '강하은', gender: '여성', age: 24, height: 158, region: '부산', religion: '무교', smoking: false, drinking: '자주', mbti: 'ENTP', intent: '가벼운 만남', job: '마케터', interests: ['맛집', '게임', '음악', '운동'], preferences: pref('남성', 23, 30, 168, 190) },
  { id: 'u7', name: '윤시우', gender: '남성', age: 30, height: 175, region: '인천', religion: '천주교', smoking: false, drinking: '가끔', mbti: 'INTJ', intent: '진지한 연애', job: '연구원', interests: ['독서', '전시회', '음악', '영화'], preferences: pref('여성', 26, 32, 155, 170) },
  { id: 'u8', name: '한지민', gender: '여성', age: 28, height: 167, region: '서울', religion: '천주교', smoking: false, drinking: '가끔', mbti: 'ENFP', intent: '진지한 연애', job: '간호사', interests: ['영화', '음악', '전시회', '카페'], preferences: pref('남성', 28, 34, 175, 190) },
  { id: 'u9', name: '오준서', gender: '남성', age: 35, height: 170, region: '대구', religion: '불교', smoking: true, drinking: '자주', mbti: 'ESTJ', intent: '결혼 전제', job: '자영업', interests: ['등산', '캠핑', '맛집'], preferences: pref('여성', 28, 35, 150, 170) },
  { id: 'u10', name: '서예린', gender: '여성', age: 32, height: 165, region: '대구', religion: '불교', smoking: false, drinking: '가끔', mbti: 'ISFP', intent: '결혼 전제', job: '공무원', interests: ['캠핑', '등산', '반려동물', '요리'], preferences: pref('남성', 30, 38, 168, 185) },
  { id: 'u11', name: '임현우', gender: '남성', age: 27, height: 185, region: '서울', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ISFP', intent: '진지한 연애', job: '운동 트레이너', interests: ['운동', '캠핑', '요리', '반려동물'], preferences: pref('여성', 23, 29, 155, 175) },
  { id: 'u12', name: '송유나', gender: '여성', age: 26, height: 170, region: '경기', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ESFP', intent: '진지한 연애', job: '승무원', interests: ['여행', '운동', '반려동물', '맛집'], preferences: pref('남성', 26, 32, 178, 195) },
  { id: 'u13', name: '조은호', gender: '남성', age: 31, height: 168, region: '광주', religion: '무교', smoking: false, drinking: '안 마심', mbti: 'INFP', intent: '진지한 연애', job: '작가', interests: ['독서', '영화', '카페', '음악'], preferences: pref('여성', 26, 33, 150, 168) },
  { id: 'u14', name: '배소희', gender: '여성', age: 29, height: 156, region: '광주', religion: '무교', smoking: false, drinking: '안 마심', mbti: 'ENFJ', intent: '진지한 연애', job: '약사', interests: ['독서', '카페', '드라마', '영화'], preferences: pref('남성', 28, 35, 165, 185) },
  { id: 'u15', name: '신재원', gender: '남성', age: 28, height: 180, region: '서울', religion: '기독교', smoking: true, drinking: '자주', mbti: 'ENTJ', intent: '가벼운 만남', job: '영업직', interests: ['운동', '맛집', '여행', '게임'], preferences: pref('여성', 22, 30, 155, 175) },
  { id: 'u16', name: '권다인', gender: '여성', age: 25, height: 162, region: '서울', religion: '무교', smoking: false, drinking: '자주', mbti: 'ISTP', intent: '진지한 연애', job: '사진작가', interests: ['사진', '여행', '캠핑', '음악'], preferences: pref('남성', 25, 31, 172, 190) },
  { id: 'u17', name: '황태민', gender: '남성', age: 38, height: 176, region: '경기', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ISFJ', intent: '결혼 전제', job: '의사', interests: ['요리', '여행', '드라마'], preferences: pref('여성', 30, 38, 155, 172) },
  { id: 'u18', name: '안채원', gender: '여성', age: 34, height: 168, region: '인천', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ENTJ', intent: '결혼 전제', job: '변호사', interests: ['여행', '요리', '전시회', '드라마'], preferences: pref('남성', 33, 40, 173, 190) },
  { id: 'u19', name: '류건우', gender: '남성', age: 26, height: 174, region: '대전', religion: '무교', smoking: false, drinking: '가끔', mbti: 'INTP', intent: '진지한 연애', job: '개발자', interests: ['게임', '영화', '음악'], preferences: pref('여성', 22, 29, 150, 170, { sameRegionOnly: true }) },
  { id: 'u20', name: '문하린', gender: '여성', age: 23, height: 161, region: '대전', religion: '무교', smoking: false, drinking: '가끔', mbti: 'ESFP', intent: '진지한 연애', job: '대학생', interests: ['게임', '음악', '드라마', '맛집'], preferences: pref('남성', 22, 30, 170, 185) },
];

module.exports = { sampleProfiles };

  window.SampleData = module.exports;
})();
