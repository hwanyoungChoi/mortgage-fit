# 홈 허브와 하단 탭 — 종합 플랫폼 첫 화면·네비 개편

> 작성 2026-10-27 · 브랜치 `cony/platform-home` · 상태: 결정 D1~D5 확정(ADR-031) · 사용자 확인 U1~U11 대기(제안 기본값으로 진행 가능)
> 관련: ADR-031(이 스펙의 결정 D1~D5와 구현 필수 조건 1~9) · ADR-004(해시 라우트·계산 화면은 draft만 봄) · 017(시트 히스토리 밖) · 029(우리 집 진입·`#/` 계산 첫 화면 전제 — 이 스펙이 뒤집음) · 030(`?view=table`·인쇄 허용 목록) · 스펙 `interior-planner.md`(상단 탭 3개, 범위 밖이던 "종합 임장·계약 서비스로의 탭 재편"을 이번에 다룸)

## 목표

앱을 "대출 계산기 + 부가 기능"에서 **집 찾기 → 계산 → 계약 → 인테리어를 아우르는 종합 서비스**로 보이게 한다. 첫 화면을 홈(허브)으로 바꾸고, 화면 아래 고정 아이콘 탭으로 어느 기능이든 한 번에 간다. 단계를 강제하지 않는다. 인테리어만 필요한 사람도 홈에서 바로 [우리 집]으로 간다. 계산기는 여전히 메인이다(홈에서 가장 크고 먼저 보이고, 탭에도 있다). 기존 데이터·링크는 그대로 동작한다.

## 사용자 시나리오

1. (처음 온 사람) 주소창에 사이트를 열면 홈이 뜬다. 맨 위에 큰 [대출 계산] 카드, 그 아래 [매물 모으기]·[우리 집 인테리어] 카드가 소개 문구와 함께 있다. 번호·잠금·완료 체크는 없다. [대출 계산]을 누르면 계산 화면(`#/calculator`)이 열리고, 뒤로 가기로 홈에 돌아온다.
2. (인테리어만 필요한 사람) 홈에서 [우리 집 인테리어]를 누르거나 아래 탭 [우리 집]을 누르면 곧바로 계획 화면이다. 매물·계산을 거칠 필요가 없다.
3. (매일 쓰는 사람) 홈에 내 현황이 보인다: "저장한 매물 3개", "우리 집 · 앞으로 낼 돈 1,250만원", "작성 중 · 매매가 12억 5,000만원". 가리기를 켜 두었으면 금액은 •••로 보인다.
4. (계산 중) 계산 화면 아래에 예상 한도·필요한 자기자금·[저장] 줄이 있고, 그 바로 아래에 탭 줄이 있다. 두 줄이 겹치지 않는다. 입력칸을 눌러 키보드가 뜨면 두 줄은 지금처럼 키보드 뒤에 가려진다.
5. (글자 크기) 어느 화면이든 맨 위 머리 줄 오른쪽의 [가가]로 글자 크기 시트를 연다.
6. (기존 링크) 예전에 `…/#/`를 북마크했던 사람은 이제 홈에 도착한다. 작성 중이던 계산은 그대로 남아 있어 [대출 계산] 카드("작성 중 · 매매가 …")나 [계산] 탭으로 이어서 한다. 공유 링크(`#/share/…`)·초대 링크(`#/invite/…`)·카카오 로그인 복귀(`#/listings?login=…`)·우리 집 링크(`#/home/{planId}?…`)는 배포 전과 같은 화면이다.

## 참고한 사례

- **Material 3 내비게이션 바**: 핵심 목적지 2~5개에 쓴다. 목적지가 3개면 모두 아이콘+라벨, 4개면 선택된 것은 아이콘+라벨이고 나머지도 라벨을 권장한다. 선택 표시는 active indicator(아이콘 뒤 알약)로, 선택된 아이콘은 채운 모양을 쓴다. 라벨은 짧게, 줄바꿈·말줄임·축소는 피한다. → 탭 4개, **라벨을 항상 보인다**. 선택 표시는 색만으로 하지 않고 아이콘 뒤 알약과 굵은 라벨로 한다(이 앱은 무채색 팔레트라 색 차이가 작다). https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-navigation-bar-item.html · https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/navigation-bar/usage
- **Apple HIG 탭 바**: 탭 바는 앱의 영역을 오가는 **내비게이션 전용**이다. 현재 화면에 대한 동작은 툴바에 둔다. → [가가](글자 크기 시트를 여는 동작)는 탭에 넣지 않고 머리 줄에 둔다(D3). 원문 페이지는 직접 읽지 못했고 미러·요약으로 확인했다. https://developer-rno.apple.com/design/human-interface-guidelines/components/navigation-and-search/tab-bars · https://blogs.embarcadero.com/mobile-app-navigation-with-ttabcontrol/amp/
- **NN/g 모바일 내비게이션 패턴**: 탭 바는 스크롤해도 항상 보이고, 4~5개면 모두 보이게 두고, 아이콘에 라벨을 붙이는 것이 권장 관례다. 다른 보조 내비게이션에 공간을 더 쓰지 말라고 한다. → 탭 바 외의 고정 크롬을 늘리지 않는다. 머리 줄은 **고정하지 않고** 스크롤하면 함께 올라간다(D3). https://www.nngroup.com/articles/mobile-navigation-patterns/
- **라벨 있는 아이콘의 근거**: Google·Booking A/B 테스트(유출 자료)와 실무 기록이 라벨 있는 아이콘 쪽이 낫다고 보고한다. 엄밀한 통제 연구는 찾지 못했다. → 아이콘만 쓰는 탭은 하지 않는다. https://goodui.org/leaks/are-icons-with-labels-better-than-labels-alone-google-a-b-tested-this/ · https://trevorcalabro.substack.com/p/every-icon-needs-a-label
- **토스**: 하단에 '혜택' 메뉴와 '전체' 탭이 있고(토스 공식 글로 확인), 보안·인증 같은 설정은 '전체' 탭 안에 있다(블로그로 확인). 홈 탭의 정확한 구성·금액 숨기기 위치는 공식 자료로 **확인하지 못했다**. → 여러 서비스를 하단 탭과 홈 진입점으로 나누는 구조, 설정류를 탭이 아닌 곳에 두는 관례만 가져온다. https://toss.im/tossfeed/article/2024benefit · https://funissu.com/toss-logout-password-input
- **직방·호갱노노·오늘의집**: 하단 탭의 이름·순서를 공식 자료로 **확인하지 못했다**(검색 결과에 없음, 앱 실물 확인 필요). 확인된 것: 오늘의집은 콘텐츠·쇼핑·이사·시공을 한 앱에 묶은 "라이프스타일 슈퍼앱"이다(앱스토어 설명). 호갱노노는 첫 화면이 지도다(블로그). 직방은 2025-08 '분양' 메뉴를 새로 만들고 메인 화면에서도 청약 단지를 보여 준다(기사). → 여러 기능을 가진 앱이 **메인 화면에서 기능별 진입점을 함께 보여 준다**는 점만 근거로 쓴다. 탭 구성은 위 Material·HIG·NN/g 관례를 따른다. https://apps.apple.com/KR/app/id1008236892 · https://meowth.kr/real-estate/real-estate-app-comparison-2026/ · https://www.inews24.com/view/1383877
- **iOS Safari·Chrome의 키보드와 고정 요소**: iOS Safari는 키보드가 떠도 레이아웃 뷰포트가 줄지 않아 `position: fixed; bottom: 0` 요소가 키보드 뒤로 간다. Chrome도 108부터 같은 방식이다. 키보드 위로 따라 올리려면 visualViewport로 위치를 계속 고쳐야 하는데, 출처들도 매끄럽지 않다고 한다. → 계산 화면 요약 줄의 기존 규칙("키보드가 덮는 것은 허용", `SummaryBar.tsx`)을 탭 줄에도 그대로 쓴다. 새 visualViewport 처리는 넣지 않는다. https://saricden.substack.com/p/how-to-make-fixed-elements-respect-the-virtual-keyboard-on-ios · https://github.com/web-platform-tests/interop-2022-viewport/blob/main/explainers/virtual-keyboard.md
- **lucide-react**(아이콘): npm 최신 1.62.0, ISC 라이선스, `sideEffects: false`(쓰는 아이콘만 번들에 들어감), React 16.5~19 지원. `house`·`calculator`·`bookmark`·`paint-roller` 아이콘이 있다(`paint-roller` 페이지 확인). 지금 설치된 아이콘 라이브러리는 없다(`package.json` 확인). `package.json` exports에 `./icons/*`가 있어 `lucide-react/icons/house` 같은 깊은 경로 import가 된다(fe 검토에서 tarball로 확인). 아이콘은 자식·접근성 prop이 없으면 `aria-hidden="true"`를 자동으로 붙인다. → D4. https://registry.npmjs.org/lucide-react/latest · https://lucide.dev/icons/paint-roller
- **우리 패턴**: 탭 이동은 `replace`(이력 안 쌓임, `TabNav.tsx`), `TABS`가 `Record<TabName,…>`이고 순서는 여기서 파생(ADR-029 조건 10), 가리기는 `MaskedValue`(DOM에 값 없음), 인쇄는 `[data-print-area]` 허용 목록(ADR-030, 새 요소가 저절로 숨음), 시트 배경 `z-index: 10` > 탭 `5`. 컨테이너 전용 순수 함수는 그 container 옆에 둔다(`Calculator/summaryTag.ts`·`Home/linkedListing.ts`).

