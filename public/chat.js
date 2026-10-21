// 💬 AI에게 물어보기: 추천된 상대에 대해 AI와 대화하는 창
const SUGGESTIONS = ['🤔 취미가 안 겹치는데 왜 어울려?', '😟 걱정되는 점은 뭐야?', '☕ 첫 데이트로 뭐 하면 좋을까?', '💬 무슨 얘기로 대화를 시작할까?'];

const chatTargets = {}; // profileId → { profile, aiJudgment }
const chats = {}; // profileId → [{ role, content }]  (창을 닫아도 대화는 남아 있음)
let chatOpenId = null;
let chatAbort = null;

// 추천 카드를 그릴 때 등록해 두면 💬 버튼으로 열 수 있다
function registerChatTarget(profile, aiJudgment) {
  chatTargets[profile.id] = { profile, aiJudgment: aiJudgment || chatTargets[profile.id]?.aiJudgment };
}
const askButton = (id) => `<button class="ask-btn" data-ask="${id}">💬 AI에게 물어보기</button>`;

document.body.insertAdjacentHTML('beforeend', `
  <div id="chatModal" class="modal" hidden>
    <div class="modal-box">
      <div class="row chat-head">
        <strong id="chatTitle"></strong>
        <button class="link" onclick="closeChat()" title="닫기">✕</button>
      </div>
      <div id="chatMessages" class="chat-messages"></div>
      <div id="chatSuggest" class="chat-suggest"></div>
      <form id="chatForm" class="text-answer">
        <input id="chatInput" maxlength="300" placeholder="궁금한 걸 물어보세요" autocomplete="off">
        <button class="primary" id="chatSend">보내기</button>
      </form>
    </div>
  </div>`);

// 서버 버전은 /api/ai/ask (NDJSON 스트림), 깃허브 페이지 버전은 브라우저에서 바로 Ollama 호출
async function streamAsk(body, onToken, signal) {
  if (window.localBackend?.askAi) return window.localBackend.askAi(body, onToken, signal);
  const res = await fetch('/api/ai/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'AI에게 물어볼 수 없어요');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'token') onToken(event.text);
      if (event.type === 'error') throw new Error(event.error);
    }
  }
}

function openChat(id) {
  const target = chatTargets[id];
  if (!target) return;
  chatOpenId = id;
  chats[id] ||= [];
  $('#chatTitle').textContent = `💬 ${target.profile.name}님에 대해 물어보기`;
  $('#chatModal').hidden = false;
  renderChat();
  $('#chatInput').focus();
}

function closeChat() {
  chatAbort?.abort();
  chatAbort = null;
  chatOpenId = null;
  $('#chatModal').hidden = true;
}

function renderChat() {
  const messages = chats[chatOpenId] || [];
  const busy = Boolean(chatAbort);
  $('#chatMessages').innerHTML = messages.length
    ? messages.map((m) => `<div class="bubble ${m.role}">${m.content ? esc(m.content) : '<span class="typing">✍️ 생각하는 중...</span>'}</div>`).join('')
    : `<div class="muted small center">🤖 ${esc(chatTargets[chatOpenId].profile.name)}님과 왜 어울리는지, 무엇이든 물어보세요.<br>프로필과 점수 근거를 보고 답해요.</div>`;
  $('#chatSuggest').innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="chip" ${busy ? 'disabled' : ''}>${esc(s)}</button>`).join('');
  $('#chatInput').disabled = busy;
  $('#chatSend').disabled = busy;
  const box = $('#chatMessages');
  box.scrollTop = box.scrollHeight;
}

async function sendChat(question) {
  const id = chatOpenId;
  const text = question.replace(/^\S+\s/, (m) => (/[\p{Emoji_Presentation}]/u.test(m) ? '' : m)).trim(); // 추천 질문의 이모지 떼기
  if (!id || !text || chatAbort) return;
  const messages = chats[id];
  messages.push({ role: 'user', content: text });
  const answer = { role: 'assistant', content: '' };
  messages.push(answer);
  chatAbort = new AbortController();
  renderChat();
  try {
    await streamAsk(
      { candidateId: id, messages: messages.slice(0, -1), aiJudgment: chatTargets[id].aiJudgment },
      (token) => {
        answer.content += token;
        if (chatOpenId === id) renderChat();
      },
      chatAbort.signal,
    );
    if (!answer.content) answer.content = '😅 답을 만들지 못했어요. 다시 물어봐 주세요.';
  } catch (e) {
    if (e.name === 'AbortError') {
      answer.content ||= '(중지했어요)';
    } else {
      answer.content = `⚠️ ${e.message}`;
    }
  }
  chatAbort = null;
  if (chatOpenId === id) renderChat();
}

document.addEventListener('click', (e) => {
  const ask = e.target.closest('[data-ask]');
  if (ask) openChat(ask.dataset.ask);
  if (e.target.id === 'chatModal') closeChat(); // 바깥 클릭하면 닫기
  if (e.target.closest('#chatSuggest .chip')) sendChat(e.target.closest('.chip').textContent);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && chatOpenId) closeChat();
});
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  sendChat(input.value);
  input.value = '';
});
