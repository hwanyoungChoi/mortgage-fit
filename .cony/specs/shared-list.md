# 함께 쓰는 목록 (카카오 계정 2개가 저장 목록 하나를 함께 편집)

> 작성 2026-10-25 · 상태: 초안(결정 D1~D3, 사용자 확인 U1~U7 대기)
> 관련: ADR-023(계정·공유) · 025(예산 `users.budget`) · 026(순서 `users.listing_order`) · 027(필드별 PATCH) · 스펙 `account-sync-share.md`

## 목표

부부처럼 함께 집을 보는 두 사람이 **저장 목록 하나**를 같이 쓴다. 한 사람이 매물·메모·상태·이름·추가 비용·순서·예산을 고치면 다른 사람 화면에도 같은 내용이 보인다. 함께 쓰기를 시작하지 않은 사람은 지금과 완전히 같다.

## 사용자 시나리오

1. (초대) 로그인한 A가 저장 목록 위 [함께 쓰기] → [초대 링크 만들기] → [공유하기]로 카카오톡에 링크(`/#/invite/{token}`)를 보낸다.
2. (로그인 전 B) B가 링크를 연다 → "함께 쓰는 목록 초대" → [카카오로 로그인하고 함께 쓰기] → 카카오 동의 → **초대 화면으로 돌아온다**(이 기기 로컬 매물은 기존 이전 흐름대로 B 계정으로 먼저 옮겨진다).
3. (수락) "수락하면 내 저장 목록(n개)이 초대한 사람의 목록과 합쳐집니다. 예산·순서는 초대한 사람 것을 함께 씁니다." → [함께 쓰기 시작] → 저장 목록(replace), "함께 쓰는 목록에 참여했습니다". 계정 줄에 "2명이 함께 쓰는 중 · [나가기]".
4. (함께 편집) A가 휴대폰에서 매매가·메모·상태를 고치거나 순서를 끌어 바꾼다 → B의 PC는 창으로 돌아오면(포커스) 바로, 창을 보고 있으면 30초 안에 같은 내용이 보인다.
5. (충돌) B가 보던 매물을 A가 지웠는데 B가 덮어쓰기 → "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다" + [새로 저장].
6. (나가기) B가 [나가기] → 확인창 "내가 추가한 매물은 내 목록에, 상대가 추가한 매물은 상대 목록에 남습니다" → 두 사람 모두 각자 목록으로 돌아간다.
7. (기존 공유) 매물 카드 [공유]·[목록 공유](값 복사)와 배포 전에 만든 `#/share/{token}` 링크는 지금과 똑같이 사본으로 동작한다.

## 참고한 사례

- **Monarch Money(가계부) "Household"**: 계정은 각자 로그인을 유지하고, 가구에 초대된 구성원은 같은 대시보드·같은 예산을 보며 모두 데이터를 볼 수 있다. 이미 다른 데이터가 있는 계정은 초대 불가 등 가구 단위로 묶는다. → **계정은 따로, 묶음(가구) 단위로 목록·예산·순서를 공유**하는 모양을 가져온다. 우리는 기존 데이터가 있는 B도 받아 "합치기"로 푼다. https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples · https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch
- **YNAB Together**: 그룹 관리자가 초대·제거, 구성원이 만든 예산은 소유자가 있고 이전·삭제할 수 있다. → 매물마다 "넣은 사람(`listings.user_id`)"을 그대로 두면 나가기 때 누구 것이 어디로 갈지 자연스럽게 정해진다. https://www.ynab.com/ynab-together
- **초대 만료 관례(Runn, Contentful)**: 조직 초대를 7일 뒤 만료. → 초대 7일, 1회용을 제안 기본값으로. https://help.runn.io/en/articles/6336116-expire-invitations-after-7-days-27-june-22 · https://www.contentful.com/developers/changelog/expiration-of-organization-invitations/
- **TanStack Query 폴링 가이드**: `refetchInterval`은 staleTime과 무관하게 주기 조회, `refetchIntervalInBackground` 기본 `false`라 숨은 탭에서는 멈춘다. 대시보드 예시가 30초. → 함께 쓰는 중일 때만 30초 폴링 + 기존 포커스 재조회. 소켓 불필요. https://tanstack.com/query/v5/docs/framework/react/guides/polling
- **우리 기존 공유(ADR-023)**: 토큰 base64url 22자, 비밀값은 SHA-256만 저장, 만료 행은 생성 요청 때 정리, 시트 [복사]/[공유하기]/[끊기]. → 초대도 같은 패턴. 초대 토큰은 목록 편집 권한을 주므로 `ownerKey`처럼 **해시만 저장**한다.