## 범위

- 포함:
  - 경로 정리: 홈 `#/`, 계산 `#/calculator`(D1), 그 밖의 경로 그대로. 알 수 없는 해시는 홈으로.
  - 하단 고정 아이콘 탭 `홈 · 계산 · 매물 · 우리 집`(상단 탭을 대체). safe-area, 선택 표시, `aria-current`, 인쇄 숨김.
  - [가가]를 전역 머리 줄로 옮김(D3).
  - 계산 화면 요약 줄·저장 알림·각 화면 아래 여백을 탭 줄 위로 맞춤. 시트는 탭 줄을 덮는다.
  - 홈 허브: 기능 카드 3개(대출 계산 크게 → 매물 모으기 → 우리 집 인테리어), 데이터가 없으면 소개, 있으면 내 현황 요약(매물 수, 계획별 앞으로 낼 돈, 작성 중 매매가), 가리기 적용, 로그인·함께 쓰는 중·불러오기 실패·손상 상태.
  - 공유받기·초대 화면의 링크 대상 정리("계산기로 가기" → 계산, "취소" → 홈).
- 범위 밖:
  - 계약 단계 기능(계약·잔금·이사 체크리스트)과 그 자리 표시 카드("준비 중")
  - 단계 마법사·진행 바·완료 체크·잠금
  - 입력 중 탭 숨기기, 키보드 위로 탭 따라 올리기(visualViewport)
  - 홈에서 쓰기 동작(가리기 토글, 다시 시도 버튼, 손상 초기화) — 각 화면에 이미 있음
  - 같은 탭 다시 누르면 맨 위로, 마지막 탭 기억(새 키 필요)
  - 넓은 화면 전용 내비게이션(왼쪽 레일), 웹 매니페스트·PWA
  - 서버·DB·API·localStorage 키 변경, `Listing`·`InteriorPlan` 형식 변경
  - 화면별 시트가 열린 동안 탭 줄을 키보드 포커스에서 빼기(지금 상단 탭도 빠지지 않는 기존 동작. 다음 단계 후보)

## 데이터 모델

**변경 없음.** 새 localStorage 키 0개, 새 테이블 0개, 기존 키(14개: account-imports·budget·budget-imports·draft·interior-plan-imports·interior-plans·listing-order·listing-order-imports·listings·privacy-mode·sent-shares·session-hint·text-size·trade-lookup)의 이름·형식·값 그대로. 홈은 기존 스토어·조회를 **읽기만** 한다.

라우트 타입(`src/lib/types/route.ts`)만 바뀐다:

```ts
export type Route =
  | { name: "hub" } // 홈(허브). D2. 화면 라벨은 "홈"
  | { name: "calculator" }
  | { name: "listings"; login?: LoginResult }
  | { name: "share"; token: string }
  | { name: "invite"; token: string }
  | { name: "home"; planId?: string; listingId?: string; view?: HomeView }; // 우리 집(라벨 "우리 집"). 경로 `#/home` 그대로

/** 하단 탭이 있는 화면 */
export type TabName = Exclude<Route["name"], "share" | "invite">; // hub | calculator | listings | home
```

`PATHS`(`src/lib/constants/paths.ts`): `hub: "#/"` 추가, `calculator: "#/calculator"`로 바뀜. 나머지 그대로. `parseRoute`: 경로가 정확히 `/calculator`면 계산(`/calculator/`·`/calculatorx`·`/Calculator`는 홈), 알 수 없는 해시는 `hub`. `hub`는 쿼리를 정규 경로에서 버린다. 정규 경로 왕복(`toRoutePath(parseRoute(h)) === h`)은 모든 정규 경로에서 성립한다. `Route.hub` 주석과 `TABS`의 `home` 항목에 "라벨은 우리 집" 주석을 둔다(코드 `hub`=라벨 홈, 코드 `home`=라벨 우리 집 혼동 방지).

## API 계약

**변경 없음.** 홈 요약은 이미 있는 조회를 react-query 캐시로 같이 쓴다: `GET /api/me`, `GET /api/listings`(`useListingSource`), `GET /api/interior-plans`(우리 집 출처). 달라지는 점은 하나다. 로그인 사용자가 홈을 열면 `GET /api/interior-plans`가 앱 시작 때 불린다(지금은 [우리 집]을 열 때만). 함께 쓰는 중이면 기존 규칙대로 홈에 있는 동안 30초 폴링이 돈다. 서버(`server/`)·`migrations/`·`worker/`·`wrangler.jsonc`는 한 줄도 바뀌지 않는다.

## 경로와 기존 링크

| 주소                                                                                                | 배포 전                             | 배포 후                        | 비고                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…/`(해시 없음), `#`, `#/`, `#/?a=1`, `#/?login=failed`                                             | 계산                                | **홈**                         | 옛 북마크·방문 기록·iOS "홈 화면에 추가"는 대부분 `#/`다(앱이 바로 `#/`로 정규화하므로). 이들은 이제 홈에 도착한다. draft 키는 그대로라 작성 중 계산은 남는다. 계산까지 한 번 더 눌러야 한다(D1에서 감수) |
| `#/calculator`, `#/calculator?a=1`                                                                  | 알 수 없는 해시 → 계산(`#/`로 교체) | 계산(정규 경로 `#/calculator`) | 예전에 이 주소를 쓴 사람도 계산에 도착한다                                                                                                                                                                |
| `#/x`, `#/listing/abc`, `#listings`, `#/calc`, `#/calculatorx`, `#/calculator/x`, `#/Calculator` 등 | 계산                                | 홈                             | 기본 화면이 홈으로 바뀜. 정확히 `/calculator`만 계산                                                                                                                                                      |
| `#/listings`, `#/listings?login=cancelled\|failed\|notConfigured`                                   | 저장 목록                           | 같음                           | 카카오 로그인 서버 복귀(`handleKakaoAuth.ts`) 무변경                                                                                                                                                      |
| `#/share/{token}`, `#/invite/{token}`                                                               | 공유받기·초대                       | 같음                           | 서버가 만드는 링크(`handleShares.ts`·`handleHousehold.ts`) 무변경                                                                                                                                         |
| `#/home`, `#/home/{planId}?listing=&view=`                                                          | 우리 집                             | 같음                           | 코드 이름 `home`도 그대로(D2)                                                                                                                                                                             |
| 매물 카드 [수정]·[복사]                                                                             | `#/`로 push                         | `#/calculator`로 push          | `PATHS.calculator`를 쓰므로 자동. 뒤로 가기 → 저장 목록 스크롤 복원 그대로                                                                                                                                |
| 저장 목록 빈 상태 "계산하러 가기", 공유·초대 "계산기로 가기"                                        | `#/`                                | `#/calculator`                 | 자동                                                                                                                                                                                                      |
| 공유·초대 "취소" (`MortgageShare.tsx`, `MortgageInvite.tsx`)                                        | `#/`(계산)                          | `#/`(**홈**)                   | 의도한 변경(U8). 같은 `PATHS.calculator`를 쓰던 곳이라 **자동으로 안 바뀐다. `PATHS.hub`로 직접 바꾼다**                                                                                                  |

