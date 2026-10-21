// 🤖 AI 매칭 화면: 로컬 LLM이 후보를 한 명씩 판단하는 과정을 실시간으로 보여 준다
let aiStop = null;
let aiRun = null; // { total, done, current, model, results, finished, error }

const aiVerdict = (score) => (score >= 80 ? '💖 천생연분' : score >= 60 ? '😊 잘 맞아요' : score >= 40 ? '🙂 무난해요' : '🤔 글쎄요');

// 서버 버전은 SSE, 깃허브 페이지 버전은 브라우저에서 바로 Ollama 호출
function streamAiMatch(onEvent) {
  if (window.localBackend?.aiMatch) return window.localBackend.aiMatch(onEvent);
  const es = new EventSource('/api/ai-match/stream');
  let finished = false;
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'done' || event.type === 'error') {
      finished = true;
      es.close();
    }
    onEvent(event);
  };
  es.onerror = () => {
    if (finished) return;
    finished = true;
    es.close();
    onEvent({ type: 'error', error: '서버와 연결이 끊겼어요' });
  };
  return () => {
    finished = true;
    es.close();
  };
}

async function showAiPanel() {
  if (aiRun) return renderAi();
  $('#aiView').innerHTML = '<div class="card center muted">🔌 AI 연결 확인 중...</div>';
  let status;
  try {
    status = await api('/api/ai/status');
  } catch (err) {
    status = { ok: false, error: err.error || '상태를 확인할 수 없어요' };
  }
  $('#aiView').innerHTML = `<div class="card center">
    <div class="big-emoji">🤖</div>
    <p>AI가 후보를 한 명씩 직접 보고<br><b>거르고 · 점수 매기고 · 이유를 설명</b>해 줘요</p>
    <p class="small ${status.ok ? 'ok-text' : 'error'}">${status.ok ? `🟢 연결됨 · ${esc(status.model)}` : `🔴 ${esc(status.error)}`}</p>
    <button class="primary big" onclick="startAi()" ${status.ok ? '' : 'disabled'}>🤖 AI 매칭 시작</button>
    <p class="muted small">한 명에 2~4초 정도 걸려요</p>
  </div>`;
}

function startAi() {
  aiRun = { total: 0, done: 0, current: '', model: '', results: [], finished: false, error: null };
  renderAi();
  aiStop = streamAiMatch((event) => {
    if (event.type === 'start') Object.assign(aiRun, { total: event.total, model: event.model });
    if (event.type === 'progress') Object.assign(aiRun, { done: event.done, current: event.current });
    if (event.type === 'result') {
      aiRun.results.push(event.item);
      aiRun.done = aiRun.results.length;
    }
    if (event.type === 'done') aiRun.finished = true;
    if (event.type === 'error') {
      aiRun.error = event.error;
      aiRun.finished = true;
    }
    renderAi();
  });
}

function stopAi() {
  aiStop?.();
  aiStop = null;
  if (aiRun && !aiRun.finished) {
    aiRun.finished = true;
    aiRun.error = '중지했어요';
  }
  renderAi();
}

function resetAi() {
  stopAi();
  aiRun = null;
  showAiPanel();
}

function aiCard(r, rank) {
  registerChatTarget(r.profile, { score: r.score, reason: r.reason });
  return `<div class="card rec">
    <div class="rank">${MEDALS[rank - 1] || rank + '위'}</div>
    <div class="rec-body">
      <div class="name">${esc(r.profile.name)}</div>
      <div class="muted small">${profileLine(r.profile)}</div>
      <div class="tags">${tags(r.tags)}</div>
      <p class="ai-reason">🤖 ${esc(r.reason)}</p>
      ${r.ruleScore != null ? `<div class="muted small">📏 규칙 점수 ${r.ruleScore}점과 비교해 보세요</div>` : ''}
      ${askButton(r.profile.id)}
    </div>
    ${scoreBox(r.score, aiVerdict(r.score))}
  </div>`;
}

function aiFilteredRow(r) {
  const why = r.corrected
    ? `<span class="tag warn">⚠️ AI는 통과시켰지만 조건 위반</span>${tags(r.ruleReasons, 'bad')}`
    : tags(r.failReasons.length ? r.failReasons : ['이유 없음'], 'bad');
  return `<div class="filtered-row"><strong>${esc(r.profile.name)}</strong> ${why}</div>`;
}

function renderAi() {
  const run = aiRun;
  const passed = run.results.filter((r) => r.pass).sort((a, b) => b.score - a.score || (b.ruleScore ?? 0) - (a.ruleScore ?? 0));
  const filtered = run.results.filter((r) => !r.pass);
  const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;

  const header = run.finished
    ? `<div class="card row">
        <span>${run.error ? `⚠️ ${esc(run.error)} (${run.done}/${run.total}명 판단)` : `✅ AI가 ${run.total}명을 모두 검토했어요`}</span>
        <button onclick="resetAi()">🔄 다시 하기</button>
      </div>`
    : `<div class="card">
        <div class="row"><span>🔍 <b>${esc(run.current || '준비 중')}</b>님 검토 중 · ${run.done}/${run.total || '?'}</span>
        <button class="link" onclick="stopAi()">⏹ 중지</button></div>
        <div class="bar progress"><div style="width:${pct}%"></div></div>
        <div class="muted small">${esc(run.model)} 이(가) 한 명씩 판단하고 있어요</div>
      </div>`;

  $('#aiView').innerHTML = `${header}
    <h2 class="section-title">🤖 AI 추천 ${passed.length}명</h2>
    ${passed.length === 0 ? `<div class="card muted">${run.finished ? '😢 AI가 추천할 사람을 찾지 못했어요' : '⏳ 판단이 끝난 사람부터 여기에 나와요'}</div>` : ''}
    ${passed.map((r, i) => aiCard(r, i + 1)).join('')}
    ${filtered.length ? `<details class="card"><summary>🚫 AI가 거른 ${filtered.length}명</summary>${filtered.map(aiFilteredRow).join('')}</details>` : ''}`;
}
