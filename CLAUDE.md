# CLAUDE.md — 소개팅 매칭 프로젝트 관리 노트

Claude가 이 프로젝트를 이어서 관리할 때 먼저 읽는 파일. 구조·규칙·배포 절차가 바뀌면 이 파일도 함께 고친다.

## 한눈에
- 소개팅 매칭 웹앱: 프로필 → 규칙 거르기 → 점수 → 순위/1:1 매칭(이유 설명) + 🎲 익명 랜덤 미션 + 🔐 계정 + 🤖 로컬 LLM AI 매칭
- **외부 npm 패키지 없음.** Node.js(18+) 기본 모듈만 사용. 새 의존성은 사용자와 상의 후에만
- 저장소: https://github.com/jeonghossi/blind-date-matching (공개)
- 데모: https://jeonghossi.github.io/blind-date-matching/ (`main` 브랜치 `/docs` 폴더로 GitHub Pages 배포)

## 두 가지 실행 형태 (같은 코드를 공유)
| | 서버 버전 | 깃허브 페이지 버전 |
|---|---|---|
| 진입점 | `server.js` + `public/` | `docs/` (자동 생성) |
| 서버 역할 | `server.js` | `pages/local-backend.js` (브라우저 안에서 같은 API 흉내) |
| 저장 | `data/*.json` (git 제외) | localStorage, 로그인은 탭별 sessionStorage |
| 실시간 | SSE | 같은 브라우저 탭끼리 storage 이벤트 |

`public/app.js`·`random.js`·`ai.js`는 `window.localBackend`가 있으면 그걸, 없으면 `fetch`/`EventSource`를 쓴다. **API를 추가·변경하면 `server.js`와 `pages/local-backend.js` 둘 다 고친다.**

## 파일 지도
| 파일 | 역할 |
|---|---|
| `src/matching.js` | 1단계 거르기(양방향) · 2단계 점수(`WEIGHTS`, 합 100) · 이유 태그/`detail` 설명 · 추천/전체 매칭 |
| `src/randomMatch.js` | 랜덤 매칭 + 익명 미션. 미션 종류는 `KINDS`, 목록은 `MISSION_POOL`. `toJSON`/`loadState`로 상태 저장 |
| `src/aiMatch.js` | 🤖 AI 매칭. `SYSTEM_PROMPT`, 예시 `EXAMPLES`, `facts()`(코드가 계산한 사실), JSON 스키마, `runAiMatch` / 💬 AI에게 물어보기 `CHAT_RULES`·`chatContext`·`askAi`(스트림) |
| `src/auth.js` | scrypt 비밀번호 해시, 로그인 세션(메모리), 쿠키 |
| `src/sampleData.js` | 샘플 프로필 20명 (테스트 계정 test1~test20 / test1234, admin / admin1234) |
| `server.js` | HTTP 서버 + 라우팅 (외부 프레임워크 없음) |
| `public/` | 화면 (index.html, app.js, random.js, ai.js, chat.js, style.css). `chat.js`는 💬 대화 창, 카드에 `askButton(id)` + `registerChatTarget()`로 연결 |
| `pages/local-backend.js` | 깃허브 페이지용 브라우저 백엔드 |
| `scripts/build-pages.js` | `src/`·`public/`·`pages/` → `docs/` 생성 (Node 모듈을 브라우저 전역으로 감쌈) |
| `scripts/create-matching-bot.js` | `ollama/Modelfile` 생성 + `ollama create matching-bot` |
| `scripts/eval-ai.js` | AI 품질 평가 (거르기 정확도·점수 분포·지어낸 관심사·속도) |
| `test/` | `node --test` 테스트 (AI 테스트는 가짜 Ollama로 실행, 실제 모델 불필요) |

## 명령어
```bash
npm start            # 서버 버전 http://localhost:3000
npm test             # 전체 테스트
npm run build:pages  # docs/ 다시 생성
npm run create:bot   # Ollama 전용 모델 matching-bot 다시 만들기
npm run eval:ai      # AI 판단 품질 평가 (실제 Ollama 필요, 약 2분)
```