- 옛 번들을 연 채 남아 있는 탭은 자기 라우팅으로 계속 동작한다(해시 라우트라 서버 경로 영향 없음).
- 웹 매니페스트(start_url)는 없으므로 고칠 것이 없다.

## 화면

### 전체 틀 (`AppRoutes`)

DOM 순서 = 보이는 순서: `<header aria-label="모기지핏">`(머리 줄, `<main>` 바깥) → `<main>`(화면) → `<nav aria-label="화면">`(하단 탭). 글자 크기 시트가 열리면 셋 모두 inert(지금과 같음). 기존 화면 안의 `<header>`(저장 목록·우리 집 계획·공유받기·초대)는 `<div>`로 바꾸지 않는다. 테스트 도구는 `main` 안 `<header>`도 `banner`로 세므로, 전역 머리 줄은 이름으로 질의한다: `getByRole("banner", { name: "모기지핏" })`.

### 머리 줄 (D3 A)

- 스크롤과 함께 올라간다(고정 아님). 왼쪽 "모기지핏"(제목 아님, 그냥 글자), 오른쪽 [가가](`aria-label="글자 크기"`, `aria-haspopup="dialog"`, 시트를 닫으면 포커스 복귀). 모든 화면(홈·계산·저장 목록·우리 집·공유받기·초대)에서 같은 자리에 하나만 있다. 높이는 [가가]의 누르는 자리(44px 이상)로 정하고 한 곳에만 둔다.
- 각 화면의 `h1`은 그대로 화면 이름이다: 홈 "홈", 계산 "대출 계산"(부제 "주담대 한도·자기자금 계산기"), 저장 목록 "저장 목록", 우리 집 "우리 집"/계획 이름(U7).

### 고정 크롬과 여백 (식을 한 곳에서 정의)

- `--bottom-tab-height: 56px`는 **위 테두리 1px을 포함**한다(`box-sizing: border-box`, 내부 55 + 테두리 1). 정의는 `src/index.css` 한 곳.
- `env(safe-area-inset-bottom)`은 **탭 줄만** 가진다. 아래 식에 `env()`가 나오는 곳은 "탭 + safe" 묶음 하나뿐이고, 옛 식에 있던 `env()`는 남기지 않는다(남기면 iPhone에서 34px 중복).
  - 탭 줄: 높이 `--bottom-tab-height` + safe 여백.
  - 요약 줄(`SummaryBar`) `bottom` = 탭 + safe. 높이 72px.
  - 저장 알림(`noticeRegion`) `bottom` = 탭 + safe + 요약 72 + 3em + `--space-3`.
  - 계산 `.page` 아래 여백 = 요약 + 탭 + safe + `--space-5`(높아진 요약 줄 `pageWithTallBar`도 같은 식, 요약 높이만 다름).
  - 그 밖의 `.page`(홈·저장 목록·우리 집(표 보기 포함)·공유받기·초대) 아래 여백 = 탭 + safe + 기존 여백. 맨 아래 요소(저장 목록 마지막 카드의 [인테리어 계획], 표 보기 "계" 줄)가 스크롤 끝에서 탭 줄 위에 모두 보인다.
- `scroll-padding-bottom`은 `:root`에 **한 번**(탭 + safe + 요약 72 중 가장 큰 값). 화면별 `.page`에는 두지 않는다(뷰포트 scroll-padding은 `:root`만 읽힌다). 키보드 Tab으로 옮긴 포커스가 탭 줄·요약 줄 밑에 가리지 않게 한다.
- 상단에 고정된 것이 없어지므로 `--tab-nav-height`와 `scroll-padding-top`은 지운다.
- 360×780에서 고정 크롬은 탭 56 + 요약 72 = 128px다(지금 상단 탭 48 + 요약 72 = 120px와 비슷).

### 하단 탭

- 순서·라벨·주소: **홈 `#/` · 계산 `#/calculator` · 매물 `#/listings` · 우리 집 `#/home`**(U2). 아이콘 + 라벨을 항상 보인다(U3). 아이콘은 `aria-hidden="true"`를 **명시 prop으로** 준다(라이브러리 기본값에 기대지 않음). 링크 이름은 라벨 글자 그대로다.
- 선택 표시: 현재 화면의 링크만 `aria-current="page"`. 보이는 표시는 잉크색 아이콘 + 아이콘 뒤 옅은 알약(`--color-raised`) + 굵은 라벨, 나머지는 `--color-text-muted`. 색만으로 구분하지 않는다. 홈=`hub`, 계산=`calculator`, 매물=`listings`(`?login=` 포함), 우리 집=`home`(플랜·보기·`?listing=` 모두 포함). 공유받기·초대는 선택 없음.
- 이동은 지금처럼 `replace`(탭끼리 오가도 뒤로 가기 이력이 쌓이지 않음), 누르기 직전 `onNavigate`(저장 목록 스크롤 초기화). 보조 키(⌘·Ctrl·Shift·Alt) 클릭은 브라우저 기본 동작(새 탭).
- 배치: `position: fixed; bottom: 0`, 전체 폭 바탕 띠 + 내용은 480px 열 가운데(`SummaryBar`와 같은 방식), 위 테두리 1px, `z-index: 5`. 누르는 자리 44px 이상. 라벨은 `--fs-tiny`라 글자 크기 설정에 따라 줄지만 탭 높이는 그대로다. 360px 폭에서 탭 하나 약 90px, 4글자 라벨 한 줄.
- 키보드: 따라 올라오지 않는다(키보드 뒤로 가려짐, 요약 줄과 같은 규칙). visualViewport 처리 없음.
- 시트: 모든 시트(배경 `z-index: 10`)가 탭 줄을 덮는다. 시트가 열린 동안 탭을 눌러 화면이 바뀌는 일은 없다.
- 인쇄: 머리 줄과 하단 탭은 인쇄하지 않는다. 각 컴포넌트 CSS(머리 줄 모듈·`TabNav.module.css`)에 `@media print { display: none }`을 둔다(`index.css`의 `[data-print-area]` 허용 목록은 표 보기에만 걸리므로 계산 화면 인쇄에는 이것이 따로 필요하다).
- 공유받기·초대: 탭 줄은 보이되 선택 없음(U8).
- 아이콘 출처(D4): `lucide-react`, 아이콘 4개만(`House`·`Calculator`·`Bookmark`·`PaintRoller`).

### 홈 (`#/`, `src/containers/Mortgage/Hub/MortgageHub.tsx`)

