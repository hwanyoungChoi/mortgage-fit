# 인테리어 플랜 표 내보내기(태스크 5) 스펙 — fe 검토

2026-10-27 · 대상: `.cony/specs/interior-planner.md` "표 내보내기" 절, AC-11·AC-12, U13~U20, D6, A11~A17, 태스크 5-1~5-3 · 관점: 구현 가능성, 기존 코드와 맞물림, 사용성

## 판정: 조건부 찬성

- **D6은 B(세 번째 보기 `?view=table`)에 찬성한다.** 근거 두 개는 확인했다. 다만 근거 하나("화면 폭 전체를 쓴다")는 틀렸다. 아래 1번.
- **U13은 제안 기본값(대표 견적 = 확정 → 최저)에 찬성한다.** 아래 2번.
- 고칠 점 8개를 반영하면 구현을 시작해도 된다. 서버·API·저장 키 변경이 없어서 계약상 막히는 것은 없다(사용하는 건 이미 받아 둔 `plan`과 `summarizeInteriorPlan`뿐).

## 1. D6 판정: B 찬성, 근거 보정

확인한 사실(코드):

- 보기 주소 규칙은 이미 있다. `parseRoute.ts:46`은 `params.get("view") === "trade"`만 통과시키고, `paths.ts:15`는 `view === "trade"`일 때만 쿼리에 쓴다. `HomeView = "space" | "trade"`(`route.ts:5`). 값 하나를 더하는 일이고, 새로고침·뒤로 가기 유지는 그대로 따라온다.
- 보기 바꾸기는 이미 `window.location.replace`다(`MortgageHome.tsx:180`). 표 칸도 같은 경로로 들어가므로 히스토리가 쌓이지 않는다.
- A(시트)는 반대다. `Sheet.module.css`의 `.sheet`는 `max-width: 480px; max-height: 90dvh; overflow-y: auto`이고 `useOpenSheet`는 히스토리에 안 들어간다. 인쇄에서 `position: fixed`·`inert` 배경을 풀어야 하고, 시트 안에서 가로·세로 스크롤이 겹친다. 기각이 맞다.
- C(전용 라우트)는 `Route` 유니온·`parseRoute`·`PATHS`·`AppRoutes` 분기가 다 늘고, 얻는 것은 "인쇄할 때 숨길 게 적다" 하나다. 그런데 그 이득이 B에서도 거의 같다(아래 4번의 숨김 목록은 C에서도 TabNav를 숨겨야 한다). 기각이 맞다.

**틀린 근거**: D6 B의 "화면 폭 전체를 쓰며"는 지금 코드에서 성립하지 않는다. `MortgageHome.module.css`의 `.page`가 `max-width: 480px`이고 `TabNav`도 480px이라 표는 데스크톱에서도 폭 448px(패딩 뺀 값) 칸 안에 들어간다. 360px에서는 폭 328px다. 6열이 두 경우 다 가로 스크롤을 한다. 선택에는 영향이 없지만 문구는 고쳐야 한다.

- 이 앱은 모바일 우선이라 480px 칸 안의 가로 스크롤 표를 받아들이는 것이 가장 단순하다(권장).
- 데스크톱에서 넓게 보여야 한다면 표 보기일 때만 `.page`에 modifier 클래스로 `max-width`를 푸는 방법이 있다. 요청에는 없으므로 이번 범위에 넣지 않는다.

## 2. U13(견적(원) 열) 의견: 제안 기본값 찬성

- 비교용 견적을 줄로 펼치면 "계"가 부풀고 항목 = 줄 대응이 깨진다. 항목 하나 = 한 줄이 맞다.
- 견적(원) = 예상 금액(확정 → 예산) 대안은 반대한다. 견적 열에 견적이 아닌 예산이 섞이고, 업체 열과 짝이 안 맞는다(견적 0개인 줄에 금액만 있고 업체가 비는 모순).
- 감수할 것 두 가지:
  - 확정된 줄은 견적(원)과 확정(원)이 같은 값이다(AC-11의 12,500,000 / 12,500,000). 확정 열이 사실상 "확정 여부" 표시가 된다. 표 모양이 사용자 스샷이라서 괜찮다.
  - 미확정 줄의 업체 칸에는 최저 견적 업체가 들어가 "고른 업체"로 읽힐 수 있다. 비고의 "미확정"이 이를 막는다. 비고가 가려질 때(가리기)는 표 자체가 내보내기 불가라 문제없다.