## 범위

- 포함: 초대 링크 만들기·끊기(로그인 필요) · 초대 화면 `#/invite/{token}`(로그인 전이면 로그인 후 복귀) · 수락(B 목록 합치기, 예산·순서 가구 단위) · 함께 쓰는 중 목록·예산·순서 읽기/쓰기를 가구 단위로 · 나가기 · 함께 쓰는 중 30초 폴링 · 배포 순서(원격 마이그레이션 먼저)
- 범위 밖: 3명 이상, 상대 이름 표시(닉네임 동의항목 없음), 누가 고쳤는지 표시·변경 알림, 실시간 푸시, 강퇴, 합치지 않고 따로 보관, 로그아웃 사용자의 함께 쓰기, 기존 복사 공유 링크의 동작 변경

## 데이터 모델

### `migrations/0005_households.sql` (추가만, 기존 행을 읽거나 고치지 않음 — D1 추천안 A 기준)

```sql
-- 함께 쓰는 목록(가구). 구성원이 있는 동안만 존재한다. 예산·순서는 구성원 공통 값.
CREATE TABLE households (
  id            TEXT PRIMARY KEY,               -- 16바이트 hex
  budget        INTEGER,                        -- users.budget과 같은 규칙, NULL = 없음
  listing_order TEXT,                           -- users.listing_order와 같은 규칙(JSON id 배열), NULL = 없음
  created_at    TEXT NOT NULL                   -- ISO 8601
);

-- NULL = 혼자 쓰는 중(기존 사용자 전부). 기존 행은 NULL이 되고 다른 컬럼은 그대로다.
ALTER TABLE users ADD COLUMN household_id TEXT REFERENCES households (id);
CREATE INDEX users_household_id ON users (household_id);

CREATE TABLE household_invites (
  token_hash  TEXT PRIMARY KEY,                 -- 토큰(16바이트 base64url 22자)의 SHA-256 hex
  inviter_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,                 -- unix 초
  expires_at  INTEGER NOT NULL,                 -- unix 초, created_at + 7일(U4)
  used_at     INTEGER                           -- NULL = 아직 안 씀. 1회용
);
CREATE INDEX household_invites_inviter_id ON household_invites (inviter_id);
```

- `listings`·`sessions`·`shares`는 손대지 않는다. 매물 행의 `user_id`는 계속 "넣은 사람"이다.
- `ALTER TABLE … ADD COLUMN … REFERENCES`(기본값 NULL)이 D1에서 통과하는지 be가 `--local`로 먼저 확인한다. 안 되면 `REFERENCES`를 빼고 일관성은 배치로 지킨다(행 영향 없음은 동일).
- **가구 범위(scope)**: 사용자 u의 구성원 집합 = `household_id`가 있으면 같은 `household_id`의 users, 없으면 `{u}`. 한 SQL 조각으로 둔다.
  `user_id IN (SELECT id FROM users WHERE id = ?1 OR (household_id IS NOT NULL AND household_id = (SELECT household_id FROM users WHERE id = ?1)))`
  혼자 쓰는 사용자는 이 집합이 `{u}`라 결과가 지금 `user_id = ?`와 같다.
- **불변식**: 한 가구 안에서 매물 id는 겹치지 않는다(수락 때 정리, import·POST가 지킴). 매물 상한 500은 **가구 합계**(U7, `isListingOrder`의 500개 한도와 맞음).
- 브라우저 저장소: 새 키 없음. 기존 키는 이름·형식·값 모두 그대로.

## API 계약

공통 규칙(JSON 오류 `{error,message}`, `no-store`, Origin 검사, 세션 쿠키, 본문 한도)은 `account-sync-share.md` 그대로. 새 오류 코드: `ownInvite`(400) · `alreadyInHousehold`(409) · `householdFull`(409) · `householdLimit`(409). 초대의 없음·끊김·사용됨·만료는 모두 404 `notFound`(클라이언트 화면 하나).

### 새 엔드포인트