- 제목 `h1` "홈". 카드는 위에서부터 **대출 계산(가장 크게, 맨 위) → 매물 모으기 → 우리 집 인테리어**(U1). 카드마다 전체가 하나의 링크(누르는 자리 넓게)이고, 링크 이름은 카드 제목, 요약·소개 문구는 `aria-describedby`로 읽는다. 번호·단계·잠금·완료 표시는 없다. 카드 컴포넌트는 홈 전용이라 `Hub/components/`에 둔다.
- 카드 링크는 일반 링크(**push**)라 뒤로 가기로 홈에 돌아온다(탭은 replace). [매물 모으기]로 갈 때도 저장 목록 스크롤을 맨 위로 초기화한다(`AppRoutes`가 `onNavigate`를 넘김. container끼리 import하지 않음).
- 주소: 대출 계산 → `#/calculator`, 매물 모으기 → `#/listings`, 우리 집 인테리어 → `#/home`(계획 1개면 그 계획, 2~3개면 고르기 — 기존 규칙).
- 소개 문구(데이터 없을 때, U4):
  - 대출 계산: "매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다"
  - 매물 모으기: "본 매물을 저장해 자기자금·추가 비용을 비교합니다"
  - 우리 집 인테리어: "계약한 집의 인테리어 예산·견적·지급을 정리합니다"
- 내 현황 요약(데이터 있을 때, 태스크 2, U5): 소개 문구 대신 그 자리에 보인다. 요약·로딩·소개 줄은 같은 최소 높이(한 줄 `min-height`, 우리 집은 1줄 기준)를 써서 데이터에 따라 카드가 흔들리지 않는다.
  - 대출 계산: draft의 매매가가 `validateAmount(salePrice).status === "valid"`(`src/lib/utils/amount.ts`, 새 판정을 만들지 않음)이면 "작성 중 · 매매가 {formatManwon}". 아니면 소개 문구. `listingId`가 붙은 draft(저장한 매물을 수정 중)도 "작성 중"으로 보인다. **필요한 자기자금·한도처럼 규제값으로 계산한 수치는 홈에 보이지 않는다**(규제 기준일 표시 대상이 늘지 않게. CLAUDE.md 제약). draft는 손상 상태가 없다: 원문이 깨지면 스토어가 `DEFAULT_DRAFT`로 읽어 소개 문구가 된다.
  - 매물 모으기: "저장한 매물 {n}개"(n ≥ 1). 함께 쓰는 중이면 "함께 쓰는 목록 · 매물 {n}개"(U10). 매물 0개는 소개 문구, 단 함께 쓰는 중 0개는 "함께 쓰는 목록 · 매물 0개".
  - 우리 집 인테리어: 계획마다 한 줄 "{계획 이름} · 앞으로 낼 돈 {formatManwon}"(최대 3줄). 계획 0개는 소개 문구. 순서는 우리 집 화면의 계획 목록 순서 그대로(로컬: 저장 순서, 서버: 응답 순서)이고 홈이 다시 정렬하지 않는다. 앞으로 낼 돈 = `summarizeInteriorPlan(plan, now).upcomingTotal`을 그대로 부른다(ADR-029 조건 9 정의, 홈이 새로 계산하지 않음). 0이면 "0만원", `12500`이면 "1억 2,500만원".
  - 가리기(`privacy-mode` 읽기만): 금액은 `MaskedValue`(•••, "가려짐"), DOM에 숫자 없음. 개수("3개")·계획 이름·"불러오는 중" 같은 상태 문구는 가리지 않는다. 홈에는 가리기 토글이 없다(U11).
- 요약 순수 함수: `containers/Mortgage/Hub/` 옆(예: `summarizeHub.ts`)에 둔다(`lib/utils`가 아님). 입력: 매물 목록 상태·계획 목록 상태·draft·가구 여부. 출력은 카드별 판별 유니온:

  ```ts
  type HubCardSummary<T> =
    | { kind: "intro" }
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "corrupt" }
    | { kind: "summary"; value: T }; // value: 작성 중 매매가 | 매물 수(+가구 여부) | 계획 줄 배열
  type HubSummary = { calculator: HubCardSummary<…>; listings: HubCardSummary<…>; home: HubCardSummary<…> };
  ```

- 상태(카드마다 따로 계산, 한 카드의 실패가 다른 카드를 막지 않음. 카드 링크는 어떤 상태에서도 동작). 표는 AC-7:
  - 로그아웃: 이 기기 데이터. 로그인: 서버 데이터(로컬 매물·계획은 세지 않음). 로그인 직후 이전 중이면 로딩.
  - 로딩(계정 확인·이전·조회 중): 요약 자리에 "불러오는 중"(`aria-busy="true"`). 로딩 중에는 로컬 값을 먼저 그렸다 바꾸지 않는다(우리 집 화면 규칙과 같음). 로딩을 끝낸 뒤에야 값이 나온다.
  - 불러오기 실패: "불러오지 못했습니다"(U9). 계정 확인 실패는 기존 `selectAccountSourceStatus`를 **그대로** 쓴다(로그인 기록 `session-hint`가 있는 브라우저만 error, 없으면 로컬 값). 다시 시도는 그 화면에서.
  - 세션 만료(401, `isSessionExpired`)·재조회 실패(`isRefreshFailed`, 받아 둔 목록은 있음): 받아 둔 값을 유지하고 오류 문구는 쓰지 않는다. 받아 둔 값이 없으면 error.
  - 손상(로컬 원문이 깨짐): "저장 데이터를 확인해 주세요". 홈은 초기화하지 않고 저장소에 쓰지 않는다. 매물·계획에만 해당.
  - 저장소를 쓸 수 없음: 소개 문구.
  - 함께 쓰는 중: 저장 목록·우리 집 화면이 보이는 것과 같은 수·값(가구 범위). 가구 계획 조회는 홈에 있는 동안 30초 폴링.
- 읽기 경로(D5 B): 매물은 전역 `useListingSource`를 그대로 쓰고, draft는 `useDraft`, 가리기는 `privacyModeStore`. 계획은 우리 집 출처의 **읽기 부분**을 `src/hooks/`로 분리한 훅을 쓴다. 홈은 쓰기 함수를 부르지 않는다. 구조로 보장되는 것은 **계획**뿐이다(홈이 계획 쓰기 훅을 손에 쥐지 않음). 매물은 `useListingSource`에 쓰기 함수와 `session-hint` mark/clear effect가 딸려 오므로 "홈 컴포넌트가 쓰기를 부르지 않는다 + 스파이 테스트(AC-0)"로 지킨다. 기존 예외(`session-hint`는 로그인 확인 결과로 정리되는 키, ADR-029 AC-0(g))는 그대로다.

### 반복 사용 불편 방지

- 탭은 replace라 탭을 여러 번 오간 뒤 뒤로 가기 한 번이면 앱을 떠난다(지금과 같음). 카드는 push라 "홈 → 카드 → 뒤로"가 홈으로 돌아온다.
- 우리 집 탭은 늘 `#/home`으로 간다. 계획 1개면 그 계획(공간별)이 열린다. 표 보기에서 다른 탭을 다녀오면 공간별로 돌아온다(지금과 같음).
- 계산 화면을 다녀와도 draft가 남고, 홈 카드가 "작성 중"을 보여 이어서 할 수 있다.
- 긴 화면에서 다른 탭의 긴 화면으로 가면 같은 스크롤 offset에서 시작하는 것은 지금 상단 탭과 같다(이번에 새로 생기지 않음).

## 수용 기준