## 작업 규칙 (반드시)
1. `src/`·`public/`·`pages/`를 고쳤으면 **`npm run build:pages`로 `docs/`를 다시 만든 뒤 커밋**. `docs/`·`ollama/Modelfile`은 직접 수정 금지(자동 생성)
2. 커밋 전 **`npm test` 통과** 확인. 기능을 추가하면 테스트도 추가
3. `src/aiMatch.js`의 지시문·예시를 바꾸면 `npm run create:bot` 후 `npm run eval:ai`로 전후 비교, 결과를 사용자에게 숫자로 보고
4. `src/` 모듈은 Node와 브라우저 양쪽에서 돌아야 함: `require` 금지(외부 모듈 없이), `module.exports`만 사용, 전역 `crypto`/`fetch` 사용
5. `data/`(비밀번호 해시, 사용자 데이터)는 절대 커밋하지 않음 (`.gitignore` 유지)
6. 커밋 작성자는 이 저장소 로컬 설정(jeonghossi / noreply 주소) 그대로. 사용자 개인 이메일을 커밋에 넣지 않음
7. 서버 코드를 바꾼 뒤 확인할 때는 실행 중인 서버를 재시작해야 반영됨 (세션·랜덤 매칭 상태는 메모리라 재시작 시 초기화)

## AI 매칭 메모
- Ollama `http://localhost:11434`, 기본 모델 `matching-bot`(= `exaone3.5:2.4b` + 지시문/예시). 없으면 `exaone3.5:2.4b`에 지시문·예시를 매번 보내는 방식으로 자동 대체
- 작은 모델이 틀리는 숫자 비교는 `facts()`가 계산해서 [확인된 사실]로 전달. AI가 필수 조건을 놓치면 `guard`(`filterPair`)가 바로잡고 `corrected` 표시
- 평가 기록 (57회 판단): 지시 전 → 지어낸 관심사 14건, 85점 쏠림 8/13 / 지시·예시 후 → 0~5건, 점수 4~5종. 거르기 정확도 98~100%
- 다음 개선 후보: `exaone3.5:7.8b`(VRAM 6GB에 들어감) 비교 평가. 파인튜닝은 Python 환경이 없어 보류 중
- EXAONE은 비상업 라이선스 → 상업화하면 Qwen/Gemma 계열로 교체 필요
- 💬 AI에게 물어보기는 `matching-bot`(JSON 전용) 대신 `CHAT_MODEL`(= exaone3.5:2.4b)을 씀. 질문 속 "이 사람/그분/상대"는 `resolvePronouns`가 상대 이름으로 바꿈. 규칙은 정보 **뒤에** 둬야 작은 모델이 더 잘 따름. 알려진 한계: 가끔 사실을 틀림(예: 음주 습관이 다른데 비슷하다고 함), 목록 형식 선호
- 깃허브 페이지에서 AI를 쓰려면 사용자 PC에 `OLLAMA_ORIGINS=https://jeonghossi.github.io` 설정 필요 (아직 설정 안 함)

## 개발 환경 주의
- Windows. Bash 도구는 Git Bash, PowerShell도 있음. Python 없음
- Bash heredoc 안의 Node 코드에서 템플릿 문자열의 `\n`이 실제 줄바꿈으로 바뀌는 문제가 있었음 → 여러 줄 수정은 Edit/Write 도구 사용
- 노트북: RTX 3060 Laptop 6GB, RAM 15GB

## 사용자 선호
- 화면 문구는 **짧게, 이모지 태그 위주** (긴 문장은 지루해함). 자세한 내용은 접어 두기(details)
- 만든 뒤 보여 주고 → 사용자가 테스트 → 하나씩 수정하는 흐름
- 설명은 한국어, 쉬운 말로