| Method | Path                                    | 인증 | Request | Response                                                                                 | 에러                                                                                                             |
| ------ | --------------------------------------- | ---- | ------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/household/invites`                | 필수 | —       | 201 `{ token, url, expiresAt }`. 내 미사용 초대를 먼저 지우고(1인 1초대), 만료 초대 정리 | 401, 403(Origin), 409 `householdFull`(이미 2명)                                                                  |
| DELETE | `/api/household/invites`                | 필수 | —       | 204 내 미사용 초대 삭제(없어도 204)                                                      | 401, 403                                                                                                         |
| GET    | `/api/household/invites/{token}`        | 없음 | —       | 200 `{ expiresAt }`                                                                      | 404                                                                                                              |
| POST   | `/api/household/invites/{token}/accept` | 필수 | —       | 200 `{ household: { memberCount } }`                                                     | 400 `ownInvite`, 401, 403, 404, 409 `alreadyInHousehold` / `householdFull` / `householdLimit`(합치면 500개 초과) |
| POST   | `/api/household/leave`                  | 필수 | —       | 204                                                                                      | 401, 403, 404(가구 없음)                                                                                         |

- `url` = `{origin}/#/invite/{token}`. 토큰 모양은 `^[A-Za-z0-9_-]{22}$`, 어긋나면 DB 조회 없이 404.
- **수락은 D1 `batch()` 한 번(원자적)**. 순서: ① 초대 행을 `used_at IS NULL AND expires_at > now`일 때만 `used_at = now`로 표시(바뀐 행 0이면 404, 동시 수락 두 번 중 하나만 성공) ② 초대자가 가구가 없으면 `households` 생성: `budget = COALESCE(A.budget, B.budget)`, `listing_order = A 순서 ++ (B 순서 − A 순서)`(U2) ③ B 매물 중 A 매물과 id가 겹치는 행은 새 id로 바꾼다(`UPDATE listings SET id = lower(hex(randomblob(16))) WHERE user_id = B AND id IN (A의 id)`, 한 기기를 둘이 쓰다 양쪽 계정에 이전된 경우) ④ A·B `household_id` 설정. 검사(자기 초대, B가 이미 가구, 인원 2, 합계 500)는 배치 전에 하고 경합 시 뒤의 문장이 조건으로 막혀야 한다(be가 구현 방법 결정, 핵심은 "중간 상태가 남지 않음").
- **나가기**(U3): 배치 한 번. 남는 구성원이 1명 이하면 가구 해체 — 모든 구성원의 `users.budget`·`users.listing_order`에 가구 값을 복사 → `household_id = NULL` → 구성원의 미사용 초대 삭제 → `households` 행 삭제. 매물 행은 건드리지 않는다(각자 넣은 매물이 각자 목록이 됨). 인원 상한을 늘리면 나가는 사람만 빠지는 경로가 같은 코드로 된다.

### 바뀌는 엔드포인트 (혼자 쓰는 사용자는 응답이 바이트 단위로 같아야 함)

| Method           | Path                                              | 변경                                                                                                                    |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET              | `/api/me`                                         | `{ user: { id, household: { memberCount } \| null } }`. 로그아웃은 그대로 `{ user: null }`                              |
| GET              | `/api/auth/kakao/login?invite={token}`            | 토큰 모양이 맞을 때만 `mf_oauth_invite` 쿠키(state 쿠키와 같은 속성·600초) 추가. 틀리면 무시                            |
| GET              | `/api/auth/kakao/callback`                        | **성공**이고 초대 쿠키가 있으면 302 `/#/invite/{token}`(쿠키 삭제). 취소·실패는 지금처럼 `/#/listings?login=…`          |
| GET·POST         | `/api/listings`                                   | 조회는 가구 범위 합집합. POST 상한은 가구 합계 500. 새 행 `user_id` = 요청자                                            |
| PUT·PATCH·DELETE | `/api/listings/{id}`                              | `WHERE user_id = ?` → 가구 범위 + `id = ?`. 구성원 누구나 수정·삭제(A3). 기존 한 문장 UPDATE·메모/상태 보존 규칙 그대로 |
| POST             | `/api/listings/import`                            | 가구 범위 어디에든 있는 id는 건너뜀(`skipped`), 상한은 가구 합계                                                        |
| GET·PUT          | `/api/budget`, `/api/listing-order`               | 가구가 있으면 `households` 컬럼, 없으면 `users` 컬럼                                                                    |
| POST             | `/api/budget/import`, `/api/listing-order/import` | 같은 대상에 `COALESCE` 규칙 그대로                                                                                      |

공유(`/api/shares*`)는 변경 없음. 로그인 상태에서 공유받은 사본은 가구 목록에 들어간다(import 경유).

## 화면

