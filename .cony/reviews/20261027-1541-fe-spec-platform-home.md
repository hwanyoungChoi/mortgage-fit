# platform-home 스펙 — fe 검토

2026-10-27 · 스펙 `.cony/specs/platform-home.md` · 코드는 고치지 않음

## 판정: 조건부 찬성

D1 A 찬성(조건 1) · D2 A 찬성 · D3 A 찬성 · D4 A 조건부 찬성 · D5 B 조건부 찬성 · AC-0은 구조로 대부분 지켜지지만 AC 문구를 고쳐야 한다. 반대는 없다. 아래 "스펙에 넣을 조건"을 반영하면 1-1을 시작해도 된다.

확인한 사실은 파일·줄을 적었고, 실행해 보지 않은 추론은 "추론"이라고 표시했다.

## 근거

### 1. 구조가 스펙의 전제와 맞는다 (확인한 사실)

- `--tab-nav-height`를 쓰는 곳은 `src/index.css`(토큰·`scroll-padding-top`)와 `TabNav.module.css`뿐이다. 지워도 다른 화면 CSS가 깨지지 않는다.
- 고정·sticky 요소는 `TabNav`(sticky top), `SummaryBar`(fixed bottom), `noticeRegion`(fixed, z 10), `Sheet` 배경(z 10), `MemoEditor`(`<dialog>`, top layer), `ScreenshotSheet` 안 sticky뿐이다. 화면 아래쪽 크롬을 새로 만들어도 부딪치는 것은 `SummaryBar`·`noticeRegion` 둘이고, 스펙이 둘 다 다룬다. 시트(z 10)는 탭(z 5)을 덮고, `MemoEditor`는 top layer라 탭 위에 뜬다.
- `index.html`에 `viewport-fit=cover`가 이미 있어 `env(safe-area-inset-bottom)`이 동작한다.
- `src/index.css`의 인쇄 허용 목록(`body:has([data-print-area]) :not(...)`)은 영역도 조상도 아닌 요소를 숨긴다. 머리 줄과 탭 줄이 `data-print-area`의 조상이 아니면 표 보기 인쇄에서는 저절로 숨는다. 표 보기가 아닌 화면은 이 규칙이 없으므로 스펙대로 `@media print { display: none }`가 따로 필요하다.
- `src/hooks/`에는 이미 `useInteriorPlanList`·`useListingList`·`useInteriorPlanImport`·`useListingSource`가 있다. 계획 목록 조회가 전역에 있는 것은 새 패턴이 아니다.

### 2. D5 B는 실제 파일로 가능하다

`src/containers/Mortgage/Home/hooks/useInteriorPlanSource.ts`를 읽었다. 읽기와 쓰기가 한 훅에 섞여 있지만 나누는 선이 분명하다.

- 읽기 쪽으로 옮길 것: `useMe`·`selectAccountSourceStatus`·`household`·`useInteriorPlanList`·`useEndSession`·`isSessionExpired` 상태·`expireSession`·`storage` 이벤트 effect·`localSnapshot`·`selectList`·`isRefreshFailed`·`retry`·`isRetrying`.
- 쓰기 쪽에 남길 것: 훅 6개·`readLatestPlans`·`writeServer`·`writeBySource`·각 쓰기 함수. 쓰기는 읽기 쪽의 `status`·`household`·`expireSession`을 받아 쓴다.
- 새 훅 이름 제안: `src/hooks/useInteriorPlanListSource.ts`가 `{ status, household, list, isRefreshFailed, isSessionExpired, expireSession, retry, isRetrying }`를 돌려준다. `Home/hooks/useInteriorPlanSource`는 이것을 부르고 쓰기를 얹어 지금과 같은 `InteriorPlanSource`를 돌려준다. 그러면 `useInteriorPlanSource.test.tsx`와 `MortgageHome` 테스트가 시그니처 변화 없이 회귀 확인이 된다.
- 주의: `isSessionExpired` 상태는 읽기 쪽이 가지고 있어야 한다. 쓰기의 401 처리가 `expireSession`을 부르기 때문이다.

### 3. AC-0은 쓰기 경로가 없는 구조다 (추론 포함)

