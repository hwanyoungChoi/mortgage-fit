# hub-account 스펙 — be 검토

2026-10-27 · 대상: `.cony/specs/hub-account.md` · 코드는 읽기만 함(수정 없음)

## 판정

- **D1(로그인 복귀 주소): 찬성 (A)**
- **태스크 1-1: 조건부 찬성** (조건 4개, 아래)
- D2·D3: 서버와 무관(클라이언트 파일 위치). be 의견 없음, 스펙 추천(A·A)에 이의 없음.
- 추가 확인: D1 외 be가 걸리는 결정 항목은 없다. U1~U9는 모두 화면 문구·배치라 be 영향 없음.

## 근거 (확인한 사실)

1. **바뀌는 곳이 한 모듈, 리다이렉트 값뿐이다.** `server/auth/handleKakaoAuth.ts`에서 `listingsUrl`(37-38행)이 호출되는 곳은 `startKakaoLogin` notConfigured(58행), `finishKakaoLogin`의 `fail`(107행), 성공 기본값(130행) 셋이다. 스펙 API 표의 5행이 이 호출 지점과 정확히 대응한다. `worker/index.ts`(72-77행)는 `startKakaoLogin`·`finishKakaoLogin`을 이름 그대로 부르므로 바꿀 필요가 없다. 따라서 AC-0(c)의 "migrations·worker·wrangler.jsonc diff 빈 출력"은 지킬 수 있다. 쿠키 속성·세션 생성(`createSession`)·사용자 upsert(`findOrCreateUserId`)는 `Location` 계산과 독립이라 데이터 보존에 영향이 없다.
2. **배포 순서 주장이 맞다.** `wrangler.jsonc`가 `main: worker/index.ts`와 `assets`를 한 Worker로 배포하고 `run_worker_first: ["/api/*"]`다. 카카오 로그인은 페이지 전체 이동이라 콜백 302 뒤 새 번들이 열린다. 서비스 워커 없음(`public/`은 favicon뿐, `src`·`index.html`에 `serviceWorker` 없음). 옛 번들이 `#/?login=…`을 받는 경우의 동작도 확인했다. `src/lib/utils/parseRoute.ts` 21행 주석과 41행대로 홈은 쿼리를 버리고 `{ name: "hub" }`로 간다(안내 한 줄만 빠짐). 롤백도 값 한 줄 되돌리기라 데이터 마이그레이션이 없다.
3. **초대 로그인 흐름은 안 깨진다.** 성공 + 초대 쿠키 분기(129-130행)는 `isInviteToken(invite) ? inviteUrl : 기본값`이라 기본값만 바뀐다. 초대 쿠키는 `Path=/api/auth/kakao`, `SameSite=Lax`, 600초이고 콜백이 항상 지운다(131행 `clearInviteCookie`). 세션 쿠키는 `Path=/`로 그대로 심긴다. 쿠키 코드는 한 줄도 안 바뀐다.
4. **서버 테스트는 쓸 수 있다.** `finishKakaoLogin(request, env, db, { fetch, now })`는 의존성 주입 구조라 가짜 `fetch`를 넣을 수 있다(`worker/index.ts`가 실제 `fetch`를 넘기는 쪽은 라우터 경유로는 못 가짜로 바꾸므로 핸들러를 직접 부른다). 현재 `server/`에 카카오 테스트는 없다(`grep`으로 확인: `harness.ts`의 `kakao_id` 시드뿐). 테스트 환경은 두 가지다.
   - `startKakaoLogin`, 그리고 DB 앞에서 끝나는 `finishKakaoLogin` 경로(state 불일치, `access_denied`, code 없음, 키 없음, 토큰/사용자 API 실패)는 DB를 안 건드린다(125행 이전에 반환). 그래서 node 환경 일반 `*.test.ts`(`app` 프로젝트)로 가능하다.
   - 성공 경로(125-131행)는 D1이 필요하다. `*.d1.test.ts`(`vitest.d1.config.ts`, workerd)로 쓰고 `env.DB`를 넘긴다. `pnpm test`가 두 프로젝트를 모두 돌리므로(`vite.config.ts` `projects`) CI에 그대로 걸린다.

## 조건 (1-1)