- **저장 목록 `#/listings`**
  - 머리글 작은 버튼 줄에 [함께 쓰기]. `loggedOut`이면 시트에 "카카오로 로그인하면 함께 쓸 수 있어요 [카카오로 로그인]". `loggedIn`·혼자: [초대 링크 만들기] → 링크 + [복사]/[공유하기] + "7일 동안 한 번 쓸 수 있습니다. 받은 사람이 카카오로 로그인해 수락하면 같은 목록을 함께 씁니다." + [이 초대 끊기]. 이미 2명: "이미 2명이 함께 쓰고 있습니다". 기존 공유 시트(`ShareSheet`·`ShareLinkResult`)를 재사용한다(같은 container).
  - 계정 줄: 함께 쓰는 중이면 "카카오 계정에 저장 중 · 2명이 함께 쓰는 중 · [나가기]". [나가기]는 확인창(시나리오 6 문구) → 성공 시 목록·예산·순서·me 캐시 무효화.
  - 함께 쓰는 중일 때만 404 문구가 "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다"(혼자면 기존 문구 그대로). 계산 화면 덮어쓰기 404도 같다.
  - 폴링으로 목록이 바뀌어도 입력 중인 메모·이름 편집 문자열, 열린 시트, 스크롤, 드래그 중 상태를 잃지 않는다(기존 MemoEditor 규칙 확장). 드래그 중에는 순서 재조회 결과를 적용하지 않고 놓은 뒤 반영.
- **초대 `#/invite/{token}` (새 라우트, `{ name: "invite"; token }`, 토큰 대소문자 유지, 탭 선택 없음)** — container `src/containers/Mortgage/Invite/`
  - 로딩 → GET 초대. 404·모양 틀림: "만료되었거나 이미 쓴 초대입니다" + [계산기로 가기]. 네트워크·500: "불러오지 못했습니다 [다시 시도]".
  - `loggedOut`: 설명 + [카카오로 로그인하고 함께 쓰기](`/api/auth/kakao/login?invite={token}`).
  - `loading`(이전 중 포함): 버튼 비활성. `error`: 기존 계정 오류 안내.
  - `loggedIn`: 내가 만든 초대면(수락 400 `ownInvite`를 받기 전에 알 수 없으므로 응답으로 판단) "내가 만든 초대 링크입니다. 함께 쓸 사람에게 보내 주세요". 이미 함께 쓰는 중이면(`me.household`) "이미 함께 쓰는 목록이 있습니다. 나간 뒤 다시 열어 주세요". 그 외 시나리오 3 문구(n = 현재 내 목록 수) + [함께 쓰기 시작]. 누르는 동안 비활성, 성공 시 `#/listings` replace + 메모리 알림. 409 `householdFull`·`householdLimit`은 각각 "이미 2명이 함께 쓰고 있는 목록입니다"·"합치면 500개를 넘어 함께 쓸 수 없습니다".

## 동기화 규칙

- **충돌**: 기존 그대로 — 필드별 PATCH(메모·상태·이름), 계산 화면 PUT은 메모·상태 보존, 매물 단위 마지막 저장 우선. 순서는 배열 통째 PUT으로 마지막 저장 우선이고, 순서에 없는 매물은 맨 위 규칙(ADR-026) 덕분에 사라져 보이지 않는다. 예산도 마지막 저장 우선.
- **최신화**: 목록·예산·순서·me 쿼리는 지금처럼 `staleTime: 0` + 포커스 재조회. **`me.user.household !== null`일 때만** `refetchInterval: 30_000`(백그라운드 탭은 멈춤 기본값). 혼자 쓰는 사용자는 주기 요청이 없다.
- 상대가 나가 가구가 해체되면 서버가 바로 각자 범위로 응답한다. 클라이언트는 다음 me 재조회(포커스·30초)에 계정 줄을 갱신한다.
- 로그아웃·로그인·로컬 이전은 기존 그대로(이전된 매물은 가구 목록에 합쳐진다).

## 수용 기준

> 새 테스트는 쓰지 않는다(qa off). 바뀐 구조로 깨지는 기존 테스트는 파일 소유자가 고친다. `pnpm lint`·`format:check`·`test`·`build` 통과. 리드가 360×780 화면, `curl`(쓰기는 `-H 'Origin: https://loan.conychoi.dev'`), `pnpm wrangler d1 execute mortgage-fit --remote --json --command "…"`로 확인한다.