- [ ] **AC-0 (기존 데이터·서버 무변경, 최우선)**:
  - (a) 형태는 기존 `AppRoutes.storageKeys*` 테스트 그대로. 기존 14개 키에 올바른 원문을 모두 시드한다(`interior-plans`에 유효한 계획 P 포함, 원문은 `JSON.stringify(x, null, 2)` 들여쓰기로 적어 다시 쓰면 걸리게). 로그아웃 상태로 `#/` 열기 → 탭 [계산] → [매물] → [우리 집] → [홈] → 카드 [대출 계산] → 뒤로 가기. 쓰기 규칙: 로그인 확인 전 `setItem`·`removeItem`·`clear` 0회 / 로그아웃 확인 후 허용되는 쓰기는 `removeItem("loan-calculator/session-hint")` 1종뿐 / 로그인 확인 후 허용되는 쓰기는 `setItem("loan-calculator/session-hint", "1")` 뿐 / 그 외 13개 키는 원문이 시드와 `===`이고 쓰기 0회 / 새 키 0개(`session-hint` 외 키 집합 불변).
  - 로그인 시드 두 갈래(가짜 API): 혼자 쓰는 계정은 `account-imports`·`budget-imports`·`listing-order-imports`·`interior-plan-imports` 4키에 해당 userId를 모두 시드(이전 끝남 상태)하고, 가구 계정(`isInHousehold: true`)은 이전 4개를 건너뛴다. 둘 다 위 쓰기 규칙(로그인 후 `session-hint` mark만)이 성립한다.
  - 스파이 두 갈래: (1) 기존처럼 `storage` prop에 스파이 메모리 스토리지를 주입해 위 순회를 돈다. (2) 1개 테스트는 `storage` prop 없이 jsdom `localStorage`를 시드하고 `vi.spyOn(Storage.prototype, "setItem" | "removeItem" | "clear")`로 같은 순회를 돈다(주입 경로를 우회하는 직접 쓰기를 잡는 용도).
  - 체크포인트: 홈이 처음 그려지고 안정된 직후(`findBy` 뒤)와 각 이동 뒤마다 같은 쓰기 단언을 한다(순회 끝에서 한 번만 보지 않는다).
  - (b) draft 원문 `salePrice: "125000"`을 넣고 `#/`를 열면 홈이고, [계산] 탭을 누르면 계산 화면 매매가 칸에 그 값이 보이며 draft 원문은 `===`이다.
  - (c) `git diff $(git merge-base main HEAD) -- server migrations worker wrangler.jsonc` 출력이 비어 있다(vitest가 아닌 검증 명령. 빈 출력을 기록에 남긴다).
- [ ] **AC-1 (경로 규칙표)**:
  - `parseRoute` → 정규 경로: `""`·`"#"`·`"#/"`·`"#/x"`·`"#/listing/abc"`·`"#listings"`·`"#/calc"`·`"#/calculatorx"`·`"#/calculator/x"`·`"#/Calculator"`·`"#/?a=1"` → `{name:"hub"}`·`"#/"` / `"#/calculator"`·`"#/calculator?a=1"` → `{name:"calculator"}`·`"#/calculator"` / `"#/listings?login=failed"` → `{name:"listings",login:"failed"}`(그대로) / `"#/listings?sort=recent"` → `"#/listings"` / `"#/home/plan-p?listing=listing-r&view=table"` → 같은 문자열 / `"#/share/AbC_12"` → `{name:"share",token:"AbC_12"}` / `"#/invite/XyZ"` → `{name:"invite",token:"XyZ"}`. 정규 경로(`#/`·`#/calculator`·`#/listings`·`#/home`·`#/home/plan-p?view=trade`)는 다시 파싱해도 같다.
  - `AppRoutes` 기존 링크 통합 `it.each` 표(각 행: 화면, 최종 해시, `history.length` 불변, `aria-current` 탭):

    | 시작 해시                                                                                                      | 화면                          | 최종 해시             | aria-current                |
    | -------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------- | --------------------------- |
    | `""` / `"#"` / `"#/"`                                                                                          | 홈(h1 "홈")                   | `#/`                  | 홈                          |
    | `"#/x"`, `"#/listing/abc"`, `"#listings"`, `"#/calc"`, `"#/calculatorx"`, `"#/calculator/x"`, `"#/Calculator"` | 홈                            | `#/`                  | 홈                          |
    | `"#/?login=failed"`, `"#/?a=1"`                                                                                | 홈                            | `#/`                  | 홈                          |
    | `"#/calculator"`, `"#/calculator?a=1"`                                                                         | 계산                          | `#/calculator`        | 계산                        |
    | `"#/listings"`                                                                                                 | 저장 목록                     | 그대로                | 매물                        |
    | `"#/listings?login=failed"` (cancelled, notConfigured 포함)                                                    | 저장 목록 + 로그인 안내 한 번 | 안내 뒤 `#/listings`  | 매물                        |
    | `"#/listings?sort=recent"`                                                                                     | 저장 목록                     | `#/listings`          | 매물                        |
    | `"#/share/AbC_12"`, `"#/invite/XyZ"`                                                                           | 공유받기/초대                 | 그대로(대소문자 유지) | 없음, 탭 줄 4개 링크는 보임 |
    | `"#/home"`, `"#/home/plan-p?view=table"`, `"#/home/plan-p?listing=listing-r&view=table"`                       | 우리 집                       | 그대로                | 우리 집                     |
    | `"#/home/a.b"`(형식 틀린 id)                                                                                   | 우리 집                       | `#/home`              | 우리 집                     |

  - 매물 카드 [수정]·[복사], 저장 목록 "계산하러 가기", 공유·초대 "계산기로 가기"의 `href`는 `"#/calculator"`, 공유·초대 "취소"는 `"#/"`. 홈 카드 [대출 계산] → `history.back()` → 홈(`#/`), 탭 이동은 이력 불변.
