# interior-budget-exclude 스펙 — fe 검토

2026-11-06

## 판정: 조건부 찬성 (D1 = A 찬성)

## 근거 (코드로 확인한 사실)

1. 한 곳 수정으로 같이 바뀐다 (확인함). `plannedTotalWon`/`doneTotalWon`/`doneCount`/`tbdCount`는 `src/lib/utils/interiorPlanRows.ts` `buildInteriorPlanRows`에서만 계산한다. 소비처를 grep으로 훑은 결과 따로 계산하는 곳이 없다.
   - `summarizeInteriorPlan`: `remainingWon`을 위 값에서 뺀다. `PlanSummary`는 그 값과 막대를 그린다. `interiorPlanExportText`는 summary를 쓴다. `summarizeHub`는 `summarizeInteriorPlan`을 부른다.
   - `buildInteriorPlanTable`의 `confirmedTotal`, `doneTotal`은 `planned+done`을 쓴다. CSV는 표 모델을 따른다.
   - 묶음 합계만 `groupConfirmedWonOf`가 따로 계산하므로 같은 파일 안에서 같이 고쳐야 한다. 스펙에 이미 있다.
2. 시트의 "고친 것" 판정은 자동으로 따라온다. `isSameLineDraft`가 `Object.keys(a)` 전체를 비교하므로 `isOnBudget`을 draft에 더하면 [저장] 활성과 닫기 확인이 코드 변경 없이 된다. AC-5 "체크만 바꿔도 활성"이 성립한다.
3. D1 A에 찬성한다. 쓰기 경로(`interiorLineWrites.ts`)가 `inputOf(item)`에서 시작하므로 항목 키는 보존된다. 확정 이동에도 값이 안 따라다닌다. 견적 키(B)는 `editedQuote` 함정이 생기고, `budgetSource`(C)는 지금 요구에 없는 추측이다. `false`를 키 없음으로 받는 규칙도 좋다.

## 사용성·화면 흐름 지적 (조건)

- C1. 홈 카드 꼬리와 요약이 어긋난다. `MortgageHub.planLineTailOf`는 `doneTotalWon > 0`일 때만 "완료"를 그린다. `PlanSummary`는 `doneCount > 0`이면 "지출 완료 0원"을 그린다. 예산 외 줄만 완료인 계획은 홈에는 안 보이고 요약에는 "0원"이 보인다. A4의 "0원 보임"이 어색하다. 요약의 "지출 완료" 행도 `doneTotalWon > 0`이거나 예산 반영 완료 줄 수로 가르는 편이 낫다. 단 표의 완료 열 조건(`doneCount`)은 그대로 둔다. 문서화하거나 `doneCount`를 반영 줄만 세는 것을 qa 확인 항목에 넣어야 한다.
- C2. 미확정 줄의 "예산 외" 글자를 정해야 한다. 스펙은 `row.isOffBudget`만으로 표시한다고 읽혀서, 미확정 줄에도 글자가 붙고 요약의 "예산 외 n원"에는 안 들어간다. 의도라면(미리 표시, U2) 설명 한 줄에 써 두거나, 확정 줄에서만 그리자고 정해야 한다. 추천은 확정·미확정 모두 그리는 것이다(시트 설명과 같다).
- C3. "예산 외 n원" 줄은 `offBudgetCount > 0`일 때만 그린다. 총 예산이 없는 상태(`budgetWon` null)에서도 보이는지 AC에 한 줄 있어야 한다. 이 상태의 요약은 분기가 따로 있다 (`renderRemaining`).
- C4. 시트 안내 문구(`ItemSheet.tsx:329`)는 스펙대로 고친다. 접근 가능한 이름(`lineNameOf`)도 같이 간다. 360px는 AC-8에 있다.
- C5. 로딩/빈/에러 상태는 새로 생기지 않는다. 기존 화면 상태를 그대로 쓰므로 누락된 상태는 없다.

## 리스크

- 낮음. 옛 탭이 키를 지우는 문제는 스펙의 새로고침 한 줄로 충분하다.
- 인쇄 표에서 확정 열 직접 SUM이 "계"와 달라지는 점은 비고로 설명한다(U7). 수용한다.
- 범위는 적절하다. 목록 세 번째 체크, 필터, 출처 이름은 범위 밖으로 둔 것이 맞다. 1·2 한 PR도 타당하다.

## 확인 못 한 것

- be 쪽 `validateInteriorItemFields`의 실제 키 복사 방식은 읽지 않았다 (ADR-029 근거를 스펙에서 인용).