- 화면에서 표 머리의 "예상 총액"(1,150만)과 "계" 견적(980만)이 다른 숫자로 나란히 보인다. 스펙이 이유를 적어 뒀고 열 이름이 다르므로 허용한다. 다만 표 머리 줄에 "예상 총액 = 확정, 없으면 예산"을 짧게 풀지는 않아도 된다(요약 카드에 이미 있다).

## 3. 근거 (최대 3개)

1. 순수 함수 입력 `summarizeInteriorPlan(plan, now).tradeGroups`가 이미 공정 순서·항목 순서·`confirmedAmount`·`overBudget`·`spaceName`(공간 없음은 null)을 준다(`summarizeInteriorPlan.ts:12-33,163`). 새로 만들 계산은 대표 견적·원 변환·비고 조립뿐이라 실현 가능성이 높다. `sortInteriorTrades`는 따로 부를 필요가 없다(`tradeGroups`가 이미 그 순서).
2. `MaskedValue`(`src/components/MaskedValue.tsx`)는 가리면 자식을 아예 렌더하지 않는다. 표 `<td>` 안에 그대로 써도 AC-12(d)의 "DOM에 값 없음"이 성립한다. 단 세부내용은 `[공간]`과 메모를 따로 줘야 하는데 스펙이 이미 그렇게 정했다.
3. `PlanScreen`은 `[항목 추가]` 줄이 목록 위 고정 자리라 그 자리에 버튼 두 개를 바꿔 넣으면 데이터 양에 따라 버튼 위치가 흔들리지 않는다(사용성 체크리스트 충족).

## 4. 고칠 점 (구현 전에 스펙에 반영하면 좋은 것)