- 홈이 새로 만드는 저장소 접근은 없다. 스토어는 `AppRoutes`가 이미 만든 것을 props로 받는다. `planImport`·`accountImport`도 지금 `AppRoutes` 최상위에서 라우트와 상관없이 돌고 있어 홈이 새로 일으키는 쓰기가 아니다.
- 다만 스펙의 "홈이 쓰기 함수를 손에 쥐지 않으므로 AC-0이 구조로 보장된다"는 계획에만 맞다. 매물은 `useListingSource`를 그대로 쓰므로 `add`·`remove` 등 쓰기 함수와 `session-hint` mark/clear effect(`useListingSource.ts`)가 홈에도 딸려 온다. 이 효과가 로그아웃 확인 때 `removeItem(session-hint)`를 부르는 것은 기존 예외다. 매물 쪽은 "홈 컴포넌트가 쓰기를 부르지 않는다 + 스파이 테스트"로 지키는 것이고, 구조 보장은 아니다. 문구를 고치면 된다.

## D별 판정

### D1 경로 구조: 찬성(A)

- 이유: `parseRoute`·`toRoutePath`·`PATHS`가 한 곳(`src/lib/utils/parseRoute.ts`, `src/lib/constants/paths.ts`)이라 바꾸는 범위가 작다. 기존 `PATHS.calculator` 사용처는 8곳(`TabNav`, `MortgageListings`, `ListingCard` 2곳, `MortgageInvite` 2곳, `MortgageShare` 3곳)이고 값 하나만 바꾸면 따라간다. 단 공유·초대의 "취소" 두 곳(`MortgageShare.tsx:232`, `MortgageInvite.tsx:286`)은 같은 상수를 쓰므로 `PATHS.hub`로 직접 바꿔야 한다. 자동으로 바뀌지 않는다.
- 비용: 매일 계산기를 쓰는 사람은 앱을 열 때마다 탭 한 번이 늘어난다. 스펙이 알고 감수한다고 적었고, 대안 B·C는 첫 화면이 입구에 따라 달라지는 문제가 더 크다. 동의한다. 마지막 탭 기억은 새 localStorage 키가 필요하므로 지금은 범위 밖이 맞다.
- 조건: 스펙 "경로와 기존 링크" 표에 "계산까지 한 번 더 누른다"를 이미 적었다. 출시 뒤 이 비용에 대한 반응을 보는 기준을 다음 단계 후보에 한 줄 더하길 권한다(예: 마지막 탭 기억).

### D2 이름: 찬성(A)

- 이유: `Route.home`·`PATHS.home`·`containers/Mortgage/Home`·`HomeView`·`HomePathParams`와 테스트 5개 파일(`MortgageHome.*.test.tsx`)이 모두 "우리 집"이다. B는 이것을 전부 바꾸고 경로와 라우트 이름이 어긋난다.
- 리스크: 화면 라벨 "홈"이 코드 `hub`, 라벨 "우리 집"이 코드 `home`이라 읽는 사람이 한 번 헷갈린다. `Route`의 `hub` 주석과 `TABS`의 `home` 항목에 "라벨은 우리 집" 주석을 둔다. 새 코드에서 `PATHS.home`을 홈으로 오인하는 실수는 리뷰에서 걸러야 한다.

### D3 [가가] 자리: 찬성(A)

- 이유: 고정 상단 크롬은 `TabNav` sticky 48px 하나뿐이었고, 그것을 빼고 머리 줄을 스크롤과 함께 올리면 고정 크롬은 아래쪽(탭 56 + 계산 화면 요약 72 = 128px)만 남는다. 지금 상단 48 + 요약 72 = 120px와 8px 차이다.
- 비용: 글자 크기를 바꾸려면 맨 위로 올라가야 한다. 글자 크기는 거의 안 바꾸는 설정이라 받아들일 수 있다.
- 확인: `TextSizeSheet`가 `useOpenSheet`의 `returnFocusRef`로 포커스를 복귀하는 방식은 `TabNav`에서 머리 줄로 옮겨도 그대로다. [가가] 버튼은 머리 줄 안에서 `inert` 래퍼 아래에 있고, `close`가 `flushSync`로 inert를 먼저 푼 뒤 포커스한다.
- 머리 줄 높이 토큰이 없어진다(`--tab-nav-height` 삭제). 머리 줄 높이는 [가가]의 누르는 자리(44px 이상)에서 정하고, 새 토큰이든 머리 줄 CSS 안의 값이든 한 곳에만 둔다.