1. **테스트 먼저, 현재 값으로.** 지금 서버 테스트가 없으니 `Location`을 바꾸기 전에 현재 동작(`#/listings…`)으로 특성 테스트를 만들어 통과시킨 뒤, `Location`과 기대값만 바꾼다. 그래야 "`Set-Cookie` 목록은 지금과 같다"(AC-2)가 비교가 된다. 쿠키는 이름·속성·`Max-Age`를 정확히 단언한다(느슨한 `toContain` 금지).
2. **AC-2(be) 경우 목록 보강.** 스펙의 6가지(키 없음, 성공, 초대 성공, state 불일치, `access_denied`, code 없음, 토큰 실패)에 더해 아래를 넣는다.
   - state 불일치와 `error=access_denied`가 같이 오면 `failed`다(state를 먼저 보는 순서, 109-114행).
   - 초대 쿠키 값이 모양이 틀린 성공이면 `#/`이다(`isInviteToken` 재검증, 129행). 클라이언트 값이라 재검증이 의도다.
   - 콜백에서 시크릿이 비어 있으면(122-123행) `failed`다.
   - 어느 실패 경로든 `Set-Cookie`는 state 쿠키 삭제 + 초대 쿠키 삭제 둘이고 세션 쿠키가 없다. 성공은 세션 쿠키 포함 셋이고, `sessions`·`users` 행이 생긴다(D1 테스트).
   - 실패 경로는 `console.error`를 부른다(118행, `kakaoApi.ts`의 `logFailure`). 스파이로 막고, 토큰·코드가 로그 인자에 없음을 단언하면 더 좋다.
3. **정리할 주석·이름.** `listingsUrl` 삭제와 함께 20행 주석("저장 목록 화면이 `?login=`으로 받아…")을 홈으로 고친다. 36행·94-95행 주석("저장 목록으로")도 같이 고친다. 새 함수 이름은 `homeUrl` 정도로 하고 옛 이름·옛 경로를 남기지 않는다(CLAUDE.md의 삭제 원칙과 일치).
4. **1-1 단독 배포 금지, 1-2와 같은 PR/배포.** 스펙 의존 관계에 "1-1 ∥ 1-2"만 있고 단독 배포 가능 여부가 없다. 1-1만 배포하면 로그인은 홈으로 돌아오지만, 홈이 `login`을 안 받아(위 사실 2) 취소·실패 안내가 사라진다. 반대로 1-2만 배포하면 서버가 아직 `#/listings`로 보낸다. 같은 Worker 배포라 한 PR이면 순서 문제가 없다. 스펙에 "1-1·1-2는 한 PR"이라고 못박기를 권한다.

## 리스크·모호함

- **스펙 문장이 부정확하다(수정 권고).** "범위 밖: 초대로 시작한 로그인은 지금처럼 초대 화면으로 돌아온다"(39행), A3. 실제로는 **성공일 때만** 초대 화면이다. 초대로 시작한 로그인이 취소·실패하면 지금도 저장 목록(`#/listings?login=`)으로 갔고(107행, 초대 쿠키는 지움), 바뀐 뒤에는 홈(`#/?login=`)으로 간다. 동작의 종류는 같지만 도착지가 바뀐다. API 표에 "초대로 시작 + 취소/실패 → `#/?login=…`(초대 토큰은 버려짐)" 행을 한 줄 더 적는다. 초대 화면으로 돌려보내려면 서버 변경이 커지므로 지금은 그대로 두는 것에 동의한다.
- **로그인 뒤 이전(import) 완료 알림이 안 보일 수 있다(fe/pm 확인 사항, be 영향 없음).** 이전 훅은 `AppRoutes.tsx` 104-120행에서 화면 위에 있어 홈에 도착해도 계속 실행된다(데이터 이전 자체는 안전, 사실). 그러나 완료 알림 `listingsNotice`·`homeNotice`는 저장 목록·우리 집에만 보인다(U5). 로그인 후 홈에 도착한 사용자는 "이 기기의 매물 N개를 계정으로 옮겼습니다"를 놓칠 수 있다. 스펙 "다음 단계 후보"에 이미 있다. 사용자 영향이 있으니 우선순위를 pm이 정하길 권한다.
- **`?login=` 쿼리가 해시 안에 있다.** 서버는 `Location`에 프래그먼트를 넣는 것까지만 책임진다(지금도 `#/listings?login=…`로 같다). 카카오톡 인앱 브라우저에서 프래그먼트가 유지되는지는 서버 테스트로 못 본다. 스펙의 리드 수동 확인(배포 뒤 카카오톡 인앱 포함)이 필요하고, 이건 추론이 아니라 지금 확인 못 한 항목이다.
- **AC-0(c) "server/는 `handleKakaoAuth.ts`와 새 테스트만"**: 새 테스트가 `server/test/harness.ts`에 도우미를 추가하면 위반이다. 필요한 도우미(가짜 `fetch`, 쿠키 파싱)는 테스트 파일 안에 둔다.
- **로그아웃 쪽 서버 변경은 없다.** `POST /api/auth/logout`은 204 + 세션 쿠키 만료 그대로고(`handleAccount.ts`), 홈이 새로 부르는 초대·나가기 API도 기존 계약 그대로라 별도 서버 검토 사항이 없다.

## 보안

변경 없음. 열린 리다이렉트가 아니다. `Location`은 `url.origin`(요청 출처)과 고정 경로, 검증된 초대 토큰(`isInviteToken`)만 조합한다. 외부 입력이 경로에 들어가는 곳은 초대 토큰뿐이고 모양 검증(정규식)을 거친다.
