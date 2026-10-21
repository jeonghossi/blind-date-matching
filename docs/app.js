const INTERESTS = { 여행: '✈️', 영화: '🎬', 음악: '🎵', 운동: '💪', 요리: '🍳', 독서: '📚', 게임: '🎮', 카페: '☕', 등산: '⛰️', 사진: '📷', 반려동물: '🐶', 맛집: '🍜', 전시회: '🖼️', 캠핑: '🏕️', 드라마: '📺' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let me = { user: null, profile: null };

// 서버 버전은 fetch, 깃허브 페이지 버전은 브라우저 안의 localBackend로 요청
async function api(path, options = {}) {
  const { status, data } = window.localBackend
    ? await window.localBackend.request(options.method || 'GET', path, options.body ? JSON.parse(options.body) : {})
    : await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
      .then(async (res) => ({ status: res.status, data: await res.json() }));
  if (status === 401 && !path.startsWith('/api/auth/')) {
    loadMe(); // 로그인이 풀렸으면 로그인 화면으로
  }
  if (status >= 400) throw data;
  return data;
}

// ---------------------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------------------

function showPanel(id) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('#nav .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'recommend') showRecommendations();
  if (id === 'random') connectRandom();
  if (id === 'ai') showAiPanel();
  if (id === 'admin') loadAdmin();
}

document.querySelectorAll('#nav .tab').forEach((btn) => btn.addEventListener('click', () => showPanel(btn.dataset.tab)));

async function loadMe() {
  me = await api('/api/auth/me');
  render();
}

// 로그인 상태에 따라 보이는 탭 정하기
function render() {
  const { user, profile } = me;
  $('#userBox').hidden = !user;
  $('#nav').hidden = !user;
  if (!user) {
    disconnectRandom();
    aiStop?.(); // 다른 사람이 로그인하면 이전 AI 결과는 지운다
    aiRun = null;
    return showPanel('auth');
  }
  $('#userName').textContent = `${user.role === 'admin' ? '🛠️' : '👤'} ${user.username}`;

  const tabs = user.role === 'admin' ? ['admin'] : profile ? ['profile', 'recommend', 'ai', 'random'] : ['profile'];
  document.querySelectorAll('#nav .tab').forEach((b) => (b.hidden = !tabs.includes(b.dataset.tab)));

  fillProfileForm(profile);
  const current = document.querySelector('.panel.active')?.id;
  showPanel(tabs.includes(current) ? current : user.role === 'admin' ? 'admin' : profile ? 'recommend' : 'profile');
}

// ---------------------------------------------------------------------------
// 로그인 / 회원가입
// ---------------------------------------------------------------------------

let authMode = 'login';
document.querySelectorAll('.auth-switch .tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    authMode = btn.dataset.mode;
    document.querySelectorAll('.auth-switch .tab').forEach((b) => b.classList.toggle('active', b === btn));
    $('#authSubmit').textContent = authMode === 'login' ? '로그인' : '가입하기';
    $('#authForm').password.autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    $('#authErrors').textContent = authMode === 'signup' ? '아이디: 영문 소문자·숫자 4~20자 · 비밀번호: 8자 이상' : '';
  });
});

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    me = await api(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({ username: f.username.value.trim(), password: f.password.value }),
    });
    f.reset();
    $('#authErrors').textContent = '';
    render();
  } catch (err) {
    $('#authErrors').textContent = (err.errors || [err.error]).join('\n');
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  me = { user: null, profile: null };
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  render();
});

// ---------------------------------------------------------------------------
// 내 프로필
// ---------------------------------------------------------------------------

$('#interests').innerHTML = Object.entries(INTERESTS).map(([i, icon]) => `<span class="chip" data-value="${i}">${icon} ${i}</span>`).join('');
$('#interests').addEventListener('click', (e) => {
  if (e.target.classList.contains('chip')) e.target.classList.toggle('on');
});