- [ ] **AC-0 (최우선, 기존 데이터·동작 그대로)**: (a) 원격 마이그레이션 직전·직후에 아래 4개 결과를 파일로 떠서 `diff`가 비어 있다(트래픽 적은 시간, 사이 시간 최소화): `SELECT (SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM sessions),(SELECT COUNT(*) FROM listings),(SELECT COUNT(*) FROM shares)` · `SELECT id,kakao_id,budget,listing_order,created_at FROM users ORDER BY id` · `SELECT user_id,id,data,created_at,updated_at FROM listings ORDER BY user_id,id` · `SELECT token,kind,expires_at FROM shares ORDER BY token`. 직후 `SELECT COUNT(*) FROM users WHERE household_id IS NOT NULL` = 0. (b) 혼자 쓰는 로그인 계정으로 배포 전·후 `GET /api/listings`·`/api/budget`·`/api/listing-order` 응답이 같다(`/api/me`는 `household:null`만 추가). (c) 배포 전 main 빌드로 매물·메모·예산·작성 중 입력을 넣은 비로그인 브라우저에서 새 빌드를 열면 그대로 보이고 localStorage 원문이 바뀌지 않는다. (d) 배포 전에 만든 `#/share/{token}`을 열어 [내 목록에 추가]하면 지금처럼 사본으로 들어간다. (e) 혼자 쓰는 사용자의 네트워크 탭에 30초 주기 요청이 없다.
- [ ] **AC-1 (초대 만들기·끊기)**: 로그인한 A가 [함께 쓰기] → [초대 링크 만들기] → `{origin}/#/invite/{22자}`. D1 `household_invites` 1행, `token_hash` ≠ 토큰, `expires_at − created_at = 604800`. 다시 만들면 앞 링크는 GET 404. [이 초대 끊기] 후 GET 404. 쿠키 없는 `POST /api/household/invites` → 401, Origin 다르면 403.
- [ ] **AC-2 (로그인 전 B의 수락 흐름)**: 로그아웃 상태 B 브라우저(로컬 매물 1개)에서 초대 링크 → [카카오로 로그인하고 함께 쓰기] → 로그인 후 주소가 `#/invite/{token}`, 로컬 1개가 B 계정으로 옮겨진 뒤 버튼이 활성 → [함께 쓰기 시작] → `#/listings`(뒤로 가기로 초대 화면에 안 돌아감) + "함께 쓰는 목록에 참여했습니다" + "2명이 함께 쓰는 중". D1: `households` 1행, A·B `household_id` 같음, 초대 `used_at` 채워짐. 같은 링크를 다시 열면 "만료되었거나 이미 쓴 초대입니다".
- [ ] **AC-3 (합치기·예산·순서)**: 서버에 A 3개(예산 9억, 순서 있음)·B 2개(예산 7억)일 때 수락 → 양쪽 모두 같은 5개, 예산 9억, 순서는 A의 3개 다음 B의 2개. A의 예산이 없으면 B 값. A와 B에 같은 id 매물이 있던 경우(한 기기에서 두 계정으로 이전) 수락 뒤 5개가 모두 보이고 React key 경고·중복 id가 없으며(`SELECT id, COUNT(*) FROM listings WHERE user_id IN (A,B) GROUP BY id HAVING COUNT(*)>1` 0행) 어떤 매물 내용도 사라지지 않는다.
- [ ] **AC-4 (함께 편집 반영)**: A·B 다른 기기. A가 저장·덮어쓰기(매매가·추가 비용)·메모·상태·이름·순서 끌기·예산·삭제를 각각 하면 B 화면에 창 포커스 즉시, 포커스 없이 보고만 있어도 30초 안에 같은 값이 보인다. B가 메모 입력 중일 때 재조회가 와도 입력 문자열이 유지된다. 반대 방향(B→A)도 같다.
- [ ] **AC-5 (충돌)**: A가 매물 X 메모를 쓰고(PATCH) B가 계산 화면에서 X 매매가를 덮어쓰면(PUT) 둘 다 남는다. A가 X를 지운 뒤 B가 X 덮어쓰기·메모·상태 변경 → "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다", 덮어쓰기는 입력 유지 + [새로 저장]. A가 새 매물 Y를 저장한 직후 B가 옛 순서로 끌어 PUT해도 Y가 목록에서 사라지지 않는다(맨 위).
- [ ] **AC-6 (수락 거부·경합)**: A가 자기 초대 수락 → 400 `ownInvite`, 화면 "내가 만든 초대 링크입니다". 이미 가구에 있는 C가 수락 → 409 `alreadyInHousehold`. A·B 가구의 A가 만든 새 초대(만들기부터 409 `householdFull`), `wrangler d1 execute`로 `expires_at`을 과거로 바꾼 초대 → 404 화면. 합계 500 초과 → 409 `householdLimit`. 같은 초대로 두 계정이 동시에 `curl` 수락 → 하나만 200, `households`·`household_id`에 중간 상태가 없다. 가구에 있는 상태에서 import·POST로 501번째 → 400(가구 합계).
- [ ] **AC-7 (나가기)**: B가 [나가기] → 확인 → B 목록에는 B가 넣은 매물만(함께 쓰는 동안 B가 넣은 것 포함), A는 포커스·30초 안에 A가 넣은 매물만 보이며 B가 A 매물에 쓴 메모·상태는 A 쪽에 남는다. 두 사람 예산·순서 = 나가기 직전 가구 값. D1: `households` 0행, A·B `household_id` NULL, 두 사람의 미사용 초대 0행, `listings` 행 수는 나가기 전과 같다.
- [ ] **AC-8 (배포 순서)**: 원격 마이그레이션 적용 후 Worker 배포 전(옛 Worker + 새 스키마)에 `GET /api/me`·`/api/listings`·`/api/budget`·`/api/listing-order`와 매물 저장·삭제가 정상(200/201/204). 그 뒤 PR 머지·배포. 실기: 카카오톡 인앱 브라우저에서 초대 링크를 열어 AC-2 흐름이 끝까지 된다.

