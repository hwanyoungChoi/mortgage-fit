# 스펙 hub-account — fe 검토

2026-10-27 · 대상: `.cony/specs/hub-account.md` · 읽은 코드: `Hub/MortgageHub.tsx`·`Hub/components/HubAccount.tsx`, `Listings/MortgageListings.tsx`·`components/{HouseholdSheet,HouseholdInviteResult,LinkCopyActions,ShareLinkResult,HeaderNotices}.tsx`·`ShareSheet.module.css`, `Home/components/{PlanScreen,PlanTableView,…}.tsx`, `AppRoutes.tsx`, `parseRoute.ts`, `useHashRoute.ts`, `paths.ts`, `route.ts`, `useListingSource.ts`, `useOpenSheet.ts`, `Sheet.tsx`, `useLogout/useEndSession/useLeaveHousehold`, `Invite/MortgageInvite.tsx`, `server/auth/handleKakaoAuth.ts`, 테스트 목록. 작업 트리는 읽기만 했다.

## 판정: 조건부 찬성

방향(계정·함께 쓰기를 홈 한 곳에, 가리기를 저장 목록에만)은 맞고 구현할 수 있다. 태스크 1 → 2 → 3 순서도 각각 배포해도 완결된다. 다만 아래 "고쳐야 할 것" 6개가 스펙에 빠져 있다. 그대로 구현하면 화면 안내가 틀리거나(1, 2), 구조 결정이 구현 중에 다시 열린다(3, 4). 사용자가 요청하지 않은 범위가 U6에 들어 있다(5).

## 고쳐야 할 것 (스펙에 반영 요청)

1. **다른 화면 문구가 옮긴 기능을 가리킨다 (확인한 사실)**. 계정 일이 홈으로 가면 아래 문구는 틀린 안내가 된다.
   - `Invite/MortgageInvite.tsx:173` "저장 목록에서 [나가기]로 나간 뒤 이 링크를 다시 열어 주세요", 같은 화면 `PATHS.listings()` 링크 두 곳(`:162-165`, `:172-176`).
   - `Listings/accountImportProblem.ts:15` "로그아웃하면 손상된 원문을 복사할 수 있습니다"(저장 목록 안내인데 로그아웃은 홈에만 있다).
   - `Home/interiorPlanImportProblem.ts:13·26`의 "로그아웃한 뒤…", "로그아웃하면…"(우리 집 안내).
   - 스펙 범위의 "초대 화면 문구에 인테리어 계획 넣기"는 범위 밖이지만, 위 문구를 홈 기준으로 고치는 일은 범위 안이어야 한다. "홈에서 로그아웃하면…", "홈에서 [나가기]로…"로 바꾸고 초대 화면의 링크는 `PATHS.hub`로. 태스크 2-1에 한 줄 추가하고 테스트가 문구를 단언하는지 같이 본다.