function fillProfileForm(profile) {
  const f = $('#profileForm');
  $('#profileNotice').hidden = Boolean(profile);
  $('#profileSubmit').textContent = profile ? '💾 저장하기' : '💌 등록하고 추천 보기';
  $('#formErrors').textContent = '';
  $('#formSaved').textContent = '';
  if (!profile) {
    f.reset();
    document.querySelectorAll('#interests .chip').forEach((c) => c.classList.remove('on'));
    return;
  }
  const pref = profile.preferences || {};
  const values = {
    ...profile, smoking: String(Boolean(profile.smoking)),
    preferredGender: pref.preferredGender, ageMin: pref.ageMin, ageMax: pref.ageMax, heightMin: pref.heightMin, heightMax: pref.heightMax,
  };
  for (const [k, v] of Object.entries(values)) {
    if (f.elements[k] && f.elements[k].type !== 'checkbox' && v != null) f.elements[k].value = v;
  }
  for (const k of ['nonSmokerOnly', 'sameReligionOnly', 'sameRegionOnly']) f.elements[k].checked = Boolean(pref[k]);
  document.querySelectorAll('#interests .chip').forEach((c) => c.classList.toggle('on', (profile.interests || []).includes(c.dataset.value)));
}

$('#profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const num = (k) => (f.get(k) === '' ? null : Number(f.get(k)));
  const profile = {
    name: f.get('name').trim(),
    gender: f.get('gender'),
    age: num('age'),
    height: num('height'),
    region: f.get('region'),
    job: f.get('job').trim(),
    religion: f.get('religion'),
    mbti: f.get('mbti').trim().toUpperCase(),
    drinking: f.get('drinking'),
    smoking: f.get('smoking') === 'true',
    intent: f.get('intent'),
    interests: [...document.querySelectorAll('#interests .chip.on')].map((c) => c.dataset.value),
    preferences: {
      preferredGender: f.get('preferredGender'),
      ageMin: num('ageMin'),
      ageMax: num('ageMax'),
      heightMin: num('heightMin'),
      heightMax: num('heightMax'),
      nonSmokerOnly: f.has('nonSmokerOnly'),
      sameReligionOnly: f.has('sameReligionOnly'),
      sameRegionOnly: f.has('sameRegionOnly'),
    },
  };
  const isNew = !me.profile;
  try {
    me = await api('/api/profiles/me', { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(profile) });
    render();
    if (isNew) showPanel('recommend');
    else $('#formSaved').textContent = '✅ 저장했어요';
  } catch (err) {
    $('#formErrors').textContent = (err.errors || [err.error]).join('\n');
  }
});

// ---------------------------------------------------------------------------
// 추천
// ---------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉'];
const tags = (list, cls = '') => list.map((x) => `<span class="tag ${cls}">${esc(x)}</span>`).join('');

// 항목별 점수 + 왜 그 점수가 나왔는지
function bars(breakdown, note) {
  const total = Math.round(breakdown.reduce((sum, b) => sum + b.points, 0));
  return `<div class="explain-note">💡 ${esc(note)} · 항목 점수를 모두 더하면 <b>${total}점</b></div>
  <div class="bars">${breakdown.map((b) => `
    <span>${b.label}</span>
    <div class="bar"><div style="width:${(b.points / b.max) * 100}%"></div></div>
    <span>${b.points}/${b.max}</span>
    <span class="explain">${esc(b.detail)}</span>`).join('')}</div>`;
}

function profileLine(p) {
  return [`🎂 ${p.age}`, `📏 ${p.height}`, `📍 ${esc(p.region)}`, p.job && `💼 ${esc(p.job)}`, p.mbti && `🧠 ${esc(p.mbti)}`]
    .filter(Boolean).join(' · ');
}

function scoreBox(score, summary) {
  return `<div class="score-box"><span class="score">${score}</span><span class="verdict">${esc(summary)}</span></div>`;
}