- [ ] **AC-2 (하단 탭)**: 링크 이름은 정확히 문자열 일치로 질의한다(정규식 금지: 탭 "계산"과 카드 "대출 계산"이 충돌). `navigation "화면"` 안 링크가 순서대로 `[["홈","#/"],["계산","#/calculator"],["매물","#/listings"],["우리 집","#/home"]]`이고 버튼은 없다. 라우트별 `aria-current="page"`는 하나뿐: hub→홈, calculator→계산, listings(`?login=failed` 포함)→매물, home(`#/home/plan-p?view=table` 포함)→우리 집. share·invite는 없음. 계산 화면에서 [우리 집]을 누르면 `onNavigate` 1회 뒤 해시가 `#/home`이고 `history.length`가 그대로다. `nav` 안 `svg`는 정확히 4개이고 모두 `aria-hidden="true"`. `nav`는 DOM에서 `main` 뒤에 있다(`compareDocumentPosition`).
- [ ] **AC-3 (겹침·인쇄·키보드, 리드 화면 확인 360×780 + 실기기)**: jsdom은 레이아웃을 계산하지 않으므로 리드가 화면에서 측정해 값을 기록한다. 계산 화면에서 요약 줄 bottom === 탭 줄 top(`getBoundingClientRect`), 스크롤 끝에서 [이 지역 실거래가 보기] 버튼 bottom <= 요약 줄 top, `document.documentElement.scrollWidth <= 360`(가로 스크롤 없음). 저장하면 "'{이름}' 저장했습니다" 알림이 요약 줄 위에 뜬다. 저장·스크린샷·실거래가·글자 크기 시트를 열면 배경이 탭 줄을 덮는다. 저장 목록 마지막 카드와 표 보기 "계" 줄이 탭 줄에 가리지 않는다. iPhone(홈 인디케이터 있는 기종)에서 탭 줄 아래 safe-area 여백이 있다. 입력칸을 눌러 키보드가 뜨면 탭·요약 줄이 키보드 뒤에 있고, 키보드를 닫으면 제자리다. 인쇄 미리보기는 계산 화면과 표 보기 **둘 다** 탭 줄·머리 줄이 없다. 최대·최소 글자 크기에서 탭 라벨이 한 줄이다.
- [ ] **AC-4 ([가가] 새 자리)**: `it.each`로 홈·계산·저장 목록·우리 집·공유받기·초대 각 화면에서 `button "글자 크기"`가 정확히 하나이고, `getByRole("banner", { name: "모기지핏" })`(전역 머리 줄) 안에 있으며 `navigation` 안에는 없다. 화면 안 `<header>`가 있는 화면에서도 이름 있는 전역 머리 줄은 하나이고 `<main>` 바깥이다. 누르면 `dialog "글자 크기"`가 열리고, 그동안 머리 줄·`main`·`nav`는 `closest("[inert]") !== null`, 시트는 null이다. 닫으면 포커스가 그 버튼으로 돌아온다(`toHaveFocus`). 고른 값은 지금처럼 `text-size` 키에만 쓴다.
- [ ] **AC-5 (홈 — 데이터 없음)**: 빈 저장소, 로그아웃, `#/`. `h1` "홈". 링크가 DOM 순서대로 "대출 계산"(`#/calculator`) → "매물 모으기"(`#/listings`) → "우리 집 인테리어"(`#/home`)이고, 각 카드에 U4 소개 문구가 `aria-describedby`로 읽힌다(`toHaveAccessibleDescription`). 순번·단계 판정식: 홈에 `ol` 없음, 카드 제목 텍스트가 `/^\s*\d+[.)]/`에 걸리지 않음, 홈 텍스트에 `/단계|완료|잠김|준비 중/` 없음(요약의 "3개" 같은 숫자는 허용). 카드 [대출 계산]을 누르면 `history.length` +1, 뒤로 가기로 `#/` 홈. 저장 목록을 스크롤한 적이 있어도 카드 [매물 모으기]로 가면 맨 위에서 시작한다(`scrollTo(0, 0)`). **"대출 계산 카드가 가장 크다"는 jsdom으로 못 보므로 리드가 360×780에서 확인해 수치를 기록한다**: 제목 글자 `--fs-title`(나머지 `--fs-section`), 대출 계산 카드 높이(`getBoundingClientRect().height`)가 나머지 카드보다 크다.
- [ ] **AC-6 (홈 — 내 현황 요약, 로그아웃)**:
  - 매물 3개(로컬) + 계획 P(`makePlanP`, 이름 "우리 집") + draft `salePrice: "125000"` → "작성 중 · 매매가 12억 5,000만원", "저장한 매물 3개", "우리 집 · 앞으로 낼 돈 1,250만원". 테스트는 탭 이름과 겹치는 "우리 집"을 `within(card)`로 좁혀 질의한다.
  - 앞으로 낼 돈은 `summarizeInteriorPlan`을 그대로 부른다는 증거: P에서 샷시 잔금(`paySashBalance`)을 지급함으로 바꾸면 홈이 "250만원"을 보인다(1,250은 확정 견적·전체 합계와 같은 숫자라 이 케이스가 필요). 표기 경계: `12500` → "1억 2,500만원", `1250` → "1,250만원", `0` → "0만원".
  - 계획 3개면 3줄이 목록 순서로 보인다(이름이 서로 다른 계획 3개를 `createdAt` 역순 등으로 시드해 순서가 구분되게).
  - 금액 경계표(`validateAmount(salePrice).status === "valid"` 기준, 대출 계산 카드):

    | draft.salePrice                                | 기대                                                 |
    | ---------------------------------------------- | ---------------------------------------------------- |
    | `"125000"`                                     | 작성 중 · 매매가 12억 5,000만원                      |
    | `"1"`                                          | 작성 중 · 매매가 1만원                               |
    | `"10000"`                                      | 작성 중 · 매매가 1억원                               |
    | `"125,000"`                                    | 12억 5,000만원 (쉼표는 `stripAmountFormatting`이 뗌) |
    | `" 125000 "`                                   | 12억 5,000만원                                       |
    | `"999999999"`                                  | 99,999억 9,999만원 (`MAX_AMOUNT`)                    |
    | `"0"`, `"12.5"`, `"12a"`, `""`, `"1000000000"` | 소개 문구                                            |

    `listingId`가 붙은 draft도 "작성 중"으로 보인다.

  - 0개: 로컬 매물 0개·계획 0개는 두 카드 모두 소개 문구. 1개는 "저장한 매물 1개".
  - 가리기를 켜면 금액 자리가 "•••"·"가려짐"이고 홈 `innerHTML`에 "1,250"·"12억"이 없다. "3개"와 "우리 집"은 보인다. 가리기를 켠 채 로딩·실패 상태여도 상태 문구는 그대로 보인다.
  - 홈 container는 `LOAN_REGULATIONS`·`calculateLoan`·계획 쓰기 훅을 import하지 않고, 화면에 "한도"·"LTV"·"자기자금" 수치가 없다(import 확인은 `grep`으로 하고 기록에 남긴다. 자동 테스트 아님).
- [ ] **AC-7 (홈 — 카드별 상태)**: 요약 순수 함수의 입력 → 출력(판별 유니온) 표 + 화면 테스트. 한 카드의 상태가 다른 카드에 번지지 않는다.

  | #   | 상태                                 | 매물 카드                   | 우리 집 카드                | 대출 계산 카드    |
  | --- | ------------------------------------ | --------------------------- | --------------------------- | ----------------- |
  | 1   | 로그아웃, 모두 정상                  | 저장한 매물 n개             | 계획별 줄                   | 작성 중 또는 소개 |
  | 2   | 로그아웃, `listings` 원문 `"{"`      | 저장 데이터를 확인해 주세요 | 정상 요약                   | 정상              |
  | 3   | 로그아웃, `interior-plans` 원문 깨짐 | 정상 개수                   | 저장 데이터를 확인해 주세요 | 정상              |
  | 4   | 로그인, `/api/me` 응답 전            | 불러오는 중                 | 불러오는 중                 | 정상(로컬 draft)  |
  | 5   | 로그인, 매물 이전 중, 계획 이전 끝   | 불러오는 중                 | 계획 요약                   | 정상              |
  | 6   | 로그인, `/api/listings` 500          | 불러오지 못했습니다         | 서버 계획 요약              | 정상              |
  | 7   | 로그인, `/api/interior-plans` 500    | 서버 매물 개수              | 불러오지 못했습니다         | 정상              |
  | 8   | `/api/me` 실패 + `session-hint` 있음 | 불러오지 못했습니다         | 불러오지 못했습니다         | 정상              |
  | 9   | `/api/me` 실패 + `session-hint` 없음 | 로컬 개수                   | 로컬 요약                   | 정상              |
  | 10  | 가구, 서버 매물 4개                  | 함께 쓰는 목록 · 매물 4개   | 가구 계획                   | 정상              |
  | 11  | 저장소 접근 불가 Storage             | 소개                        | 소개                        | 소개              |
  - (a) 행 4·5의 시드: 로그인 AC-0과 같은 이전 끝남 상태(서버 매물 2개·로컬 매물 5개) → "저장한 매물 2개"(AC-6의 로컬 3과 구분됨). 행 10에서 가구 0개 매물은 "함께 쓰는 목록 · 매물 0개".
  - (b) 로딩 플래시 판정: `/api/me`를 deferred promise로 두고, 첫 렌더 직후 로컬 매물 개수 텍스트가 DOM에 **없고**(`aria-busy="true"`, 카드 링크는 동작), resolve 뒤에야 서버 값이 나타난다. 최종 상태만 보는 테스트는 인정하지 않는다.
  - (c) 401 만료·재조회 실패 + 받아 둔 목록이 있으면 받아 둔 값을 유지하고 오류 문구가 없다. 받아 둔 목록이 없으면 error.
  - (d) `vi.useFakeTimers`로 가구가 홈에 있을 때 30초 뒤 두 번째 `GET /api/interior-plans`가 온다.
  - (e) `listings` 원문 `"{"`일 때 홈에 초기화 버튼이 없고 원문이 그대로다.

## 태스크

be 없음(서버·DB·API 변경 없음).