## 태스크

### 파일 소유 (be·fe 병렬, 겹치지 않게)

- **be**: `migrations/0005_households.sql`, `server/household/*`(새: 초대·수락·나가기 핸들러, 가구 범위 SQL 조각), `server/listings/*`, `server/budget/*`, `server/listingOrder/*`, `server/auth/handleKakaoAuth.ts`·`handleAccount.ts`, `worker/index.ts`, 계약 타입 `src/lib/types/household.ts`(새)·`src/lib/types/account.ts`(`MeResponse`)·`src/lib/types/api.ts`(새 오류 코드).
- **fe**: 그 밖의 `src/` — `src/lib/types/route.ts`·`parseRoute`·`useHashRoute`, `src/hooks/*`(me·목록·예산·순서 쿼리의 폴링 옵션, 404 사유 문구), `src/containers/Mortgage/Listings/*`(함께 쓰기 시트·계정 줄·나가기, 훅은 `Listings/hooks/`), `src/containers/Mortgage/Invite/*`(새, 훅은 `Invite/hooks/`), `src/containers/Mortgage/Calculator/*`(404 문구), `src/AppRoutes*`.

### 목록

- [x] 1. 서버: 가구 모델 + 초대·수락·나가기 + 기존 엔드포인트 가구 범위화 (be)
  - [ ] 1-1. 계약 타입 3파일 먼저 커밋(`household.ts`, `MeResponse.user.household`, 새 오류 코드). **fe는 이 커밋 뒤 시작.**
  - [ ] 1-2. `0005_households.sql` 작성, `--local` 적용 후 AC-0(a) 쿼리로 로컬 전후 비교.
  - [ ] 1-3. 가구 범위 SQL 조각으로 listings(조회·POST 상한·PUT·PATCH·DELETE·import), budget·listing-order(+import) 전환. 혼자 쓰는 사용자 응답 동일.
  - [ ] 1-4. 초대 생성·끊기·조회·수락(배치)·나가기(배치), `/api/me` household, 로그인 `?invite=` 쿠키 → 콜백 복귀. `worker/index.ts` 경로 추가.
  - [ ] 1-5. 깨지는 기존 `server/**` 테스트 수정.
- [x] 2. 클라이언트: 초대 화면 + 함께 쓰기 시트 + 계정 줄·나가기 + 폴링 (fe)
  - [ ] 2-1. 라우트 `{ name: "invite"; token }`(파싱·정규화·탭 선택 없음), `Invite` container와 훅(`useHouseholdInvite` GET, `useAcceptHouseholdInvite`).
  - [ ] 2-2. Listings: [함께 쓰기] 시트(`useCreateHouseholdInvite`·`useRevokeHouseholdInvite`, 기존 공유 시트 재사용), 계정 줄 "2명이 함께 쓰는 중 · [나가기]"(`useLeaveHousehold`), 성공 시 관련 queryKey 무효화.
  - [ ] 2-3. me·목록·예산·순서 쿼리에 함께 쓰는 중일 때만 30초 폴링, 드래그 중 순서 반영 보류, 404 사유 문구를 함께 쓰는 중일 때만 교체(Listings·Calculator). 깨지는 기존 테스트 수정.