2. **D2 A에 CSS가 빠졌다 (확인한 사실)**. `HouseholdSheet`·`HouseholdInviteResult`는 `ShareSheet.module.css`의 `body·notice·hint·error·primaryButton·dangerButton`을 쓴다. 이 파일은 `ShareSheet`·`ShareLinkResult`와 공유 중이다. 스펙은 "LinkCopyActions와 쓰는 스타일"만 승격한다고 쓰는데 실제로는 시트 본문 스타일 전체다. container 간 import는 금지이므로 선택지는 둘뿐이다. (a) 시트 본문 스타일을 `src/components/SheetBody.module.css` 같은 곳으로 올려 둘 다 쓴다. (b) Hub에 복사한다. 추천은 (a). `LinkCopyActions`와 이 CSS를 같이 올린다. 구현 중에 정하지 말고 D2에 적어 두자.
3. **D2의 훅 위치와 `useLogout`**. CONVENTIONS상 API 훅은 `Hub/hooks/`다. 스펙의 "`Hub/`로 간다"를 `Hub/components/`(시트·결과)와 `Hub/hooks/`(훅 3개와 테스트)로 못 박자. 같은 논리로 `useLogout`도 이제 Hub 하나만 쓴다(`grep` 결과 사용처 `MortgageListings`뿐, 옮기면 Hub뿐). 함께 쓰기 훅은 내리면서 이것만 `src/hooks`에 두면 일관성이 없다. `Hub/hooks/`로 내리는 것을 추천한다(`useEndSession`은 여러 곳이 쓰니 그대로).
4. **U6 중 홈 가리기 제거는 요청 범위 밖이다**. 요청 원문(log)은 "가리기는 목록에만 있고 인테리어에선 없애줘"다. 홈은 언급이 없다. 홈은 첫 화면이라 임장 중 옆 사람에게 가장 먼저 보이는데, 여기서 매매가와 우리 집 지출 예정을 풀면 가리기를 켠 의미가 약해진다. 홈은 이미 토글 없이 읽기만으로 가리고 있다(ADR-031 U11). 그대로 두면 변경이 줄어든다(`MortgageHub`의 prop·`MaskedValue`·`Hub` 테스트 유지, D3는 B로 `MaskedValue`가 `src/components/`에 남고 Hub와 Listings 두 container가 쓴다). 추천은 U6 대안 ①을 넘어 "홈은 지금 그대로"다. 사용자 확인이 필요한 항목이니 pm이 질문하자.
5. **로그인 직후 착지가 홈이 되면서 이전(import) 결과가 안 보인다 (추론 + 코드 확인)**. 로그인하면 `useAccountImport`가 이 기기 매물·계획을 계정으로 옮긴다. 옛 흐름은 저장 목록에 떨어져 진행 문구(`accountImport.state.status==="running"`)와 실패 + [다시 시도](`accountImportProblem`)를 바로 봤다. 새 흐름은 홈에 떨어진다. `isAccountImportSettled`는 `failed`도 끝난 것으로 보므로 홈은 정상 모양인데 카드 매물 수만 모자란다. 성공 알림은 `listingsNotice`로 메모리에 남아 한참 뒤 저장 목록을 처음 열 때 "옮겼습니다"로 뜬다. 스펙은 "다음 단계 후보"로 미뤘는데 D1 A가 만든 회귀이므로 이번 범위로 당기는 것을 권한다. 최소: 홈 안내 줄에 이전 실패 한 줄과 [다시 시도](`accountImportProblem`을 `src/lib/utils`로 올리거나 Hub로 복사, 후자는 중복이라 전자 추천). 계획 이전은 `HomeNotices`에 이미 있다. 최소한 위험으로 기록하고 사용자에게 알려야 한다.
6. **포커스가 사라지는 세 곳**. (a) [로그아웃] 누르면 버튼이 로그인 링크로 바뀌어 포커스가 body로 빠진다. (b) [나가기] 성공 시 버튼이 [함께 쓰기]로 바뀐다(옛 머리글도 같았다). (c) 시트가 열린 채 401이면 상태가 `loggedOut`이 되어 [함께 쓰기]가 사라진다. 그러면 AC-4의 "닫으면 [함께 쓰기]로 포커스 복귀"가 이 갈래에서 성립하지 않는다(`useOpenSheet.dismiss`는 `returnFocusRef.current?.focus()`뿐이다). 해법: 결과 안내 줄(`role="status"`)이나 계정 자리 컨테이너(`tabIndex=-1`)로 포커스를 옮기는 규칙 한 가지를 스펙에 쓰고 AC-1·4에 한 줄 추가. 여는 쪽은 `event.currentTarget`을 `sheet.open`에 넘긴다(우리 집 [⋯]이 하는 방식, ref 불필요).

## 결정 필요 D1~D3

- **D1 A: 찬성**. 로그인을 시작하는 입구가 이제 홈(과 공유·초대 화면)뿐이라 "시작한 자리로 돌아온다"가 성립한다. `parseRoute`·`toRoutePath`·`PATHS.listings()` 인자 삭제는 한 곳씩이고, `useHashRoute`의 정규화는 `{hub, login}` → `#/?login=…`이 해시와 같아 replace하지 않으므로 홈이 직접 지우는 구조(저장 목록 effect와 같은 패턴 `useState(login)` + `replace(PATHS.hub)`)로 충분하다. 확인할 것: 초대에서 시작한 로그인의 실패·취소도 `#/?login=…`(홈)으로 간다. 지금도 저장 목록이었으니 동작은 같지만 초대 화면으로 돌아가지 않는다는 점을 A3에 한 줄 적자. 비용 하나: 세션 만료 뒤 재로그인이 "홈 탭 → 로그인 → 매물 탭"이 된다(U4 참고).
- **D2 A: 조건부 찬성**. 위 고쳐야 할 것 2·3 조건. 지역성은 맞다(옮긴 뒤 함께 쓰기 사용처는 Hub 하나).
- **D3: U6 답에 종속**. 위 4를 받으면 B, 스펙 기본값 그대로면 A에 찬성(사용처가 저장 목록 하나가 된다).

