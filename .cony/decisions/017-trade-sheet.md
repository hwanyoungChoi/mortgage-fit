# ADR-017 실거래가와 붙여넣기는 계산 화면의 시트, 공통 Sheet 프레임, 조회 상태는 draft와 분리

- 상태: 채택
- 맥락: 새 화면 위치(D8)와 상태 위치. 시트가 3개로 늘어난다.
- 선택지: A 계산 화면 안 시트(라우트 2개 유지) / B 새 탭·라우트
- 의견: planner(A) / client-dev(조건부 찬성: 공통 Sheet 프레임 추출, 열린 시트 상태 하나, 시트 높이·행 2줄, 뒤로 가기 결정, 시군구·단지명 기억은 draft와 분리) / tester(조회 상태 수명 정의 요구)
- 검토 원문: [backend-dev](../reviews/spec-ltv-options-and-import-backend-dev.md) · [client-dev](../reviews/spec-ltv-options-and-import-client-dev.md) · [tester](../reviews/spec-ltv-options-and-import-tester.md)
- 결정: A. SaveSheet에서 공통 Sheet 프레임(backdrop·Esc·포커스 복귀·inert)을 먼저 추출하고 열린 시트는 useState<"save"|"paste"|"trades"|null> 하나로 관리. 시트는 히스토리에 넣지 않는다(저장 시트와 같음). 실거래가 조회 기억(시군구 코드)은 별도 키 loan-calculator/trade-lookup에 두고 draft는 customLtvRate만 늘린다. 단지명 필터는 시트의 제출된 파라미터 상태이고 새 계산·매물 열기에서 비운다. 붙여넣기 적용은 새 매물 계산으로 보고 kbPrice를 비우고 listingId를 해제한다. 미리보기는 입력 즉시 갱신.
- 이유: ADR-004 라우트 2개를 유지하고, draft 통째 교체(listingToDraft)가 조회 기억을 지우지 않게 한다.
- 뒤집을 조건: 실거래가 시트에서 뒤로 가기로 앱을 벗어나는 문제가 실제로 반복될 때(그때 히스토리 항목 추가).

## 개정 (2026-10-27, 뒤집을 조건 충족)

- 사용자가 "세부내용 쓰다가 뒤로가기하면 … 메인으로 간당"을 버그로 알렸다(뒤집을 조건 "뒤로 가기로 앱을 벗어나는 문제" 충족). 이제 **시트를 열면 같은 주소로 이력을 하나 쌓고, 브라우저 뒤로 가기는 시트만 닫는다**(Android 뒤로 가기 = 모달 닫기 관례). [닫기]·Esc·저장으로 닫으면 쌓은 이력을 되돌려 이력이 남지 않는다. 고친 내용이 있는 시트는 뒤로 가기에도 같은 확인을 거치고, 취소하면 이력을 다시 쌓는다. 공용 `useOpenSheet`·`Sheet`에서 처리해 모든 시트가 같다(fe 8987159).
- 예외: 매물 카드 `#/home?listing=`로 들어와 자동으로 열리는 만들기 시트는 이력을 쌓지 않는다(카드 이동이 이미 이력 하나, `openFromAddress`). 뒤로 가기는 저장 목록으로.
- 남은 위험(추론, 실기기 확인 필요): 시트가 열린 채 새로고침·페이지 전체 이동(카카오 로그인) 뒤에는 같은 주소 이력이 하나 남아 뒤로 가기 한 번이 지나갈 수 있다.
