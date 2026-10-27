# interior-tbd-amount 스펙 — fe 검토

2026-10-27 · 대상: `.cony/specs/interior-tbd-amount.md` (미커밋) · 체크아웃: `cony/home-login-swap` (HEAD c897519)

## 판정

- **D1: 조건부 찬성 C** (A 반대, B는 시나리오 1·2를 못 채워 반대에 동의)
- 스펙 전체(U1~U6 기본값 포함): **조건부 찬성**. 화면 쪽은 실현 가능하고 단순하다. 아래 조건 1~9를 스펙에 넣으면 된다.

## 근거 (확인한 사실)

1. **읽기 경로가 좁다.** `quote.amount`를 숫자로 읽는 비테스트 코드는 5곳이다.
   - `interiorPlanRows.ts:79`는 이미 `?? 0`이라 계산이 바로 된다.
   - `LineRow.tsx:79`(`formatManwon(quote.amount)`)와 `buildInteriorPlanTable.ts:40-41`(`toWon(quote.amount)`)은 `amount?`로 바꾸면 타입 오류로 잡힌다.
   - `interiorLineDraft.ts:40`(`String(quote.amount)`)은 `String()`이 아무 값이나 받아 **타입 오류가 안 난다.** 그대로 두면 시트에 글자 "undefined"가 들어간다. 스펙의 "타입 오류가 fe가 고칠 곳 목록"에서 빠지는 곳이다(조건 1).
   - `interiorLineWrites.ts:41`은 1단계에서는 숫자라 그대로 컴파일된다.
2. **쓰기 함수는 이미 키 보존 구조다.** `inputOf(item)`에서 시작하므로 확정 토글·삭제·형제 견적 수정은 금액 없는 견적을 건드리지 않는다. 다만 비우기에는 함정이 있다(조건 3).
3. **옛 탭 위험 설명(A3)은 코드와 맞다.** 정적 번들이고 서비스 워커·캐시 헤더 설정이 없다(`public/`에는 favicon만 있다). 열려 있는 탭은 새로고침 전까지 옛 코드다. C의 2단계 배포는 이 위험을 줄이는 올바른 방향이다.

## 다른 fe의 진행 작업과 겹치는 곳

현재 작업 트리 상태: 수정 `MortgageHub.tsx`, `MortgageHub.test.tsx`, 신규 `HubAccount.tsx`·`HubAccount.module.css`·`MortgageHub.account.test.tsx`.

- **`LineRow.tsx`**: 작업 트리에 변경이 없고, 세부내용·업체 자리 바꾸기는 이미 HEAD(c897519)에 들어 있다. 문제는 **스펙 브랜치 `cony/interior-tbd-amount`가 746c551 위에서 갈라져 c897519를 갖고 있지 않다는 것**이다(merge-base 746c551).
  - 그대로 작업하면 LineRow의 첫 줄·둘째 줄 분기(`isDetailFirst`)를 낡은 모양에서 고치고 나중에 충돌한다.
  - 우리가 건드리는 곳은 금액 `<span>`(78-80행)과 SR 안내문(96행)뿐이다. 자리 바꾸기와 겹치는 줄은 거의 없어 rebase 충돌은 작다. 그래도 **c897519(또는 그 PR이 main에 머지된 뒤)를 기준으로 시작**해야 한다(조건 8).
- **`MortgageHub.tsx`**: 저쪽은 import와 `<HubAccount …/>` 한 줄(73행)을 더한다. 우리는 우리 집 카드 `renderSummary`(108-115행)를 고친다. 다른 hunk라 텍스트 충돌은 거의 없다.
  - `MortgageHub.test.tsx`는 저쪽이 이미 수정 중이다. 허브 미정 단언은 거기에 더하지 말고 `summarizeHub.test.ts`와 새 파일로 둔다(`MortgageHub.account.test.tsx`와 같은 방식).
  - `summarizeHub.ts`는 저쪽이 건드리지 않는다. `HubPlanLine`에 건수 필드를 더하는 것은 안전하다.
- 그 밖의 대상 파일(`interiorPlanRows`·`buildInteriorPlanTable`·`interiorPlanExportText`·`interiorPlanTableToCsvRows`·`PlanSummary`·`PlanTable`·`ItemSheet`·`interiorLineDraft`·`interiorLineWrites`)은 저쪽 작업과 겹치지 않는다.