### D4 lucide-react: 조건부 찬성(A)

- 확인한 사실: `pnpm`에 `lucide-react`는 없다(`package.json`). `npm view`로 1.62.0, ISC, `sideEffects: false`, peer `react ^16.5.1 || ... || ^19.0.0`을 확인했다. tarball을 받아 `dist/esm/icons`를 봤다: `house`·`calculator`·`bookmark`·`paint-roller` 아이콘 파일이 있고 각 0.6~1.0KB다. `Icon.mjs`는 자식·접근성 prop(`aria-label` 등)이 없으면 `aria-hidden="true"`를 자동으로 붙인다. 그래서 AC-2의 "아이콘 svg는 `aria-hidden`"은 아이콘에 prop을 따로 주지 않아도 성립한다(tarball 소스로 확인, 앱에서 실행해 보지는 않음).
- 번들: 지금 `dist/assets/index-*.js`가 537KB다(스펙이 말한 500KB 경고 상태). 아이콘 4개 + `Icon`·`createLucideIcon`은 합쳐 몇 KB 수준이라 의미 있는 증가가 아니다(추론).
- 조건 1: 가져오기 형태를 정해 둔다. `import { House } from "lucide-react"`는 배럴이라 vitest의 jsdom 테스트가 아이콘 수천 개 모듈을 읽을 수 있다(추론, 속도는 재 보지 않았다). `package.json` exports에 `./icons/*`가 있어 `import House from "lucide-react/icons/house"`로 깊은 경로 import가 된다. 어느 쪽이든 1-1에서 `pnpm test` 시간을 한 번 재서 눈에 띄게 늘면 깊은 경로로 바꾼다고 스펙에 적는다.
- 조건 2: 의존성 추가는 CLAUDE.md의 "새 라이브러리는 혼자 확정하지 않는다"에 해당하므로 결정 후 `.cony/decisions/`에 기록한다.
- 선택된 탭의 아이콘이 "채운 모양"이라는 Material 관례는 lucide에 채운 변형이 없어 따를 수 없다. 스펙이 이미 알약 배경 + 굵은 라벨로 대신한다고 적었으므로 문제 없다.

### D5 B: 조건부 찬성

위 근거 2의 분리선을 스펙에 적는다. A는 쓰기 훅 6개를 전역으로 올려야 하고, C는 모든 화면 위에서 계획 조회가 돌아 `/api/interior-plans` 폴링이 우리 집 밖에서도 생긴다. B가 맞다.

## 화면 흐름·사용성·레이아웃에서 걸리는 것

### 스펙을 바꿔야 하는 것