async function showRecommendations() {
  const { recommended, filteredOut } = await api('/api/recommendations/me');
  recommended.forEach((r) => registerChatTarget(r.profile));
  $('#recommendResult').innerHTML = `
    <h2 class="section-title">✨ 추천 ${recommended.length}명</h2>
    ${recommended.length === 0 ? '<div class="card muted">😢 맞는 상대가 없어요. 조건을 넓혀 보세요!</div>' : ''}
    ${recommended.map((r) => `
      <div class="card rec">
        <div class="rank">${MEDALS[r.rank - 1] || r.rank + '위'}</div>
        <div class="rec-body">
          <div class="name">${esc(r.profile.name)}</div>
          <div class="muted small">${profileLine(r.profile)}</div>
          <div class="tags">${tags(r.reasons)}</div>
          <details><summary>📊 왜 ${r.score}점일까?</summary>${bars(r.breakdown, `왼쪽이 나, 오른쪽이 ${r.profile.name}님`)}</details>
          ${askButton(r.profile.id)}
        </div>
        ${scoreBox(r.score, r.summary)}
      </div>`).join('')}
    <details class="card">
      <summary>🚫 걸러진 ${filteredOut.length}명</summary>
      ${filteredOut.map((f) => `
        <div class="filtered-row"><strong>${esc(f.profile.name)}</strong> ${tags(f.reasons, 'bad')}</div>`).join('')}
    </details>
    <div class="card random-cta">
      <span>😕 맘에 드는 사람이 없나요?</span>
      <div class="btn-row">
        <button onclick="showPanel('ai')">🤖 AI에게 골라 달라기</button>
        <button class="primary" onclick="showPanel('random')">🎲 랜덤 매칭 해보기</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// 관리자
// ---------------------------------------------------------------------------

async function loadAdmin() {
  const list = await api('/api/admin/profiles');
  $('#count').textContent = list.length;
  $('#profileTable').innerHTML = `
    <tr><th>아이디</th><th>이름</th><th>🚻</th><th>🎂</th><th>📏</th><th>📍</th><th>관심사</th><th></th></tr>
    ${list.map((p) => `
      <tr>
        <td class="muted">${esc(p.username || '-')}</td>
        <td>${esc(p.name)}</td><td>${esc(p.gender)}</td><td>${p.age}</td><td>${p.height}</td>
        <td>${esc(p.region)}</td>
        <td>${(p.interests || []).map((i) => INTERESTS[i] || esc(i)).join(' ')}</td>
        <td><button class="icon" data-del="${p.id}" title="삭제">🗑️</button></td>
      </tr>`).join('')}`;
}

$('#profileTable').addEventListener('click', async (e) => {
  const id = e.target.dataset.del;
  if (!id || !confirm('이 프로필을 삭제할까요?')) return;
  await api(`/api/admin/profiles/${id}`, { method: 'DELETE' });
  loadAdmin();
});

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('모든 계정과 프로필이 지워지고 샘플 데이터로 바뀝니다. (다시 로그인해야 해요) 계속할까요?')) return;
  await api('/api/admin/reset', { method: 'POST' });
  loadMe();
});

$('#matchBtn').addEventListener('click', async () => {
  const { matches, unmatched } = await api(`/api/admin/matches?minScore=${$('#minScore').value}`);
  $('#matchResult').innerHTML = `
    <h2 class="section-title">💑 커플 ${matches.length}쌍</h2>
    ${matches.map((m) => `
      <div class="card rec">
        <div class="rec-body">
          <div class="name">${esc(m.a.name)} ❤️ ${esc(m.b.name)}</div>
          <div class="tags">${tags(m.reasons)}</div>
          <details><summary>📊 왜 ${m.score}점일까?</summary>${bars(m.breakdown, `왼쪽이 ${m.a.name}님, 오른쪽이 ${m.b.name}님`)}</details>
        </div>
        ${scoreBox(m.score, m.summary)}
      </div>`).join('')}
    <div class="card">
      <strong>😢 아직 짝이 없어요</strong>
      <div class="tags">${unmatched.length ? tags(unmatched.map((p) => p.name), 'gray') : '<span class="muted">없음 🎉</span>'}</div>
    </div>`;
});

window.addEventListener('DOMContentLoaded', loadMe);
