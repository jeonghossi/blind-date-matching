// 🎲 랜덤 매칭 + 익명 미션 화면 (로그인한 본인으로만 참여)
let randomStream = null;
let randomState = { status: 'idle' };

// 내 상태를 실시간으로 받기
function connectRandom() {
  if (randomStream) return;
  const onState = (state) => {
    randomState = state;
    renderRandom();
  };
  if (window.localBackend) {
    randomStream = { close: window.localBackend.subscribe(onState) };
    return;
  }
  randomStream = new EventSource('/api/random/events');
  randomStream.onmessage = (e) => onState(JSON.parse(e.data));
}

function disconnectRandom() {
  randomStream?.close();
  randomStream = null;
  randomState = { status: 'idle' };
}

async function randomAction(action, extra = {}) {
  $('#randomError').textContent = '';
  try {
    await api(`/api/random/${action}`, { method: 'POST', body: JSON.stringify(extra) });
  } catch (err) {
    $('#randomError').textContent = err.error || '문제가 생겼어요';
  }
}

const sendAnswer = (answer) => randomAction('answer', { answer });

function progressDots(s) {
  return Array.from({ length: s.totalMissions }, (_, i) =>
    `<span class="dot ${i < s.missionIndex ? 'done' : i === s.missionIndex ? 'now' : ''}"></span>`).join('');
}

function revealCards(reveal) {
  return `<div class="answers">${reveal.cards.map((c) => `
    <div class="answer-box ${c.mine ? 'mine' : ''}"><div class="muted small">${esc(c.label)}</div>${esc(c.text)}</div>`).join('')}
  </div>`;
}

function historyList(history) {
  if (!history?.length) return '';
  return `<details class="history"><summary>📜 지난 미션 ${history.length}개</summary>
    ${history.map((h) => `<div class="history-row">
      <div class="muted small">${esc(h.title)} · ${esc(h.question)}</div>
      ${h.cards.map((c) => `<div>${esc(c.label)}: ${esc(c.text)}</div>`).join('')}
      ${h.outcome ? `<div class="small">${esc(h.outcome)}</div>` : ''}
    </div>`).join('')}
  </details>`;
}

function renderRandom() {
  const s = randomState;
  const view = $('#randomView');
  const draft = $('#missionInput')?.value; // 다시 그릴 때 입력 중인 글 유지

  if (s.status === 'idle') {
    view.innerHTML = `<div class="card center">
      <div class="big-emoji">🎲</div>
      <p>프로필은 비밀! 익명으로 미션을 하며 알아가요</p>
      <button class="primary big" onclick="randomAction('join')">🎲 랜덤 매칭 시작</button>
    </div>`;
  } else if (s.status === 'waiting') {
    view.innerHTML = `<div class="card center">
      <div class="big-emoji spin">⏳</div>
      <p>상대를 찾는 중...</p>
      <div class="btn-row">
        <button onclick="randomAction('bot')">🤖 봇이랑 테스트</button>
        <button onclick="randomAction('cancel')">✋ 취소</button>
      </div>
    </div>`;
  } else if (s.status === 'ended') {
    view.innerHTML = `<div class="card center">
      <div class="big-emoji">💔</div>
      <p>${s.byMe ? '그만하기를 눌렀어요' : `${esc(s.partnerNickname)}님이 그만하기를 눌렀어요`}</p>
      <p class="muted small">이 상대와는 다시 매칭되지 않아요 · 미션 ${s.missionsDone}개 완료</p>
      <button class="primary big" onclick="randomAction('join')">🎲 새 매칭 시작</button>
    </div>`;
  } else if (s.status === 'revealed') {
    const p = s.partnerProfile;
    view.innerHTML = `<div class="card center">
      <div class="big-emoji">🎉</div>
      <p><strong>모든 미션 완료!</strong> ${esc(s.partnerNickname)}님의 정체는...</p>
      <div class="reveal">
        <div class="name">${esc(p.name)}</div>
        <div class="muted small">${profileLine(p)}</div>
        <div class="tags center-tags">${tags(p.interests || [])}</div>
      </div>
      <button class="primary" onclick="randomAction('join')">🎲 새 매칭 시작</button>
    </div>
    ${historyList(s.history)}`;
  } else {
    view.innerHTML = `<div class="card">
      <div class="row">
        <strong>${esc(s.myNickname)} (나) 💞 ${esc(s.partnerNickname)}</strong>
        <span class="dots">${progressDots(s)}</span>
      </div>
      <div class="mission">
        <div class="muted small">미션 ${s.missionIndex + 1}/${s.totalMissions} · ${esc(s.mission.title)}</div>
        <div class="question">${esc(s.mission.question)}</div>
      </div>
      ${s.phase === 'answering' ? answeringBody(s) : decidingBody(s)}
    </div>
    ${historyList(s.history)}`;
    const input = $('#missionInput');
    if (input && draft) input.value = draft;
  }
}