- [x] 3. 배포·검증 (리드)
  - [ ] 3-1. `pnpm wrangler d1 time-travel info mortgage-fit`로 복원 지점 기록(명령은 be가 Cloudflare 문서로 확인해 PR 설명에 적음).
  - [ ] 3-2. AC-0(a) "직전" 덤프 → `pnpm wrangler d1 migrations apply mortgage-fit --remote` → "직후" 덤프·`diff` → AC-8 옛 Worker 확인.
  - [ ] 3-3. **그 다음에** PR 생성(이 프로젝트는 Auto-fix + CI 통과 시 자동 머지라 PR을 열면 곧 배포된다 — 마이그레이션 전에 PR을 열지 않는다). 배포 후 AC-0(b)~(e), AC-1~7, 실기 확인.

의존 관계: 1-1 → (1-2~1-5 ∥ 2-1~2-3) → 3. fe는 로컬 `wrangler dev` + `--local` 마이그레이션으로 be 브랜치와 합쳐 확인한다.

## 다음 단계 후보

- 3명 이상 가구(상수 `HOUSEHOLD_MAX_MEMBERS`만 올리고 나가기는 "나가는 사람만 빠짐" 경로)
- 상대 이름 표시(카카오 닉네임 동의항목 추가) · 매물 카드에 "넣은 사람/마지막으로 고친 사람"
- 상대 변경 알림("A가 매물 2개를 고쳤습니다") · Durable Objects WebSocket 실시간 반영
- 수락 시 "합치지 않고 내 목록 따로 보관" 선택 · 나가기 시 "전체 사본 가져가기" 선택
- 초대 여러 개·보낸 초대 목록 · 구성원 내보내기
- 순서 충돌이 잦으면 ADR-026 B(fractional index)

## 가정

- A1: 상대가 누구인지 표시하지 않는다("2명이 함께 쓰는 중"만). 카카오 회원번호 외 정보를 받지 않는 기존 결정(ADR-023) 유지.
- A2: 구성원은 동등하다 — 누구나 초대·수정·삭제·나가기. 관리자·강퇴 없음(2명이면 나가기 = 해체).
- A3: 로그인 취소·실패는 초대 쿠키가 있어도 기존처럼 `#/listings?login=…`로 간다(B는 카카오톡에서 링크를 다시 연다).
- A4: 함께 쓰는 중 로그아웃·로컬 이전·공유받기는 기존 흐름 그대로이고, 서버에 들어가는 매물은 가구 목록에 합쳐진다.
- A5: 함께 쓰기는 로그인 사용자만. 로그아웃 상태 로컬 목록은 계속 이 기기 전용.
- A6: 30초 폴링 비용(함께 쓰는 탭당 요청 4개/30초, 숨은 탭 0)은 D1·Workers 무료 한도에서 문제없다고 본다.

## 결정 필요

- **D1 데이터 모델** — 추천: **A**
  |                                                                                                                                                                                                                | A `households` + `users.household_id`, 목록 = 구성원 매물 합집합 | B 모든 사용자에 개인 space 생성, `listings.space_id`로 이전                                                                                                             | C 수락 시 B 매물을 A `user_id`로 옮김(소유 이전)                      |
  | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
  | 마이그레이션 위험                                                                                                                                                                                              | 테이블·NULL 컬럼 추가만, 기존 행 무변경                          | 전 사용자 space 생성 + 전 매물 backfill. PK `(user_id,id)` 변경은 테이블 재생성 필요. 마이그레이션~배포 사이 옛 Worker가 만든 사용자는 space 없음 → 지연 생성 보정 필요 | 마이그레이션은 A와 같으나 수락 때 B 행의 `user_id`를 바꿔 의미가 바뀜 |
  | 혼자 쓰는 사용자                                                                                                                                                                                               | 결과가 지금과 동일                                               | 모든 쿼리 경로가 바뀜                                                                                                                                                   | 동일                                                                  |
  | 나가기                                                                                                                                                                                                         | 각자 넣은 매물(`user_id`)이 각자에게. 행 이동 없음               | space 분리 시 어느 매물이 누구 것인지 별도 컬럼 필요                                                                                                                    | 원 소유 정보가 없어져 `created_by` 컬럼을 또 추가해야 함              |
  | 예산·순서                                                                                                                                                                                                      | `households` 컬럼, 해체 때 users로 복사                          | space 컬럼(깔끔)                                                                                                                                                        | A와 같음                                                              |
  | 권한                                                                                                                                                                                                           | 구성원 범위 SQL 한 조각                                          | space_id 한 조건(가장 단순)                                                                                                                                             | A의 `user_id`로 통일되나 B가 쓰기 권한을 얻으려면 결국 범위 필요      |
  | 이유: AC-0(기존 행 무변경, 혼자 쓰는 경로 결과 동일)을 가장 확실히 지키고, 나가기 처리가 자연스럽다. 비용은 쿼리마다 범위 조각이 붙는 것. 뒤집을 조건: 3명 이상·여러 목록(사용자당 여러 space)이 필요해지면 B. |