## 기본값 U1~U9

- **U1 찬성(조건)**. 두 줄이 360px에서 들어간다(content 328px: 13px 글자 "카카오 계정에 저장 중" + 작은 버튼 하나). 한 줄 대안은 버튼 셋이라 비추천이 맞다. 조건: 두 행 모두 `min-height: 36px`로 맞추고, 글자 크기 설정(`data-text-size`)이 작아져도 `flex-wrap`으로 깨지지 않게. 확인 중 자리표시자는 같은 컴포넌트를 `isHidden`으로 그려 마크업이 같아야 한다(둘째 줄은 혼자/함께 어느 쪽이든 36px 행). 한계: 로그인 직후 첫 방문에는 `session-hint`가 아직 없어 자리표시자가 로그인 안내(문구 2줄 + 48px 링크)로 예측되고, 확인되면 두 행(약 80px)으로 줄어 카드가 밀린다. 지금도 있는 문제지만 이제 로그인 후 착지가 늘 홈이라 매 로그인마다 보인다. 리드의 360×780 확인 항목에 "첫 로그인 착지의 카드 이동 px"를 추가하자.
- **U2 찬성**. 로그아웃에서 [함께 쓰기]를 숨기는 것은 단순하다. 이유 문구에 "함께 쓸 수 있어요"가 들어가 발견성도 보완된다. 이 경우 `HouseholdSheet`의 `loggedOut` 본문은 "시트가 열린 채 401" 갈래에서만 도달한다. `status !== "loggedIn"`의 "계정 상태를 확인하는 중입니다" 갈래는 홈에서 도달 조건이 사실상 없으니 옮길 때 지운다(CLAUDE.md "쓰이지 않는 경로 삭제"). 기존 테스트의 `REASON` 문자열(`MortgageHub.accountQa.test.tsx:28`)이 바뀌므로 감사표에 넣는다.
- **U3 조건부 찬성**. 저장 목록에서 표시를 완전히 빼면 그 화면에서 고치는 것이 상대에게도 보인다는 단서가 사라진다. 삭제 확인 문구는 "'name' 매물을 삭제할까요? 되돌릴 수 없습니다."뿐이다(`handleDelete`). 대안(읽기 전용 "함께 쓰는 중", 누르면 홈)이 비용이 작고 데이터 보호 쪽이다. 사용자 확인 때 대안을 같이 묻자. 기본값대로 가면 AC-3 문구 단언을 그대로 쓴다.
- **U4 조건부 찬성**. 기본값(버튼 없음)은 세션이 끝난 순간 화면에 갈 길이 없다. 안내 줄에 `PATHS.hub`로 가는 링크 한 줄("홈에서 로그인")이면 저렴하고 로그인 복귀(D1 A)와도 맞다. 스펙이 후보로 적은 "[홈에서 로그인]"을 이번 범위로 당기길 권한다. 작은 [카카오로 로그인] 직접 링크도 되지만 어차피 홈으로 돌아오므로 이득이 적다.
- **U5 조건부 찬성**. 위 5. 나머지 분배(홈은 계정·함께 쓰기 결과, 저장 목록·우리 집은 그 화면 데이터)는 맞다.
- **U6 조건부**. 우리 집 제거는 찬성(요청 그대로, A2의 논리도 맞다: 버튼만 없애면 풀 방법이 없다). 홈 제거는 반대, 위 4.
- **U7 찬성**. 토글이 영향 범위인 저장 목록에만 남으므로 보조기기 설명이면 충분하다.
- **U8 조건부 찬성**. 시트·초대 결과·로그아웃 설명 문구는 맞다. 조건: 위 1(다른 화면 문구). 추가로 수락 화면(`MortgageInvite`)이 받는 사람에게 "내 인테리어 계획도 숨겨진다"를 알리지 않는다(A7: 수락하면 숨김). 이번 범위 밖으로 둔 것은 이해하나, 데이터가 숨겨지는 동의 화면이므로 다음 스펙 후보가 아니라 "알려진 갭"으로 기록해 두자.
- **U9 찬성**. 카드는 그대로, 변경 최소.