// 입력 방식별 화면
function inputWidget(spec) {
  if (spec.input === 'choice') {
    return `<div class="choices ${spec.options.length > 2 ? 'four' : ''}">
      ${spec.options.map((o) => `<button class="choice" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  }
  if (spec.input === 'number') {
    const nums = Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min + i);
    return `<div class="numbers">${nums.map((n) => `<button class="choice num" data-number="${n}">${n}</button>`).join('')}</div>`;
  }
  if (spec.input === 'topic') {
    return `<form class="topic-answer" onsubmit="event.preventDefault()">
      <input id="missionInput" maxlength="30" placeholder="${esc(spec.hint || '주제를 입력하세요')}" autocomplete="off">
      <div class="btn-row">${spec.options.map((o) => `<button type="button" class="choice taste" data-taste="${esc(o)}">나는 ${esc(o)}</button>`).join('')}</div>
    </form>`;
  }
  return `<form class="text-answer" onsubmit="event.preventDefault(); sendAnswer(this.answer.value)">
    <input id="missionInput" name="answer" maxlength="100" placeholder="답을 입력하세요" autocomplete="off">
    <button class="primary">보내기</button>
  </form>`;
}

function answeringBody(s) {
  const prompt = s.input.prompt ? `<p class="center prompt">${esc(s.input.prompt)}</p>` : '';
  const context = s.context ? `<div class="context"><div class="muted small">${esc(s.context.label)}</div>${esc(s.context.text)}</div>` : '';
  const stepInfo = s.totalSteps > 1 ? `<span class="muted small">단계 ${s.step + 1}/${s.totalSteps}</span>` : '';
  const leave = `<button class="link" onclick="if (confirm('이 상대와 그만할까요?')) randomAction('leave')">🚪 나가기</button>`;

  let body;
  if (!s.myTurn) {
    body = `<p class="center muted">⏳ ${esc(s.partnerNickname)}님 차례예요. 쓰는 중...</p>`;
  } else if (s.myAnswer != null) {
    const partner = s.partnerTurn ? (s.partnerAnswered ? '✅ 상대 완료' : '✍️ 상대가 답하는 중...') : '';
    body = `<div class="answer-box mine">🙋 ${esc(s.myAnswer)}</div><p class="center muted">⏳ 기다리는 중 ${partner}</p>`;
  } else {
    const partner = s.partnerTurn ? (s.partnerAnswered ? '✅ 상대 답변 완료' : '✍️ 상대가 답하는 중...') : '';
    body = `${prompt}${context}${inputWidget(s.input)}<div class="row"><span class="muted small">${partner}</span>${stepInfo}</div>`;
  }
  return `${body}<div class="row end">${leave}</div>`;
}

function decidingBody(s) {
  const isLast = s.missionIndex === s.totalMissions - 1;
  const decision = s.myDecision
    ? `<p class="center muted">⏳ ${s.partnerDecided ? '곧 다음 미션!' : '상대의 선택을 기다리는 중...'}</p>`
    : `<div class="btn-row">
        <button class="primary big" onclick="randomAction('decide', { keepGoing: true })">${isLast ? '💌 프로필 공개하기' : '💚 계속하기'}</button>
        <button class="big" onclick="if (confirm('이 상대와의 관계를 끝낼까요?')) randomAction('decide', { keepGoing: false })">❌ 그만하기</button>
      </div>`;
  return `${revealCards(s.reveal)}
    ${s.reveal.outcome ? `<p class="center match-msg">${esc(s.reveal.outcome)}</p>` : ''}
    ${decision}`;
}

$('#randomView').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.answer) sendAnswer(btn.dataset.answer);
  else if (btn.dataset.number) sendAnswer(Number(btn.dataset.number));
  else if (btn.dataset.taste) sendAnswer({ topic: $('#missionInput').value, taste: btn.dataset.taste });
});