1. **AC-4의 `banner` 단언이 모호하다.** 기존 화면 안에 `<header>`가 있다: `MortgageListings.tsx:499`, `PlanScreen.tsx:76`, `MortgageShare.tsx:177`, `MortgageInvite.tsx:267`. 스펙 구조에서 이것들은 `<main>` 안에 들어가 ARIA상 banner가 아니지만, dom-testing-library는 조상을 따지지 않고 모든 `<header>`를 `banner`로 센다. node에서 `<header>`(최상위)와 `<main><header>`를 JSDOM에 넣고 `getAllByRole("banner")`를 실행해 두 개가 모두 잡히는 것을 확인했다. 그래서 "banner 안의 `button 글자 크기`가 정확히 하나" 같은 테스트는 `getByRole("banner")`가 여러 개라 던진다. AC-4를 "머리 줄 컴포넌트에 `aria-label` 없이도 구분되는 방법"으로 다시 쓴다. 예: 버튼의 가장 가까운 `header`가 `main`보다 앞에 있고 `main` 밖에 있다, 또는 머리 줄에 `data-testid`.
2. **`--bottom-tab-height`의 정의에 위 테두리를 포함할지 정한다.** `nav`가 `border-top: 1px`을 가지면 `SummaryBar`가 `bottom: calc(56px + safe)`에 붙을 때 1px이 겹치거나 틈이 난다. AC-3의 "맞닿고 겹치지 않는다"를 결정적으로 만들려면 "토큰 56px에 테두리를 포함(내부 높이 55 + 테두리 1)"하거나 "테두리를 `box-shadow`로 그려 높이에 넣지 않음" 중 하나를 쓴다.
3. **safe-area를 누가 갖는지 모든 식에 적는다.** 스펙은 탭 줄이 safe-area를 갖고 요약 줄에서는 뺀다고 했다. 같은 원칙이 `noticeRegion`(`MortgageCalculator.module.css`의 `bottom: calc(summary + 3em + space-3 + env(...))`)과 `.page`·`.pageWithTallBar`의 아래 여백에도 적용돼야 한다. 식마다 `env(...)`를 한 번만 더해야 한다. 탭 높이를 더하면서 옛 `env(...)`를 남기면 iPhone에서 34px 중복으로 뜬다(추론). 식을 스펙에 풀어 적기를 권한다: 알림 `bottom` = 탭 + safe + 요약 72 + 3em + space-3, 계산 `.page` 아래 = 요약 + 탭 + safe + space-5.
4. **`scroll-padding-bottom` 메커니즘.** 뷰포트의 scroll-padding은 `:root`에서만 읽힌다. 화면별 `.page`에 두면 소용없다. 선택지: (a) `:root`에 가장 큰 값(탭 + 요약)을 한 번 둔다. 다른 화면은 약간 더 여유가 생길 뿐이다. (b) `:root:has(...)`로 계산 화면에서만. 가장 단순한 (a)를 권한다. 스펙의 "계산 화면은 요약 줄까지"는 (a)로 쓰면 해결된다.
5. **홈 요약의 "불러오는 중" 자리가 첫 화면 전체에 깜빡임을 만든다.** `selectAccountSourceStatus`는 `/api/me`가 오기 전에는 로그인 기록이 없는 로그아웃 사용자도 `loading`으로 둔다(`accountSourceStatus.ts`). 계산 화면은 이 대기가 보이지 않았지만 홈은 요약 줄이 소개 → "불러오는 중" → 숫자로 바뀐다. 레이아웃 흔들림을 막으려면 요약 줄에 최소 높이(한 줄 `min-height`, 계획 카드는 1줄 기준)를 주고 "불러오는 중" 자리에도 같은 높이를 둔다고 스펙에 적는다. 로컬 값을 먼저 그리지 않는 규칙은 맞다(로그인한 사람에게 틀린 숫자를 보였다 바꾸는 것보다 낫다).
6. **홈 요약의 순수 함수 위치.** 스펙은 `src/lib/utils/`로 적었다. 저장소 관례는 컨테이너 전용 순수 함수를 그 옆에 둔다(`Calculator/summaryTag.ts`·`saveButtonState.ts`, `Home/linkedListing.ts`). 홈에서만 쓰므로 `containers/Mortgage/Hub/` 옆에 두는 것이 CONVENTIONS의 지역성과 맞다. `lib/utils`에 이미 있는 `validateAmount`·`formatManwon`(`amount.ts`)·`summarizeInteriorPlan`을 그대로 쓰고, "올바른 금액" 판단을 새로 만들지 않는다고 스펙에 한 줄 적는다.

### 확인된 것(문제 없음)

- 360px: 탭 4개가 90px씩이고 라벨 4글자("우리 집"은 공백 포함 4자)는 `--fs-tiny` 12px(작게 설정하면 11px)에서 한 줄에 들어간다. 높이 56px에 아이콘 24px + 라벨 줄 높이(12px × 1.5 = 18px)가 들어간다(추론). 라벨 줄 높이는 글자 크기 설정에서도 56px을 넘지 않는다.
- 히스토리: 탭은 `replace`, 홈 카드는 push라 "홈 → 카드 → 뒤로"가 홈으로 돌아온다. 탭 4개를 오간 뒤 뒤로 가기 한 번에 앱을 떠나는 것은 지금과 같다.
- 탭 이동 시 스크롤 위치가 문서에 남는 것(긴 화면에서 다른 탭의 긴 화면으로 가면 같은 offset에서 시작)은 지금 상단 탭도 같다. 스펙이 "같은 탭 다시 누르면 맨 위로"를 범위 밖에 둔 것과 같은 문제이고 이번에 새로 생기지 않는다.
- 편집 중 이탈 확인·저장 버튼 비활성화 같은 폼 규칙은 이 스펙이 건드리지 않는다.
- CONVENTIONS: 홈은 새 API 훅이 없고(기존 훅 재사용), container끼리 import하지 않는다(`onNavigate`를 `AppRoutes`가 props로 넘김). 헤더·하단 탭은 `AppRoutes`가 쓰는 앱 껍데기라 `components/`에 두는 현재 `TabNav` 선례와 맞다. 위반 소지는 위 6번(순수 함수 위치) 하나다. 홈 카드 컴포넌트는 홈 전용이므로 `Hub/components/`에 둔다.
- 스펙의 `<header>` → `<main>` → `<nav>` 구조: 기존 화면이 최상위 `<main>`을 쓰지 않는 것을 확인했다(`<main` grep 없음). 중첩 `main` 문제가 없다. 시트(`Sheet`)는 `position: fixed` 배경이라 `<main>` 안에 DOM이 있어도 화면 모양은 같다.

