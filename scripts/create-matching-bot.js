// 전용 모델 matching-bot 만들기: EXAONE에 지시문 + 예시 판단을 넣어 Ollama 모델로 등록
// 사용법: npm run create:bot   (src/aiMatch.js의 지시문·예시를 바꾸면 다시 실행)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { BASE_MODEL, teachingMessages } = require('../src/aiMatch');

const quote = (s) => `"""${s.replace(/"""/g, '"\\""')}"""`;
const [system, ...examples] = teachingMessages();

const modelfile = [
  '# src/aiMatch.js에서 자동 생성 — 직접 수정하지 마세요 (npm run create:bot)',
  `FROM ${BASE_MODEL}`,
  '',
  `SYSTEM ${quote(system.content)}`,
  '',
  ...examples.map((m) => `MESSAGE ${m.role} ${quote(m.content)}`),
  '',
  'PARAMETER temperature 0.2',
  'PARAMETER num_ctx 4096',
  'PARAMETER num_predict 500',
  '',
].join('\n');

const file = path.join(__dirname, '..', 'ollama', 'Modelfile');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, modelfile);
console.log(`Modelfile 생성: ${path.relative(process.cwd(), file)}`);

const result = spawnSync('ollama', ['create', 'matching-bot', '-f', file], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error('❌ ollama create 실패 — Ollama가 설치되어 있고 켜져 있는지 확인하세요');
  process.exit(1);
}
console.log('✅ matching-bot 모델을 만들었어요 (ollama run matching-bot 으로 확인 가능)');