- **D2 다른 사람 변경 반영 방식** — A 포커스 재조회 + 함께 쓰는 중일 때만 30초 폴링 / B Durable Objects + WebSocket 푸시 / C 포커스 재조회만 — 추천: **A**. 사용자가 "포커스·새로고침 수준이면 충분"이라 했고, 둘이 같은 시각에 화면을 보며 통화하는 경우만 C로 부족하다. B는 새 인프라(DO 바인딩·연결 관리)라 이번 요구에 과하다.
- **D3 로그인 후 초대 화면 복귀** — A 서버: `/api/auth/kakao/login?invite=` → HttpOnly 쿠키 → 콜백이 `/#/invite/{token}`으로 302 / B 클라이언트: 로그인 전 `sessionStorage`에 토큰 저장 → 로그인 후 앱이 꺼내 이동 — 추천: **A**. 콜백 한 곳에서 끝나 화면 깜빡임(목록 먼저 보였다가 이동)이 없고, 모양 검사한 토큰만 받아 열린 리다이렉트가 없다. B는 카카오톡 인앱→외부 앱 전환 때 저장소가 이어지는지 확인되지 않았다.

## 사용자 확인 필요

제품 기본값이다. 답이 오기 전에는 제안 기본값으로 구현한다(모두 상수·문구 수준이라 나중에 바꿔도 데이터가 깨지지 않는다. 단 U3은 이미 나간 가구에 소급되지 않는다).

- U1 (수락 시 B 기존 목록): **합치기**(B 매물이 함께 쓰는 목록에 그대로 들어감). 대안: B 목록은 숨겨 보관하다 나가면 복귀.
- U2 (예산·순서): **가구 하나로 공유**. 합칠 때 예산은 초대한 사람 값(없으면 B 값), 순서는 초대한 사람 순서 뒤에 B 순서.
- U3 (나가기 시 매물): **각자 넣은 매물만 각자에게**(상대가 넣은 매물은 상대에게 남음, 서로 쓴 메모·상태는 매물을 따라감). 예산·순서는 둘 다 직전 공유 값. 대안: 나가는 사람도 전체 사본을 가져감.
- U4 (초대): **7일 만료, 1회용, 새로 만들면 이전 초대 끊김**.
- U5 (인원): **2명**.
- U6 (기존 공유 버튼): 매물 [공유]·[목록 공유](값 복사)를 **그대로 두고** [함께 쓰기]를 따로 둔다. 대안: [목록 공유]를 [함께 쓰기]로 대체.
- U7 (상한): 함께 쓰는 목록 **합계 500개**(지금 계정 상한과 같음). 합치면 넘는 경우 수락을 막고 안내.

## 검토 반영 (ADR-028)

D1~D3 모두 A로 결정([ADR-028](../decisions/028-shared-list.md)). be 검토 조건 1~6을 구현 필수로 한다(수락 batch 가드 `accepted_by`, 가구 import·POST 단일 문장 상한, 순서 병합은 실제 id만 500 이하, 초대 쿠키 정리 규칙, 수락·나가기 고지 문구, 초대 생성 batch와 유니크 인덱스). 혼자 쓰는 사용자 응답은 `ORDER BY user_id, id`로 배포 전후 같게, 주기 요청 0건. 수락 성공 시 fe는 편집 중인 매물(editingId)을 해제한다. 계정별 import 기록 때문에 가구에서 지운 매물이 다른 기기의 로컬 이전으로 되살아날 수 있음은 알려진 한계로 둔다.