## 테스트 영향 범위 (추론: 실행하지 않았고 grep으로 센 것)

- `window.location.hash` 또는 `"#/"`를 쓰는 테스트 파일이 14개다. `TabNav.test.tsx`는 전면 교체(라벨 "저장 목록" → "매물", 순서·개수·`aria-current` 전부 변경)다.
- 첫 화면이 계산이라는 전제를 가진 파일은 `AppRoutes.test.tsx`, `AppRoutes.storageKeys.test.tsx`, `AppRoutes.storageKeys.loggedIn.test.tsx`, `AppRoutes.storageKeys.listingEntry.test.tsx`, `AppRoutes.householdPlans.test.tsx`다. 예: `AppRoutes.storageKeys.test.tsx`의 `walkThroughTabs`는 "앱 시작: 첫 화면은 계산"으로 `findByLabelText("매매가")`와 `link "저장 목록"`을 쓴다. 이 파일들은 시작 경로를 `PATHS.calculator`로 바꾸거나 홈에서 시작하도록 흐름을 고치고, 탭 이름을 "매물"로 바꿔야 한다.
- `parseRoute.test.ts`·`parseRoute.home.test.ts`는 "알 수 없는 해시 → 계산" 단언을 hub로 바꾼다. 스펙 A9의 "정리만 하는 `hash = "#/"`는 그대로" 판단은 맞다. `MortgageHome.*.test.tsx`는 대부분 cleanup 용도라 영향이 작다.
- `link name: "저장 목록"`은 14곳, `link name: "계산"`은 8곳이다(탭 링크 조회). 홈의 카드 링크 이름이 "대출 계산"·"매물 모으기"·"우리 집 인테리어"라 문자열 정확 일치 조회에서는 탭 링크와 겹치지 않는다. 단 계획 이름이 "우리 집"인 `makePlanP` 시드 때문에 "우리 집" 이름 링크 조회가 두 개 잡히는 경우는 홈 요약 줄이 링크가 아니라 설명 문구라 생기지 않는다(`aria-describedby`로 연결).

## AC-0 구조 검토

- (a) 홈·탭·카드는 쓰기를 부르지 않으므로 "스토어 쓰기 0회"는 지켜진다. 이미 있는 `AppRoutes.storageKeys.*.test.tsx` 세 파일이 쓰는 방식(허용 키 `ALLOWED_KEYS` = `interior-plans`·`interior-plan-imports`, `session-hint` 정리는 예외로 명시, `Storage.prototype` 스파이)이 그대로 쓸 수 있다. 스펙의 AC-0(a)는 "14개 키 전부 `setItem`·`removeItem` 0회"라고 적었지만 기존 테스트는 **로그아웃 확인 때 `removeItem(session-hint)`가 불린다**는 것을 예외로 두고 있다(`useListingSource.ts`의 `me.data.user === null` effect). AC-0(a)에 "기존 테스트의 허용 목록·`session-hint` 예외를 그대로 쓴다"를 명시한다. 그렇지 않으면 AC를 문자 그대로 구현한 테스트가 시드한 `session-hint: "1"` 때문에 실패한다.
- 로그인 경로는 기존 `loggedIn` 테스트처럼 이전 기록 키(`account-imports`·`budget-imports`·`listing-order-imports`)를 시드해 이전이 이미 끝난 사용자로 둬야 `setItem` 0회가 성립한다. 시드하지 않으면 이전 로직이 `*-imports` 키를 쓴다(기존 동작이지만 AC 문구와 어긋난다).
- (b) draft 원문은 `useDraft`로 읽기만 한다. `draftStore.getSnapshot`은 항상 `Draft`를 돌려주므로(`useDraft.ts`) 손상 draft 상태가 홈에는 없다. 스펙의 홈 "손상" 상태는 매물·계획에만 해당한다.
- 기존 링크: `#/listings?login=`·`#/share/…`·`#/invite/…`·`#/home/{planId}?…`는 `parseRoute`에서 해당 분기를 건드리지 않으므로 그대로다. 서버(`handleKakaoAuth.ts`의 복귀 주소)는 `#/listings`만 쓴다. `server/`·`migrations/`는 `grep`으로 `"#/"` 의존이 없다(`src` 밖에는 `#/`로 가는 하드코딩 없음).

