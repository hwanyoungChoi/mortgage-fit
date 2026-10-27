# ADR-035 계정·함께 쓰기를 홈으로, 가리기는 저장 목록 토글만

- 상태: 채택
- 맥락: 사용자가 "함께 쓰는 중 표시"와 [함께 쓰기]/[나가기], 로그인/로그아웃을 매물 메뉴가 아니라 홈에 두고, 가리기는 목록에만 두고 우리 집에서는 없애 달라고 했다. 함께 쓰기는 매물과 인테리어 계획 모두에 걸리므로 계정 영역이 저장 목록에 있는 것이 어색해졌다. ADR-031 U11(홈에는 가리기 토글 없음)·platform-home AC-1·AC-7(c)·interior-planner 가리기 문장을 갱신한다. 스펙: [hub-account](../specs/hub-account.md)
- 선택지:
  - D1 로그인 복귀: A 서버가 `#/[?login=]`로 / B 저장 목록 그대로 / C 클라이언트가 홈으로 돌리기
  - D2 함께 쓰기 코드: A Hub로 옮기고 공용 조각만 전역 승격 / B 전부 전역 / C 저장 목록에 두고 홈이 import(컨테이너 간 import 금지라 불가)
  - D3 `MaskedValue`: A 저장 목록으로 내리기 / B 전역 유지
- 의견: pm(D1 A, D2 A, D3 A) / be(D1 A, 1-1 조건부) / fe(D1 A, D2 A 조건부, D3는 U6에 종속, 홈 가리기 제거는 요청 범위 밖) / qa(D1 A, D2 A, D3 A, AC-0·AC-7 조건부, U6 조건부)
- 검토 원문: [be](../reviews/20261027-2152-be-spec-hub-account.md) · [fe](../reviews/20261027-2152-fe-spec-hub-account.md) · [qa](../reviews/20261027-2152-qa-spec-hub-account.md)
- 결정: D1 A, D2 A, D3 B. 반대 없음, 반론 라운드 생략. 조건:
  1. **배포 묶음(be 4)**: 서버 복귀 주소(1-1)와 홈의 `?login=` 처리(1-2)는 같은 PR로 배포한다. be는 지금 값(`#/listings…`)으로 특성 테스트를 먼저 쓰고 통과시킨 뒤 `Location`과 기대값만 바꾼다(쿠키 이름·속성·`Max-Age` 정확히 단언, 실패는 state·초대 삭제 2개, 성공은 세션까지 3개). 테스트 도우미는 테스트 파일 안에 둔다(`server/test/harness.ts` 무변경). `listingsUrl`은 지우고 `homeUrl`로, 관련 주석도 고친다. 초대로 시작한 로그인의 취소·실패도 홈으로 간다는 행을 API 표에 추가.
  2. **코드 위치(fe 2·3)**: 함께 쓰기 시트·초대 결과는 `Hub/components/`, `useCreateHouseholdInvite`·`useRevokeHouseholdInvite`·`useLeaveHousehold`·`useLogout`은 `Hub/hooks/`(옮긴 뒤 사용처가 Hub 하나). `LinkCopyActions`와 시트 본문 스타일(`ShareSheet.module.css`의 공용 클래스)은 `src/components/`로 승격해 Hub·Listings가 같이 쓴다(복사 금지). `useEndSession`은 그대로.
  3. **가리기 범위(U6, 제품 기본값)**: 토글은 저장 목록에만. 우리 집은 버튼과 가림을 모두 없앤다(버튼만 없애면 풀 방법이 없다). 홈은 **계산 카드 매매가만 지금처럼 가리고**(읽기만), 우리 집 줄은 우리 집 화면과 같게 가리지 않는다. 그래서 `MaskedValue`는 전역에 남는다(D3 B). 우리 집에서 쓰이지 않게 되는 가리기 코드(`INTERIOR_PLAN_EXPORT_NOTICES.privacyMode`, 내보내기 가리기 조각, `PlanScreen` `privacyButton` 등)는 삭제하고 "사용처 없는 export 0"을 grep으로 확인.
  4. **놓친 문구·회귀(fe 1·5, U4)**: 옮긴 기능을 가리키는 문구를 홈 기준으로 고친다(`MortgageInvite` "저장 목록에서 [나가기]"와 링크 → 홈, `accountImportProblem`·`interiorPlanImportProblem`의 "로그아웃하면"). 로그인 착지가 홈이 되므로 **매물 이전 실패와 [다시 시도]를 홈 안내에 보인다**. 다른 화면의 세션 만료 안내에는 "홈에서 로그인" 링크를 붙인다.
  5. **안내·포커스(fe 6, qa 경계)**: 로그아웃·나가기 뒤, 시트가 열린 채 401일 때 포커스는 결과 안내 줄(또는 계정 자리)로 옮긴다. 새 동작을 시작하면 이전 결과 안내를 지운다. 로그아웃·[나가기] 진행 중 비활성. 로그아웃 자체가 401이면 세션 만료로, 네트워크 오류면 실패 줄로. 홈 세션 만료는 `listingSource`·`planSource`·홈 함께 쓰기 401을 합친다.
  6. **테스트 감사(qa C1·C2)**: AC-0 가리기 대조군은 실제 동작대로(시드 `"true"` → 끄기 `setItem "false"` → 켜기 `"true"`), 순회를 저장 목록 [가리기]로 옮기고 우리 집·표·홈 단계는 `privacy-mode` 쓰기 0. 4모드(pending 포함) 유지. 기존 테스트 감사는 `it` 단위로 R(주제 삭제)/T(이동)/I(의도된 반전)/X를 분류하고, `setItem|removeItem|clear|===` 단언 줄 수 감소가 감사표 R과 맞는지 스크립트로 확인한다. 반전 대상에 `MortgageHub.account*.test.tsx`, `parseRoute.hub.test.ts`, `AppRoutes.routes.test.tsx`를 넣는다. 새 동작 테스트는 현재 코드에서 먼저 실패함을 확인한다. ADR-032 조건 4의 "가리기 테스트는 T"는 이번 범위에서만 R을 허용하되 "가리기를 켜도 보인다" 단언으로 바꿔 쓴다.
  7. **작업 순서(fe)**: 같은 fe가 1 → 2 → 3 순서. 금액 미정 2단계(`cony/interior-tbd-amount-2`)가 main에 머지된 뒤 그 위에서 시작한다(우리 집 가리기 대조군 파일이 겹친다).
- 이유: 계정·함께 쓰기는 앱 전체 범위라 첫 화면이 자리이고(토스·YNAB Together처럼 계정 영역은 홈/설정), 로그인 입구가 홈이면 "시작한 자리로 돌아온다". 홈 계산 카드 매매가는 첫 화면이라 옆 사람에게 가장 먼저 보이므로 가림을 유지한다.
- 뒤집을 조건: 사용자가 홈에서도 가리지 않기를 원하면 홈 가림 제거 + D3 A. 저장 목록에서 함께 쓰는 중임을 모르고 지우는 일이 생기면 저장 목록에 읽기 전용 "함께 쓰는 중"(누르면 홈)을 되살린다.
- 롤백: 저장 형식 무변경. 서버 `Location` 한 줄과 화면만 되돌리면 된다.
- 검토 권장: 없음.
- 제품 기본값(사용자 확인 전): U1~U9, 특히 U3(저장 목록에 함께 쓰는 중 표시 없음)·U6(홈 계산 카드 매매가만 가림).