1. **`<tfoot>`은 인쇄 때 모든 쪽 아래에 반복된다.** Chrome·Firefox 기본값이 `table-footer-group`이라, 2쪽 이상이면 1쪽 아래에도 "계"가 찍힌다. 스펙은 thead 반복만 적었다. 인쇄에서 `tfoot { display: table-row-group }`로 풀거나, "계"를 마지막 `<tbody>`의 행(`<th scope="row">계</th>`)으로 둔다. AC-12(c)에 "계는 마지막 쪽에만" 확인 항목을 더한다.
2. **인쇄 숨김 대상이 파일 5곳에 흩어져 있다.** `TabNav`(AppRoutes, 별도 모듈), `HomeNotices`, `PlanScreen`의 머리글·요약·할 일·보기 전환·버튼 줄, 그리고 `.page`의 `max-width: 480px`·패딩·`inert`. 또 플랜 이름 `h1`은 표 머리 제목과 중복이므로 숨긴다. 선택지: (a) 각 모듈에 `@media print` — 해시 클래스라 누락이 조용히 생긴다. (b) `index.css`에 전역 한 규칙 `@media print { [data-print-hidden] { display: none !important; } }`을 두고 숨길 요소에 속성을 붙인다 — 한 곳이라 확인이 쉽다. fe는 (b) + `.page`만 `MortgageHome.module.css`에서 `@media print { .page { max-width: none; padding: 0 } }`를 권한다. 스펙의 "fe가 정함" 범위 안이다.
3. **인쇄 폭은 360px 뷰포트가 아니라 용지 폭 기준이다.** 모바일 Chrome·Safari에서도 인쇄 레이아웃은 A4(약 700 CSS px)로 다시 계산된다. 그래서 화면용 `min-width`(가로 스크롤을 만드는 값)를 인쇄에서 반드시 풀어야 한다: `.tableScroll { overflow: visible }`, `.table { min-width: 0; width: 100% }`. 이걸 빠뜨리면 표가 용지보다 넓어 잘린다. AC-12(c)의 "360×780 모바일 인쇄 미리보기"는 "모바일 브라우저의 인쇄 미리보기"로 읽는다.
4. **구분 병합은 구분당 `<tbody>` 하나로.** `<tbody>` 하나가 한 공종이면 `rowSpan` 구분 셀을 `<th scope="rowgroup" rowSpan>`로 쓸 수 있고(접근성), `break-inside: avoid`를 tbody에 걸어 병합 셀이 쪽 경계에 걸리는 A17을 대부분 없앨 수 있다. 다만 tbody 단위 avoid는 브라우저 지원이 균일하지 않다(Chromium 91+ 외에는 확인하지 못했다) — tr 단위 avoid는 그대로 두고 tbody는 "되면 좋음"으로 둔다. A17 허용 문구는 유지한다.
5. **가로 스크롤 영역은 키보드·보조기기가 닿아야 한다.** 스크롤 컨테이너에 `tabIndex={0}`, `role="region"`, `aria-label="계획 표"`를 준다. 6열 최소 폭(약 560~640px 추정, 확인 안 함)은 구현에서 정하고 `white-space: nowrap`·`font-variant-numeric: tabular-nums`는 금액 열에만 둔다. 가로로 더 있다는 표시가 없으면 사용자가 잘린 줄 모른다 — 최소한 오른쪽 열(비고)이 반쯤 걸려 보이게 폭을 정하거나 가장자리 그림자를 단다. 구분 열 고정은 스펙대로 다음 단계(rowSpan 셀에 sticky를 걸면 브라우저마다 어긋난다).
6. **`HomeView`에 `"table"`을 더하면 `ItemGroups`·`ItemRow`의 `view: HomeView`가 거짓말이 된다.** 두 컴포넌트는 `space`/`trade`만 다룬다. `ListView = Exclude<HomeView, "table">`로 좁히고 `PlanScreen`이 table이 아닐 때만 `ItemGroups`를 그리게 하면 타입이 분기를 강제한다. `parseRoute`는 `params.get("view") === "trade"` 비교를 허용 값 목록(`isOneOf` 유틸이 이미 `src/lib/utils/isOneOf.ts`에 있다)으로, `paths.ts`는 `view === "trade"`를 `view !== undefined && view !== "space"`로 바꾼다. 기존 `parseRoute.home.test.ts`에 `table` 왕복과 모르는 값을 더한다. `MortgageHome.tsx:158` 매물 진입 replace도 같은 `view`를 넘기므로 table이 보존된다(확인함).
7. **함수 시그니처를 스펙에 못 박는다.** 5-2(qa)가 "5-1 시그니처 커밋 직후 병렬"로 일하려면 5-1이 먼저 타입을 정해야 한다. 제안: `buildInteriorPlanTable(tradeGroups) → { groups: { trade: string; rows: TableRow[] }[]; totals: { quoteWon: number; confirmedWon: number } }`, `TableRow = { vendor; spaceLabel; quoteMemo; quoteWon: number | null; confirmedWon: number | null; note }`(가리기 때문에 `spaceLabel`과 `quoteMemo`는 분리, `note`는 통째로 가림). 표 머리 문구와 파일 이름은 `plan.name`·`summary`·날짜를 받는 별도 함수로 둔다(`buildInteriorPlanTable`에 섞지 않는다). CSV는 `toCsv(rows: string[][])`(범용, 주입 접두 포함)와 표 → 행 변환(`interiorPlanTableToCsvRows`)을 분리해야 `toCsv` 테스트가 도메인 없이 된다. 스펙 5-1 문장은 `buildInteriorPlanTable.ts` 안에 "CSV 행, 파일 이름"까지 넣었는데 한 파일에 책임이 셋이다.
8. **`downloadTextFile` 세부.**
   - `URL.revokeObjectURL`을 `click()` 바로 뒤에 부르면 일부 브라우저(특히 Safari 계열)에서 다운로드가 끊긴다. 지연 해제(`setTimeout`, FileSaver.js는 40초)로 하고, 스펙의 "클릭 → revoke" 문장을 "클릭 후 지연 해제"로 고친다.
   - 앵커는 `document.body`에 붙였다 떼는 쪽이 안전하다.
   - 파일 이름의 UTF-8 한글·공백은 `download` 속성이 그대로 처리한다.

## 5. 라이브러리 확인