- [x] 1. **하단 탭 + 경로 정리 + [가가] 자리 + 홈 소개 카드(엔드투엔드 최소 버전)** — 배포하면 바로 새 네비와 새 첫 화면이 동작한다
  - [ ] 1-1. (fe) 아래 세 커밋 순서로 나누고, **각 커밋에서 `pnpm test`가 통과**한다. → AC-0·1·2·4·5
    - (a) 경로·테스트 이름 변경: `Route`에 `hub`, `PATHS.hub = "#/"`·`PATHS.calculator = "#/calculator"`, `parseRoute`·`toRoutePath`(알 수 없는 해시 → hub). 공유·초대 "취소"는 `PATHS.hub`로 **직접** 바꾼다(`MortgageShare.tsx`·`MortgageInvite.tsx`). 기존 테스트는 **기계적 이름 변경만** 한다: 시작 해시 `#/` → `PATHS.calculator`, 탭 링크 이름 "저장 목록" → "매물", 해시 단언 `"#/"` → `"#/calculator"`. 단언 삭제·약화(`toBe`→`toBeTruthy` 등) 금지, 삭제된 `expect` 0. 대상: `parseRoute*.test.ts`, `TabNav.test.tsx`, `AppRoutes.test.tsx`, `AppRoutes.storageKeys*.test.tsx`(3개), `AppRoutes.householdPlans.test.tsx`, `MortgageCalculator.test.tsx`, `MortgageHome.*.test.tsx`. 이 커밋 직후 실패 목록을 기록하고, `#/`로 시작하면서 통과하는 부정형 테스트(`queryBy…`·`not.toBe`)는 `grep -n 'queryBy\|not\.toBe'`로 감사해 목록을 남긴다.
    - (b) 탭·머리 줄·여백 CSS: `TabNav`를 하단 고정 아이콘 탭으로(라벨·아이콘·선택 표시·safe-area·인쇄 숨김, `TABS`에서 순서 파생 유지). 아이콘은 D4대로 `lucide-react` 4개만, `aria-hidden` 명시 prop. 전역 머리 줄(`aria-label="모기지핏"`, [가가], 인쇄 숨김). `AppRoutes`를 header → main → nav로. `--bottom-tab-height`(테두리 포함 56px)·`:root` `scroll-padding-bottom` 한 번, `--tab-nav-height`·`scroll-padding-top` 삭제. 화면 "고정 크롬과 여백"의 식대로 `SummaryBar`·`noticeRegion`·계산 `.page`·`pageWithTallBar`·모든 화면 `.page` 아래 여백(`env()`는 탭 줄만). 화면 안 `<header>`는 그대로 둔다.
    - (c) 홈 소개 카드: `MortgageHub`(container `Hub/`) 소개 카드 3개, 카드 push, [매물 모으기]에 `onNavigate`. 계산 화면 h1 "대출 계산"(U7).
    - 측정 기록: (b) 전후 `pnpm test` 소요 시간과 `pnpm build` 메인 청크 크기를 기록한다. 눈에 띄게 늘면 `import { House } from "lucide-react"` 배럴 대신 `lucide-react/icons/*` 깊은 경로 import로 바꾼다.
  - [ ] 1-2. (qa) 시작 시 `git diff $(git merge-base main HEAD) -- '*.test.ts' '*.test.tsx'`에서 삭제된 `expect` 줄 수를 센다(0이어야 함. 1-1에서 기계적 변경 밖의 수정은 되돌리고 이유를 요구). `MortgageCalculator.test.tsx`의 "알 수 없는 해시 → 계산" 테스트(AC-8c)는 의미가 뒤집히므로 `AppRoutes` 홈 테스트(AC-1 표)로 옮긴다. `storageKeys.loggedIn`의 `callsTo("GET", "/api/listings")` 대기는 "홈 로딩 끝"을 기다리도록 고친다. 라우트 규칙표·AppRoutes 기존 링크 통합 표·탭·[가가]·홈 소개 카드·스파이 Storage(AC-0 두 갈래·체크포인트) 테스트. **변이 확인**: 알 수 없는 해시 → calculator로 되돌리기, `toRoutePath`의 hub가 `#/calculator`를 돌려줌(replace 루프), `hub`를 `aria-current` 계산에서 빼기, `aria-current` 조건 바꾸기, 탭 순서 뒤섞기, `onNavigate` 미전달, 머리 줄 [가가] 이중 렌더(탭에도 남김), 카드 push → replace, [매물 모으기] 카드의 `onNavigate` 제거(스크롤 초기화 누락), 공유·초대 "취소"를 `PATHS.calculator`로 되돌리기. → AC-0(a)(b)(c)·1·2·4·5
  - [ ] 1-3. (리드) 360×780 화면 확인 AC-3(겹침 측정값·인쇄 미리보기 둘·가로 스크롤)과 AC-5(대출 계산 카드 크기 수치), 최대·최소 글자 크기에서 탭 라벨 한 줄. 측정값을 기록에 남긴다.
- [ ] 2. **홈 내 현황 요약** — 태스크 1의 카드에 요약 줄을 얹는다
  - [ ] 2-1. (fe) 계획 출처의 읽기 부분을 `src/hooks/`로 분리(D5 B). 분리선(fe 검토): 읽기 쪽으로 `useMe`·`selectAccountSourceStatus`·`household`·`useInteriorPlanList`·`useEndSession`·`isSessionExpired` 상태·`expireSession`·`storage` 이벤트 effect·`localSnapshot`·`selectList`·`isRefreshFailed`·`retry`·`isRetrying`(예: `src/hooks/useInteriorPlanListSource.ts`가 `{ status, household, list, isRefreshFailed, isSessionExpired, expireSession, retry, isRetrying }`를 돌려줌). 쓰기 훅 6개·`readLatestPlans`·`writeServer`·`writeBySource`는 `Home/hooks/useInteriorPlanSource`에 남고, 읽기 훅 위에 쓰기를 얹어 지금과 같은 `InteriorPlanSource`를 돌려준다. **`useInteriorPlanSource.test.tsx`와 `MortgageHome*.test.tsx`는 한 줄도 수정하지 않고(diff 0) 통과**해야 한다. 요약 순수 함수는 `containers/Mortgage/Hub/` 옆(판별 유니온 출력, `validateAmount`·`formatManwon`·`summarizeInteriorPlan` 재사용). 카드에 요약·로딩·실패·손상·가구 표시, 요약 줄 최소 높이, `MaskedValue` 적용, 계정 확인 실패는 기존 `selectAccountSourceStatus` 그대로. → AC-6·7
  - [ ] 2-2. (qa) 순수 함수 상태표(AC-7 11행) + 화면 테스트(로그아웃·로그인·가구·실패·손상·접근 불가·deferred 로딩 판정·401/재조회 실패 유지·30초 폴링), 금액 경계표, AC-0(a) 로그인 두 갈래 재확인, 우리 집 기존 테스트 전부 통과(diff 0 확인), 홈 container import `grep` 기록. **변이 확인**: `MaskedValue`를 `isMasked` false 고정(AC-6 `innerHTML` 단언이 실패하는지), 로그인에서 로컬 개수를 세기, 로딩 중 로컬 값을 그리기, 우리 집 카드가 `reset()` 같은 쓰기 함수를 호출(AC-0 쓰기 0회가 잡는지), 앞으로 낼 돈을 "전체 합계"로 계산.
- [ ] 3. **배포 후 실기기 확인** (리드, qa 기록)
  - [ ] 3-1. iPhone Safari·Android Chrome에서 AC-3(safe-area·키보드·시트), 카카오톡 인앱 브라우저에서 탭 줄 위치, 운영에서 옛 북마크 `…/#/` → 홈·draft 유지, 카카오 로그인 복귀 `#/listings?login=`, 공유·초대 링크 1개씩, `#/home/{planId}?view=table` 링크

의존 관계: 1-1(a) → (b) → (c) → 1-2 ∥ 1-3 → 2-1 → 2-2 → (배포) → 3. D1~D5는 ADR-031로 확정되어 바로 시작할 수 있다. 1과 2를 한 PR로 낼지 따로 낼지는 리드가 정한다(1만 먼저 배포해도 홈은 소개 카드로 완결된다).

## 다음 단계 후보