## 가정 A1~A7

- A1·A2·A5·A7 찬성. A2의 근거(풀 방법이 없어진다)는 코드로 확인됐다(`PlanScreen`의 토글이 유일한 해제 경로).
- A3 찬성하되 "초대 시작 로그인의 실패·취소는 홈"을 한 줄 추가.
- A4 찬성. 단 이전 결과는 위 5.
- A6 찬성. 홈의 401은 `listingSource.isSessionExpired || planSource.isSessionExpired || 홈 함께 쓰기 401`을 합쳐 쓰면 된다(두 출처 훅 모두 `isSessionExpired`를 이미 준다, 확인함).

## 구조·컨벤션

- `MortgageHub`가 시트·로그아웃·나가기·안내까지 맡으면 길어진다. 구조는 `MortgageHub`(출처·시트 상태·`inert`·레이아웃) → `HubAccount`(행) · `HubNotices`(안내 줄) · `HouseholdSheet`로 나누고, 안내 문구는 `Record` 레지스트리(`LOGIN_RESULT_MESSAGES`가 이미 이 패턴)로 둔다. `HeaderNotices`·`HomeNotices`·홈 안내 줄이 모양을 세 번 반복하는 것은 스펙이 후보로 적은 대로 이번에는 두고 사후 승격한다는 데 동의한다.
- 서버 `listingsUrl` → 홈 주소 함수 교체와 옛 함수 삭제는 맞다. `LoginResult` 타입 주석(`route.ts:1`, `paths.ts:10`, `KakaoLoginLink.tsx` 주석)의 `#/listings` 표기도 같이 고친다(스펙 1-2에 일부 있음).
- `Route.hub.login`은 `listings.login` 패턴과 같다. `TabName = Exclude<Route["name"], …>`는 영향이 없다.

## 기존 테스트 영향 (확인한 사실)

저장 목록 화면 단위 테스트는 없고(`MortgageListings.test.tsx` 없음) `AppRoutes.*` 통합 테스트가 대신한다.

- **로그인 복귀 반전**: `parseRoute.hub.test.ts`(`#/?login=failed` → 정규 `#/`, `#/listings?login=…` 3행), `AppRoutes.routes.test.tsx:86`·`:125-137`(`#/listings?login=%s` 안내 한 번). `AppRoutes.chrome.test.tsx:80`은 그대로 통과하지만 의미 없는 행이 된다(정리 권장).
- **홈 계정 반전**: `MortgageHub.account.test.tsx`("로그아웃 버튼은 홈에 두지 않는다", "계정 확인 실패: 상태 줄도 없다"), `MortgageHub.accountQa.test.tsx`(`REASON`, "링크는 카드 3개뿐" 등). AC-1이 이 단언들을 뒤집는데 스펙의 반전 감사 언급은 `platform-home` AC-1 행 하나뿐이다. AC-7 감사표에 이 파일들을 넣어 달라.
- **가리기 대조군 이동**: `AppRoutes.storageKeys.interiorSimple.test.tsx:239-244`와 `…interiorTbd.test.tsx:189-194`가 우리 집에서 [가리기]를 눌러 `privacy-mode` 쓰기를 대조한다. 버튼이 사라지면 두 파일의 순회를 "저장 목록 [가리기]"로 옮겨야 한다. 두 파일은 지금 작업 트리에서 다른 fe가 건드리는 영역이라 스펙이 정한 대로 2단계 머지 뒤에 시작해야 한다.
- **가리기 R 후보**: `MortgageHome.{lines,lineOrderQa,table,tbd,tbdQa,wonUnit}.test.tsx`의 가리기 `describe`(예: `table.test`의 `PRIVACY_NOTICE` 안내·내보내기 비활성), `MortgageHome.listingEntry.loggedIn.test.tsx:146`의 `isPrivacyMode={false}` prop. `Hub.{summary,tbd,wonUnit}.test.tsx`는 위 4를 받으면 유지.
- **로그아웃 성격 변경**: `AppRoutes.householdPlans.test.tsx`의 나가기 테스트는 홈이 `loggedIn`이 될 때까지 기다리는 `findByRole`이라 시작 해시 변경만으로 되리라 본다(추론). `useLeaveHousehold.test.tsx`는 import 경로만 바뀐다.