## 리스크

1. 홈 진입으로 로그인 사용자의 앱 시작 때 `GET /api/interior-plans`(최악 약 2MB, `useInteriorPlanList` 주석)와 창 포커스 재조회가 매번 일어난다. 스펙이 인정한 변화다. 계획이 없는 사용자가 대부분일 것이므로 지금은 감수할 만하다. 부담이 보이면 홈 요약에서 계획 수만 받는 가벼운 API가 후속 후보다(지금 계약에 없음, 지어내지 않음).
2. 1-1이 한 태스크에 너무 크다(라우트·탭·머리 줄·CSS 8곳·홈 카드·테스트 수정). 리드가 한 PR로 묶더라도 커밋은 "경로 + 기존 테스트 수정(그린)" → "탭·머리 줄·여백 CSS" → "홈 카드" 순으로 나누길 권한다. 중간 커밋마다 `pnpm test`가 통과해야 한다.
3. 실기기 의존(AC-3의 iOS safe-area·키보드·카카오톡 인앱)은 jsdom으로 못 본다. 스펙의 태스크 3-1이 맞다. 확인하지 않은 가정: A2(키보드가 레이아웃 뷰포트를 줄이지 않음)는 스펙의 출처 인용을 믿는 것이고 이 검토에서 실기기로 확인하지 않았다.

## 스펙에 넣을 조건

1. AC-4 `banner` 단언을 위 근거대로 다시 쓴다(기존 화면 `<header>`가 있음).
2. `--bottom-tab-height`가 위 테두리를 포함하는지 정하고, `.page`·`pageWithTallBar`·`noticeRegion`·`SummaryBar`의 식을 safe-area를 한 번만 더하도록 스펙에 풀어 적는다.
3. `scroll-padding-bottom`은 `:root`에 한 번(탭 + 요약 중 큰 값)이라고 적는다.
4. 홈 요약 줄에 최소 높이를 주고 로딩·요약 상태가 같은 높이를 쓴다고 적는다(카드 높이가 데이터에 따라 흔들리지 않게).
5. D5 B의 분리선을 위 근거 2대로 적고, 매물 쪽은 구조 보장이 아니라 테스트로 지킨다는 문구로 바꾼다.
6. 홈 요약 순수 함수는 `containers/Mortgage/Hub/` 옆에 두고, `validateAmount`·`formatManwon`·`summarizeInteriorPlan`을 재사용한다.
7. AC-0(a)는 기존 `AppRoutes.storageKeys.*` 테스트의 허용 키·`session-hint` 예외·이전 기록 시드 방식을 따른다고 적는다. 세 파일 + `householdPlans`의 시작 경로·탭 이름 수정을 1-1 범위에 명시한다.
8. 공유·초대 "취소" 두 곳은 `PATHS.calculator`를 쓰던 곳이라 자동으로 바뀌지 않는다. `PATHS.hub`로 직접 바꾼다고 1-1에 명시한다.
9. D4: 아이콘 가져오기 형태(깊은 경로 우선 검토)와 `pnpm test` 시간 확인을 1-1에 넣고, D1~D5 결정이 나면 ADR(029의 "계산기가 첫 화면"·004의 "라우트 두 개"를 갱신하는 새 ADR)로 기록한다.
10. `@media print`로 숨기는 대상(머리 줄·탭 줄)을 CSS 파일 기준으로 적고, 표 보기 인쇄 미리보기와 계산 화면 인쇄 미리보기 둘 다 AC-3에서 확인한다(허용 목록 규칙은 표 보기에만 걸린다).