CLAUDE.md의 "설치된 의존성부터" 규칙에 따라 확인했다. `dayjs`·`papaparse`는 설치돼 있지 않다. 날짜는 기존 `toLocalDateString`(`summarizeInteriorPlan.ts:70`)을 쓰는 스펙이 프로젝트 기존 방식과 맞다. CSV는 직접 쓰는 이스케이프가 열다섯 줄 안팎이라 `papaparse`(`unparse`의 `escapeFormulae`)를 새로 들일 만큼은 아니다. 전각 문자(`＝＋－＠`) 처리와 BOM은 어차피 직접 붙여야 한다. 스펙에 "Papa Parse를 검토했고 전각·BOM 때문에 직접 구현"이라고 한 줄 남겨 두면 기록이 완성된다.

## 6. 리스크

- **인앱 브라우저(카카오톡)**: 확인하지 못했다. 추론: Android WebView와 iOS WKWebView에서 `window.print()`는 앱이 지원하지 않으면 아무 반응이 없을 수 있고, `blob:` URL `<a download>`는 무시되거나 현재 탭을 blob 주소로 이동시킬 수 있다. 이 앱은 카카오 로그인·공유 링크(`#/share/…`)로 카카오톡에서 열릴 가능성이 높으므로 A13을 "나중에 확인"으로만 두기엔 위험이 크다. 실패는 감지할 수 없어서 버튼이 조용히 아무 일도 안 한다. 싼 대응: 버튼 줄 아래 한 줄 고정 안내("내려받기·인쇄가 안 되면 Safari·Chrome에서 열어 주세요"). 안내 문구는 5-3 결과를 보고 확정해도 된다(UA 감지는 추측성 추상화라 권하지 않는다).
- **iOS Safari**: `<a download>`는 iOS 13 이후 동작한다고 알고 있으나 이 환경에서 확인하지 못했다. `window.print()`는 PDF 저장이 공유 시트를 거치는 흐름이다. 5-3 확인 항목이 맞다. `navigator.share({ files })` 폴백은 이번 범위에 넣지 않는다(실측 후 다음 PR).
- **jsdom 테스트 함정(qa에 전달)**: (a) jsdom 30에서 `URL.createObjectURL`은 정의돼 있지 않다(확인함) — 테스트는 스텁이 필요하고, 앵커 `click()`은 내비게이션 미구현 경고를 내므로 `HTMLAnchorElement.prototype.click`도 스파이한다. (b) `Blob.text()`는 UTF-8 디코딩 때 BOM을 벗긴다(확인함: `text()`는 `"a"`, `arrayBuffer()`는 `EF BB BF`로 시작). AC-12(a)의 "바이트 단위로 같다"는 `arrayBuffer()`로 비교해야 한다. `text()`로 비교하면 BOM 삭제 변이가 살아남는다.
- **표 보기 첫 화면**: 360px에서 머리글·요약·할 일·보기 전환·버튼 줄을 지나야 표가 보인다. 스펙은 "요약·할 일은 그대로 위에"라고 했다. 표 보기에서만 `PlanTodos`를 빼면 표가 한 화면 가까이 올라온다(할 일은 항목 시트를 여는 용도라 표와 관계가 적다). 요청에 없던 변경이라 사용자 확인(U) 감이므로 필수가 아니라 권고다.
- **표는 읽기 전용**: 표에서 오타를 보고 고치려면 보기를 바꿔야 한다. v1로 허용한다. 줄을 눌러 시트를 열면 표 의미(`rowSpan`)·인쇄와 충돌한다.
- **가리기 중 내보내기 막기**: 버튼 `disabled`만 믿지 않고 핸들러에서도 `isPrivacyMode`면 즉시 반환한다(AC-12(d)의 "호출 0회" 단언을 핸들러 쪽에서도 만족).

## 7. 범위

과다하지 않다. 추가되는 단위는 순수 함수 3~4개, `PlanTable`(+행 컴포넌트) 1개, 라우트 값 1개, 다운로드 함수 1개다. 줄이자고 할 항목은 없다. 단 수식 주입 `'` 접두는 보안 쪽 선택으로 이미 문서화돼 있고(A16), 메모가 `- ` 글머리로 시작하는 사용자가 있을 수 있다는 점(비고의 첫 조각이 항목 메모라서 비고 열에서 `'-`가 보일 가능성)만 5-3의 엑셀 확인에 넣어 둔다.

## 8. 계약에 없는 API / 결정 필요

- 계약에 없는 API: 없음.
- 결정 필요: D6은 B로 확정해도 된다(위 근거). 표 보기에서 `PlanTodos`를 숨길지는 사용자 확인 후보(필수 아님).