- (be, 별도 PR) 간헐 실패 고치기: `server/household/handleHousehold.d1.test.ts` "POST /api/household/leave" `expectRestored` 기대값을 `"id:이름"` 문자열 정렬이 아니라 서버와 같은 `user_id, id` 기준으로 정렬(무작위 id가 `b1`로 시작하면 실패, 실행당 약 1/128, qa 태스크 1 기록)
- 계약 단계 기능(계약·잔금·이사 체크리스트)과 홈 카드 — "찾기→계산→계약→인테리어"의 빈 칸
- 마지막 탭 기억(새 키 필요) — `#/` 북마크로 오는 사람이 계산까지 한 번 더 누르는 불편 피드백이 반복되면(ADR-031: D1 B 재검토 조건)
- 입력 중(키보드 열림) 하단 탭 숨기기 — 레이아웃 뷰포트를 줄이는 브라우저에서 128px 크롬이 키보드 위에 남는다는 피드백이 오면
- 같은 탭을 다시 누르면 맨 위로 스크롤
- 화면별 시트가 열린 동안 머리 줄·탭을 inert로(시트 상태를 `AppRoutes`로 올려야 함)
- 홈 요약 확장: 지난 지급 n건·할 일, 매물 후보 수, 편집 중 매물 이름
- 홈에 [가리기] 토글
- 계획 요약 전용 가벼운 API — 로그인 사용자의 앱 시작 `GET /api/interior-plans`(최악 약 2MB)가 부담이 될 때(ADR-031 뒤집을 조건)
- Hub 디렉터리에 ESLint `no-restricted-imports`(규제값·계산·계획 쓰기 훅 import 금지) — AC-6의 `grep` 확인을 자동화
- 넓은 화면(데스크톱) 왼쪽 내비게이션 레일(Material navigation rail)
- 웹 매니페스트(start_url `/#/`)·홈 화면 추가 아이콘
- 홈·우리 집 코드 분할(React.lazy) — 메인 청크 500KB 경고(log 태스크 1)

## 가정

- A1: 해시 라우터(`useHashRoute`)를 유지한다. 라우터 라이브러리는 들이지 않는다(ADR-004).
- A2: 대상 브라우저(iOS Safari, Chrome 108+)는 키보드가 떠도 레이아웃 뷰포트를 줄이지 않는다. 그래서 고정 탭은 키보드 뒤로 간다. `<meta name="viewport">`에 `interactive-widget`을 더하지 않는다. (실기기 확인은 태스크 3-1)
- A3: 공유받기·초대 화면에도 탭 줄을 보인다(선택 없음). 지금 상단 탭이 보이는 것과 같다(U8).
- A4: 넓은 화면에서도 탭 줄은 480px 열 가운데에 있고 바탕 띠만 창 너비다(`SummaryBar`와 같음).
- A5: 홈은 규제값으로 계산한 수치를 보이지 않는다. 그래서 홈에 규제 기준일 표시가 필요 없다.
- A6: 카드 링크는 push, 탭은 replace다. 화면 안 링크는 이력에 남고 전역 내비게이션은 남지 않는다는 지금 규칙을 따른다.
- A7: 기존 화면의 `h1`·안내 문구는 계산 화면 h1(U7) 말고는 바꾸지 않는다. 저장 목록 h1 "저장 목록"은 그대로 두고 탭 라벨만 "매물"이다(U2).
- A8: "앞으로 낼 돈"은 우리 집 요약과 같은 함수·정의를 쓴다. 계획 여러 개를 합산하지 않고 계획마다 한 줄로 보인다.
- A9: 기존 테스트 가운데 `window.location.hash = "#/"`로 정리만 하는 것은 그대로 두어도 된다(이제 홈으로 간다). 계산 화면을 기대하는 것만 기계적으로 고친다. `#/`로 시작하는 부정형 테스트는 1-1(a) 직후 감사한다.
- A10: draft는 손상 상태가 없다(스토어가 `DEFAULT_DRAFT`로 읽음). 깨진 draft는 홈에서 소개 문구로 보인다.

## 결정됨 (ADR-031)

[ADR-031](../decisions/031-platform-home.md)이 D1~D5를 확정했고, 그 "결정" 조건 1~9가 이 스펙의 AC·태스크에 반영되어 있다. 선택지·근거 전문은 ADR에 있다.

- **D1 경로 구조: A** — 홈 `#/`, 계산 `#/calculator`. 옛 `#/` 북마크는 홈에 도착하고 draft가 남아 홈 카드가 "작성 중"을 보여 준다(AC-0(b)·AC-1).
- **D2 이름: A** — 허브는 코드 `hub`(container `Mortgage/Hub`), 우리 집은 `home`·`#/home` 그대로. 화면 라벨 "홈"/"우리 집".
- **D3 [가가] 자리: A** — 전역 머리 줄(스크롤과 함께 올라감) 오른쪽. 머리 줄은 `<main>` 바깥에서 이름("모기지핏")을 가진다(AC-4).
- **D4 아이콘: A** — `lucide-react`, 아이콘 4개만, `aria-hidden` 명시 prop, 1-1 전후 `pnpm test` 시간·메인 청크 크기 기록(늘면 깊은 경로 import).
- **D5 계획 읽기: B** — 읽기 부분만 `src/hooks/`로 분리. 구조 보장은 계획에만 해당하고 매물은 `useListingSource` + 스파이 테스트로 지킨다(AC-0).

## 사용자 확인 필요

제품 목표가 갈리는 항목은 없다. 아래는 쓰는 경험을 좌우하는 **제품 기본값(사용자 확인 전 기본값)**이다. 답이 오기 전에는 이 값으로 진행한다.

- **U1 홈 카드 순서·크기**: 대출 계산(가장 크게, 맨 위) → 매물 모으기 → 우리 집 인테리어. 계약 단계 자리 표시 카드는 두지 않는다. (다른 안: 흐름 순서 그대로 매물 → 계산(크게) → 우리 집)
- **U2 하단 탭 라벨·순서**: 홈 · 계산 · 매물 · 우리 집. 저장 목록 화면 제목은 "저장 목록" 그대로. (다른 안: 탭도 "저장 목록". "홈"과 헷갈리면 우리 집 탭을 "인테리어"로)
- **U3 탭 아이콘·선택 표시**: 홈=집(`House`), 계산=계산기(`Calculator`), 매물=북마크(`Bookmark`), 우리 집=페인트 롤러(`PaintRoller`). 집 모양은 홈에 쓰므로 우리 집에는 쓰지 않는다. 선택 = 잉크색 아이콘 + 아이콘 뒤 옅은 알약 + 굵은 라벨.
- **U4 카드 소개 문구**: "매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다" / "본 매물을 저장해 자기자금·추가 비용을 비교합니다" / "계약한 집의 인테리어 예산·견적·지급을 정리합니다".
- **U5 홈 요약에 넣을 것**: 계산 = 작성 중 매매가만(규제값 계산 결과는 넣지 않음) / 매물 = 저장한 매물 수 / 우리 집 = 계획마다 이름 · 앞으로 낼 돈(최대 3줄).
- **U6 [가가] 자리**(D3 A): 모든 화면 맨 위 머리 줄 오른쪽. 머리 줄 왼쪽은 "모기지핏".
- **U7 화면 제목**: 홈 h1 "홈", 계산 화면 h1 "모기지핏" → "대출 계산"(부제 "주담대 한도·자기자금 계산기" 그대로). 브라우저 탭 제목(`<title>`)은 그대로.
- **U8 공유받기·초대 화면**: 하단 탭을 보이되 선택 없음. "취소" → 홈, "계산기로 가기" → 계산.
- **U9 홈 상태 문구**: 로딩 "불러오는 중", 실패 "불러오지 못했습니다", 손상 "저장 데이터를 확인해 주세요".
- **U10 함께 쓰는 중 표시**: 매물 카드 "함께 쓰는 목록 · 매물 n개".
- **U11 홈 가리기**: 홈에는 [가리기] 토글을 두지 않고, 저장 목록·우리 집에서 켠 설정을 따른다.