## 구현 쪽 구체 사항 (스펙에 반영하면 좋은 것)

- **계산**: `InteriorPlanRows`와 `InteriorPlanSummary`에 확정 미정 건수 하나를 더한다. `summarizeHub`는 이미 `summarizeInteriorPlan`을 거치므로 허브가 따로 세지 않는다(U7 "홈이 따로 계산하지 않는다" 유지).
- **표 모델**: 지금 `quoteWon: number | undefined`는 "견적 없는 줄"과 "미정"을 구분하지 못한다. 미정 표시를 `quoteWon`에 문자열로 섞기보다 `number | "미정" | undefined` 같은 한 타입으로 두고 상수는 `lib/constants/interiorPlanTable.ts`에 모은다. `AmountCell`(`PlanTable.tsx`)과 `toWonField`(CSV)가 같은 값을 쓴다. 표·CSV의 "미정" 글자가 서로 다르게 쓰이지 않게 한 곳이어야 한다.
- **표 머리**: `interiorPlanTableHeading`의 `plannedTotal` 조각에 "(금액 미정 n건 제외)"를 붙이면 가리기(조각 단위 마스킹, `HeadingLine`)가 그대로 맞는다. 조각 하나라서 U6와도 일치한다.
- **시트 안내**: `AmountInput`은 이미 힌트 줄("만원 단위로 입력")이 있고 전역 공통 컴포넌트다. "비워 두면 미정" 안내를 위해 props를 늘리지 말고, 다른 선택 칸과 같은 관례로 **라벨을 "견적(비우면 미정)"**처럼 쓴다("세부내용(선택)"·"비고(선택)"과 같은 방식).
- **360px**:
  - 목록: "미정"은 금액보다 짧고 `.amount`가 nowrap이라 넘치지 않는다. 색은 새 토큰을 만들지 말고 기존 `--color-text-muted`(#636363, 흰 배경 대비 약 5.9:1)를 쓴다.
  - 요약: "금액 미정 n건 제외"는 두 항목(남은 예산·지출 예정)을 담은 headline **아래 전체 폭 한 줄**로 둔다. 한 칸 아래에 붙이면 좁은 폭에서 두 칸 높이가 어긋난다.
  - 허브: `.planLine`은 `display:block`이고 줄바꿈을 허용해 "이름 · 지출 예정 12억 5,000만원 · 미정 12건"이 길어져도 넘치지 않는다. 이름이 40자까지 가능하므로 360px에서 두 줄이 되는 경우를 수동 확인에 넣는다.

## 리스크

- **R1 (D1) 24시간은 약한 근거다.** 휴대폰 탭은 며칠씩 남는다. 접속 통계가 없다(A4). 사용자가 두 사람이니 시간 대신(또는 시간과 함께) "두 기기에서 앱을 새로 열었다"는 사용자 확인을 게이트로 쓰는 쪽이 실제로 더 확실하다.
- **R2 1단계 배포로 실제 미정 줄을 만들 길이 없다.** 1단계 기간에는 시트로 미정을 만들 수 없어 읽기 경로는 fixture 테스트로만 검증된다. 허용할 만하다. 대신 qa 수동 확인(1단계 탭·2단계 탭 병행)이 유일한 실검증이므로 빠지면 안 된다.
- **R3 U1(빈칸=미정)의 실수 가능성.** 지금은 금액을 안 적으면 오류가 막아 주는데, 이제 [줄 추가]에서 금액을 깜빡해도 조용히 미정 줄이 된다. 확정 줄에서 금액을 지우면 지출 예정이 줄어든다. 완화책은 이미 스펙에 있는 "금액 미정 n건 제외" 표기와 라벨 안내다. 사용자 확인이 필요한 U1 기본값에 이 점을 알리는 것으로 충분하다.
- **R4 빈 줄(`견적 없음`)과 미정 줄의 두 가지 "금액 없음" 표현.** 업체를 모르면 "견적 없음", 업체는 알고 금액을 모르면 "미정"이다. 사용자가 헷갈릴 수 있으나 A1이 이 구분을 의도적으로 둔다. 문구가 다르므로 수용한다.

## 스펙에 넣을 조건

1. 1-2에 **`toInteriorLineDraft`가 `quote.amount === undefined`일 때 `""`로 만들기**를 명시한다(`String(undefined)` 함정, 타입 오류로 안 걸린다). `ItemSheet`가 미정 줄을 열 때 견적 칸이 비어 있어야 한다는 AC를 1단계 AC에 더한다(지금은 1-2 문장뿐이다).
2. 1단계에서는 `LineRow`의 미정 줄 확정 체크와 `useLineConfirmToggle`이 이미 정상 동작해야 한다(`row.quote !== null`만 본다). 1단계 테스트에 포함한다.
3. 2단계 `editedQuote`: 지금 코드는 `{...rest, vendor, amount}`인데 `rest`가 **기존 견적의 `amount` 키를 그대로 펼친다**(Omit은 타입일 뿐이다). `amount`가 없을 때 `amount: undefined`를 덮어쓰기만 하면 키가 남는다. `memo`처럼 `amount`도 구조 분해로 뺀 뒤 값이 있을 때만 다시 넣는다고 명시한다. AC-0(c) "금액 있는 줄을 비우고 저장 → 키 삭제"가 이것을 잡는다.
4. 가리기 문구를 하나로 정한다. 지금 U6 "허브의 '미정 n건'도 가린다"와 AC-4 "가리기를 켜면 '우리 집 · 지출 예정 •••가려짐'"은 서로 다른 표시로 읽힌다(조각을 따로 가리면 •••가 둘이 된다). **가리기 중에는 미정 조각을 통째로 뺀다(구분자 포함)**고 정하는 쪽을 추천한다. 요약의 "금액 미정 n건 제외" 문장도 같은 방식으로 뺀다.
5. 표의 "미정"은 `MaskedValue`로 가리고(금액 칸과 같다), 컨테이너 `innerHTML`에 "미정"이 없다는 AC-4 단언은 허브·요약·표·목록 네 곳 모두에서 확인한다.
6. 2단계 문구 정리: `LineRow`의 견적 없는 줄 확정 안내 "줄을 열어 업체와 견적을 적으세요"는 견적이 선택이 되면 "업체를 적으세요"로 바꾸고(96행), 그 문구를 단언하는 테스트도 함께 고친다. 스펙 AC-2에 문구 변경을 한 줄 더한다.
7. 요약 문구 배치(headline 아래 전체 폭 한 줄)와 허브 360px 두 줄 경우를 qa 수동 확인에 넣는다.
8. **기준 브랜치**: 구현은 c897519(LineRow 자리 바꾸기)와 허브 로그인 작업(HubAccount)이 main에 들어온 뒤 갈라진 브랜치에서 시작한다. 불가하면 `cony/interior-tbd-amount`를 먼저 rebase한다. 허브 미정 테스트는 `MortgageHub.test.tsx`가 아니라 `summarizeHub.test.ts`와 새 파일에 둔다.
9. D1 게이트(AC-0(e))에 "배포 24시간 경과 **그리고** 사용자가 두 기기를 새로 열었다고 확인"을 병기한다. 롤백 하한 ADR 기록은 그대로 둔다.

## D1 요약

- A 반대: 배포 순간 열려 있던 모든 탭이 위험하고, 비용(배포 한 번 대기)이 작아 줄일 이유가 충분하다.
- B 반대: 업체를 저장할 곳이 없어 시나리오 1·2를 채우지 못한다.
- C 조건부 찬성: 코드상 1단계(읽기·표시)와 2단계(시트 비우기)가 깔끔하게 갈린다. 1단계는 `interiorLineDraft`와 `interiorLineWrites`를 안 건드려도 되고, 2단계의 fe 작업은 `interiorLineDraft`·`editedQuote`·라벨·문구 몇 줄로 작다. 위 조건 1·3·9를 넣으면 찬성한다.

## 확인한 사실과 추론의 구분

- 확인한 사실: 위 코드 인용 줄 번호, 브랜치 갈라진 지점(746c551), 작업 트리 변경 목록, 서비스 워커 없음, 색 토큰 값.
- 추론: 휴대폰 탭이 며칠 남는다는 것, 허브 문구가 360px에서 두 줄이 될 수 있다는 것, 가리기 문구 해석 차이. 실제 화면 확인은 하지 않았다(검토 모드).