## 죽은 코드 (태스크 3-1에 추가)

가리기를 우리 집에서 빼면 `src/lib`에 쓰이지 않는 것이 남는다. 확인된 후보: `INTERIOR_PLAN_EXPORT_NOTICES.privacyMode`(`lib/constants/interiorPlanTable.ts:52`), `interiorPlanExportText`의 "조각" 출력(가리기용, `:37` 주석), `PlanTableView`의 `HeadingLine`/`exportNoticeOf` 가리기 분기, `PlanScreen.module.css`의 `privacyButton`, `buildInteriorPlanTable` 주석, `tbdExclusionNote`의 마스킹 호출. 3-1 완료 조건에 "사용처 없는 export가 0"을 넣고 `grep`으로 확인하자.

## 360px 배치와 화면 흐름

- 확인 화면: 로그아웃 / 로그인 혼자 / 함께 쓰는 중 / 확인 중 / 확인 실패에서 계정 자리 높이, 안내 줄이 붙을 때 카드 위치. 계정 자리 아래 안내 줄(나가기 결과)은 스크롤이 맨 위가 아니면 안 보일 수 있으나 계정 자리가 카드 위라 흔한 경우는 괜찮다.
- 결과 안내가 남아 있는 동안 다음 동작(시트 열기, 로그아웃 재시도)을 하면 이전 안내가 그대로 남는다. 새 동작을 시작할 때 이전 결과를 지우자(`logout.reset`·안내 상태 비우기).
- 끝에서 홈의 [함께 쓰기] 시트가 열린 동안 하단 탭은 `inert` 밖이다(`AppRoutes`는 글자 크기 시트만 감쌈, 저장 목록과 같은 기존 한계). 홈에서도 같은 동작이므로 새 문제는 아니다.

## 태스크 분해

- **1(계정): 조건부 찬성**. 1-1 ∥ 1-2는 계약표로 병렬이 가능하다. 서버 테스트가 지금 없다는 스펙 서술을 `server` 목록으로 확인했다. 1-2에 위 1(다른 화면 문구)과 6(포커스)을 넣자.
- **2(함께 쓰기): 조건부 찬성**. 2-1에 D2의 CSS 승격(2)·훅 위치(3)·시트 포커스(6)를 반영.
- **3(가리기): 조건부 찬성**. "파일이 겹치지 않아 병렬"은 부정확하다. U6 기본값이면 `MortgageHub.tsx`와 `AppRoutes.tsx`가 1-2·2-1과 겹친다. 위 4를 받으면 `AppRoutes.tsx`의 Home prop 한 줄만 겹친다. 같은 사람이 1 → 2 → 3 순서로 하는 편이 낫다. 1-3·2-2의 AC-0 순회는 중간 상태(우리 집 [가리기]가 아직 있음)에서 돌므로, 3-2에서 대조군을 저장 목록으로 옮기는 것까지가 한 단위라고 적어 두자.
- 리드 확인 항목 추가: (a) 첫 로그인 착지 카드 이동, (b) 세션 만료 뒤 재로그인 경로, (c) 시트가 열린 채 401 / 나가기 성공 / 로그아웃 뒤 포커스 위치.

## 리스크

- 로그인 착지가 홈으로 바뀌어 이전 실패가 숨는다(5). 데이터가 사라지지는 않지만 사용자가 모른다.
- 문구 안내가 틀린 채 남는다(1).
- 공유 CSS 처리가 구현 중에 흔들린다(2).
- 가리기 테스트 대량 삭제(R) 때 storage 단언(원문 `===`, 쓰기 0회)까지 같이 지워질 위험. AC-7이 막고 있으니 감사표를 qa가 diff로 대조.

## 확인한 사실과 추론의 구분

위 항목 중 "추론"이라고 쓴 곳(5의 성공 알림 노출 시점, householdPlans 테스트의 기계적 변경)을 뺀 나머지는 코드·테스트 파일을 직접 읽어 확인했다. 앱은 실행하지 않았다.
