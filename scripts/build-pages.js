// 깃허브 페이지용 docs/ 폴더 만들기 (서버 없이 HTML만으로 동작하는 버전)
// 사용법: npm run build:pages
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, content) => fs.writeFileSync(path.join(out, p), content);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

// Node용 모듈(module.exports)을 브라우저 전역 변수로 감싸기
function wrapModule(file, globalName) {
  return `// ${file} 에서 자동 생성 — 직접 수정하지 마세요 (npm run build:pages)
(function () {
  const module = { exports: {} };
${read(file)}
  window.${globalName} = module.exports;
})();
`;
}

write('matching.js', wrapModule('src/matching.js', 'Matching'));
write('randomMatch.js', wrapModule('src/randomMatch.js', 'RandomMatch'));
write('sampleData.js', wrapModule('src/sampleData.js', 'SampleData'));
for (const f of ['app.js', 'random.js', 'style.css']) write(f, read(`public/${f}`));
write('local-backend.js', read('pages/local-backend.js'));

// index.html: 상대 경로로 바꾸고, 브라우저 백엔드 스크립트 추가, 안내 문구 변경
let html = read('public/index.html');
const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html에서 찾을 수 없음: ${from}`);
  html = html.replace(from, to);
};
replace('href="/style.css"', 'href="style.css"');
replace(
  '<script src="/app.js"></script>\n<script src="/random.js"></script>',
  ['matching.js', 'randomMatch.js', 'sampleData.js', 'local-backend.js', 'app.js', 'random.js']
    .map((f) => `<script src="${f}"></script>`).join('\n'),
);
replace('<main>', '<main>\n  <div class="demo-banner">🧪 데모 버전 · 데이터는 이 브라우저에만 저장돼요</div>');
replace(
  '💡 다른 계정으로 시크릿 창(Ctrl+Shift+N)에서 로그인하면 실시간으로 만날 수 있어요',
  '💡 새 탭에 이 주소를 붙여넣고 다른 계정으로 로그인하면, 두 사람처럼 실시간으로 테스트할 수 있어요',
);
write('index.html', html);
write('.nojekyll', '');

console.log(`docs/ 생성 완료: ${fs.readdirSync(out).join(', ')}`);
