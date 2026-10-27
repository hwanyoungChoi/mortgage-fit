# interior-simple 스펙 — fe 검토

2026-10-27 · 대상: `.cony/specs/interior-simple.md` (브랜치 `cony/interior-simple`) · 읽은 코드: `containers/Mortgage/Home/**`, `Hub/**`, `hooks/useInteriorPlanSource.ts`, `lib/utils/{validateInteriorPlan,interiorPlanStorage,interiorItemConflict,summarizeInteriorPlan,buildInteriorPlanTable,parseRoute}.ts`, `lib/constants/{interiorPlan,paths}.ts`, `AppRoutes.storageKeys*.test.tsx`

## 판정: 조건부 찬성

- D1 A: **찬성**
- D2 (태스크 1 a / 태스크 2 b): **조건부 찬성** (태스크 1 a는 찬성, 태스크 2 b는 조건 붙임)
- 전체 스펙: 방향과 층 쌓기 순서는 맞다. 아래 "스펙에 넣을 조건" 중 C1~C4는 AC가 지금 문장대로는 지킬 수 없거나 사용자 데이터가 조용히 지워지는 곳이라 머지 전에 스펙을 고쳐야 한다.

## 근거 (확인한 사실)

### 1. D1 A는 기존 쓰기 훅에 그대로 맞는다 (숨은 값 보존 쓰기 함수 설계 확인)

- `InteriorPlanSource.updateItem(planId, itemId, input: InteriorItemInput, openedUpdatedAt)` (`hooks/useInteriorPlanSource.ts`)은 **항목 전체 교체**다. 로컬은 `interiorPlanStorage.ts:251-260`이 `validateInteriorItemFields(input)` 결과로 항목을 통째로 바꾸고 `createdAt`만 남긴다. 서버 훅 `useUpdateInteriorItem`도 PUT `{ item }` 전체다. 그래서 "원래 항목에서 바꾼 칸만 다르게 해 전체를 돌려보내는" 순수 함수 `(item, 변경) => InteriorItemInput`이면 새 훅·시그니처 변경 없이 맞는다.
- 목록의 `InteriorItem`은 이미 `parseInteriorItem`/`parseInteriorPlanWithItems`를 거친 값(알려진 키만, 문자열 trim, 빈 배열 키 없음)이다(`useInteriorPlanList.ts:4,17`, `useUpdateInteriorItem.ts`). 쓰기 입력을 `const { id, createdAt, updatedAt, ...input } = item`에서 시작해 바꿀 칸만 덮으면 `validateInteriorItemFields(input)`과 deep equal이 되는 구조다. AC-0(c)의 "입력 = 검증 결과 deep equal"은 이 방식에서 자연히 성립하고 테스트하기 쉽다.
- 로컬 스토어는 쓰기마다 저장소를 다시 읽어 **그 항목만** 바꾼다(`writeItem`, `:156-172`). 다른 탭이 고친 다른 항목은 안 지워진다. 서버는 항목 단위 PUT이다. A5(옛 번들과의 공존)도 이 단위 덕분에 성립한다.
- `addItem`은 로컬이 `INTERIOR_ITEM_MAX_COUNT`에서 `limit`, 서버 400은 `toWriteFailure(isCreate=true)`가 `limit`으로 바꾼다. 줄 추가 100개 상한 문구(`ITEM_LIMIT_MESSAGE`)가 그대로 맞는다.
- B(새 필드)는 스펙이 쓴 대로 `parseInteriorPlans`가 모르는 키를 버린 뒤 어떤 쓰기든 다시 쓰므로 옛 탭이 새 값을 지운다. C는 가구 범위·batch·이전을 다시 만들어야 한다. A가 이 프로젝트 CLAUDE.md의 "가장 단순한 구현"과 "하위 호환 레이어 금지"에 모두 맞다.
- 한계(스펙이 이미 인정한 것): `confirmedQuoteId`가 항목당 하나라 옛 다견적 항목은 줄마다 독립 확정이 안 된다(D2).

### 2. D2: 태스크 1은 a, 태스크 2의 b는 조건부

- a는 확정 토글이 `updateItem` 한 번으로 끝난다. 합계는 "보이는 체크의 합"이라 돈 계산이 틀리지 않는다.
- b는 `addItem` → `updateItem(X)` 두 번의 쓰기다. 서버에 트랜잭션이 없고(스펙도 인정) 중간 실패는 중복으로 남는다. 이건 사실상 **쓰기 경로에 숨은 지연 마이그레이션**이다. CLAUDE.md의 "마이그레이션을 덧붙이지 않는다"와 긴장이 있다(c보다는 약하다: 사용자가 건드린 항목 하나에만 일어난다).
- b는 UX 부작용이 둘 있다. (1) 체크 한 번에 그 줄이 묶음 안 맨 끝으로 점프한다(새 `createdAt`). 누른 줄이 사라졌다 나타나 놀란다. (2) 계획 100개 상한에 가까우면 `addItem`이 `limit`으로 막혀 옛 다견적 줄은 체크도 못 한다. 둘 다 스펙에 없다.
- 그래서 b는 "옛 다견적 항목이 실제로 있는가"를 확인한 뒤에만 하는 것이 맞다. 스펙이 이미 A2에서 "옛 계획이 많지 않다"고 했다. 사용자 데이터를 아는 사람이 "있다/없다"로 답하면 된다. 없으면 태스크 2는 빼고 a로 끝(+ C5의 안내)이 가장 단순하다.

### 3. 지울 범위와 기존 코드의 충돌

- `Home/components`에서 새 화면이 이어 쓰는 것: `CorruptPlansNotice`, `HomeEmpty`, `HomeNotices`, `PlanPicker`, `PlanSettingsSheet`, `CreatePlanSheet`(수정), `PlanTable`·`PlanTableView`(줄 모델로 수정), `EmptyItems`, `SheetForm.module.css`. 지울 것은 스펙 목록과 맞다(`SpacesSheet`, `ProcessSheet`, `PlanTodos`, `ItemGroups`, `ItemRow`, `QuoteRow`, `PaymentRow`).
- `ItemSheet`(536줄)는 삭제하고 새로 만들기보다 **같은 파일을 줄 시트로 고쳐 쓰는** 편이 낫다. 열 때 한 번만 읽는 초기값, 고친 내용 없으면 저장 막기, 닫을 때 `window.confirm`, `isInteriorItemEditConflict` 경고와 [최신 값 불러오기](`itemSheetVersion` key), `flushSync` 포커스, 첫 오류 칸 포커스가 이미 검토된 코드다. 스펙의 "ItemSheet 삭제"는 "교체"로 바꾸는 것이 안전하다.
- 라우트: `HomeView`는 `"space"|"trade"|"table"`이고 `PATHS.home`은 `"space"`를 쿼리에서 뺀다(`paths.ts:17`), `parseRoute`는 `HOME_VIEW_QUERY_VALUES = ["trade","table"]`(`:12`). `HomeView = "list"|"table"`, 허용 값 `["table"]`, `PATHS.home`은 `"list"`를 뺀다로 고치면 끝이다. 옛 `?view=trade|space`는 허용 목록 밖이라 `useHashRoute`가 정규 경로로 replace한다(스펙의 AC-6과 일치). `ListView` 타입은 삭제한다.
- `summarizeInteriorPlan`의 `now`는 "지남" 판단용이라 삭제가 맞다. 대신 `PlanScreen`의 `new Date()`는 표 머리·파일 이름용 `today` 때문에 남는다. `toLocalDateString`은 요약 파일이 사라져도 남아야 한다(이동 필요). `summarizeHub`의 `now` 입력(`summarizeHub.ts`, `MortgageHub.tsx:66`)도 쓰는 곳이 없어지니 같이 삭제한다. 태스크 1-3 설명에 넣을 것.
- `lib/constants/interiorPlan.ts`는 `validateInteriorPlan.ts`가 import해서 **서버 번들의 전이 의존**이다. `INTERIOR_TRADES`, `INTERIOR_PROCESS_*`, `INTERIOR_ITEM_STATUS_LABELS`, `INTERIOR_PAYMENT_LABEL_PRESETS`를 지우면 그 파일과 `types/interiorPlan.ts`가 바뀐다. 스펙의 AC-0(a) diff 명령에 이 파일이 빠져 있다.
- 허브: `HubPlanLine.upcomingTotal`을 `plannedTotal`(지출 예정)로 바꾸고 `MortgageHub.tsx:109-111`의 "앞으로 낼 돈" 문구를 고친다. 허브 규칙(가리기, 상태 줄)은 건드리지 않는다.

### 4. AC가 지금 문장으로는 지킬 수 없는 곳

- AC-0(b)·(e), 1-4는 `AppRoutes.storageKeys*` 테스트가 "그대로 통과", `diff 0`이라 한다. 그런데 이 테스트들은 UI를 직접 몬다: `AppRoutes.storageKeys.test.tsx:168-181`, `AppRoutes.storageKeys.loggedIn.test.tsx:135-136`은 `"항목 추가"` 버튼과 다이얼로그, `"공종 고르기"`, `"예산(선택)"`, `"전체 도배 열기"`를 쓰고, `AppRoutes.storageKeys.hub.test.tsx:181-191`은 `"앞으로 낼 돈 1,250만원"`을 기대한다. 스펙이 이 UI를 지우므로 diff 0은 불가능하다. 지켜야 할 것은 "쓰기 0회·원문 `===`·새 키 없음" assertion이지 UI 조작 줄이 아니다. `MortgageHome.listingEntry*.test.tsx`도 만들기 시트(방·욕실 수)와 가져온 항목 화면을 확인하므로 태스크 3에서 같은 처리가 필요하다.

### 5. 화면 흐름·사용성에서 걸리는 것

- **행에 중첩 버튼 금지**: 줄을 누르면 시트가 열리고 오른쪽에 체크박스가 있다. 버튼 안에 체크박스를 넣으면 안 된다. 행은 "여는 버튼"과 "체크박스 라벨" 두 형제 요소로 나누고, 체크 영역은 44px 이상으로 한다(360px). 견적 칸은 최대 `999,999,999만원`(14자)이라 업체/세부내용은 줄바꿈·말줄임하고 금액·체크 열은 줄어들지 않게 한다. `MortgageHome.module.css:8`이 이미 하단 탭 높이만큼 아래 여백을 주고, 시트는 z-index 10으로 탭(5)을 덮으며 `inert`가 걸리므로 시트·탭 겹침은 문제 없다(확인함).
- **저장 중 체크 비활성 범위**: 스펙은 "그 체크만 비활성"이다. 옛 다견적 항목에서 형제 줄을 연달아 누르면 두 번째는 첫 쓰기 이전의 `updatedAt`으로 쓰다 `isInteriorItemEditConflict`에 걸려 "다른 사람이 고쳤습니다"라는 틀린 안내가 뜬다. 같은 **항목**의 모든 체크를 저장 중에는 잠그거나, 그 줄의 항목 id 단위로 직렬화해야 한다.
- **A7과 코드의 불일치**: 스펙은 확정 토글이 "경고 없이 마지막 저장 우선"이라고 한다. 그러나 `source.updateItem`은 항상 `openedUpdatedAt`을 요구하고 충돌 검사를 한다. 토글에 렌더된 항목의 `updatedAt`을 넘기면 폴링이 막 가져온 변경이 있을 때 `conflict`가 난다. 나는 이것이 **좋다**고 본다(렌더된 숨은 값이 낡았으면 덮어쓰지 않는다). 다만 `conflict` 문구가 "시트의 최신 값 불러오기"를 전제하므로, 토글 실패 문구는 별도("방금 다른 곳에서 바뀌었습니다. 다시 눌러 주세요")로 둬야 한다. A7 문구를 이 동작에 맞게 고친다.
- **구분 철자**: 구분은 직접 입력이고 묶음은 trim 후 완전 일치다(A3). "도배"/"도배 공사"/"도베"가 조용히 다른 묶음이 된다. 입력창에 **이 계획의 기존 구분을 `<datalist>`로** 제안하면 새 라이브러리 없이 대부분 막는다. [+ 도배에 줄 추가]로 열렸을 때는 구분이 채워져 있으니 포커스를 업체 칸에 둔다.
- **숨은 지급 데이터가 보이지 않게 지워지는 삭제**: A6은 "견적 0~1개 항목의 줄을 지우면 지급·날짜도 같이 지워진다. 사용자가 지우겠다고 했으니 괜찮다"고 한다. 그러나 L의 X처럼 지급 100만원·지급함 체크가 있는 항목이 견적 하나만 남으면 사용자는 그 지급이 있다는 걸 화면에서 볼 수 없다. 이게 유일하게 사용자가 모르는 채로 값이 사라지는 경로다. 삭제 확인 문구에 "지급 n건이 함께 지워집니다"를 숨은 값이 있을 때만 붙이면 해결된다.
- **D2 a의 놀람**: 안내가 시트 아래에만 있다. 놀라는 순간은 시트가 아니라 **목록에서 체크를 누를 때** 다른 체크가 풀리는 때다. 그때 목록 위에 한 줄("같은 항목의 다른 견적 확정이 풀렸습니다")을 보이면 싸게 해결된다.
- 시트 [저장]은 고친 게 없으면 비활성(기존 `ItemSheet` 동작 유지), 편집 중 닫기는 `window.confirm`, 오류는 칸 아래에 글자 수/요구 형식과 함께(기존 `interiorTextErrors`·`AmountInput` 재사용). 스펙의 "반복 사용 불편 방지"는 이 체크리스트와 맞다.
- 견적 없는 줄(U9): 확정 체크는 숨기지 말고 **disabled로 보이게** 하고 이유를 접근 가능한 설명으로 둔다(없으면 "왜 이 줄만 체크가 없지"가 된다).

### 6. 태스크 분해

- 1-1(순수 함수)·1-3(결과물·허브)은 의존이 좁아 병렬이 맞다. 다만 1-1 한 줄에 함수가 6개 이상이다. 파일을 `interiorPlanRows.ts`(줄 만들기·지출 예정), `interiorLineWrites.ts`(추가·수정·토글·삭제 입력), `interiorLineDraft.ts`(시트 입력 검증)로 나누고 시그니처는 `(item: InteriorItem, quoteId: string | null, …)`처럼 **줄이 항목 전체를 들고 있게** 확정하면 1-2·1-3이 병렬로 풀린다. 이 시그니처가 1-1의 "함수 시그니처 확정"의 실제 내용이다.
- 1-2는 한 태스크로 너무 크다(PlanScreen·Summary·목록·확정 체크·줄 시트·MortgageHome 시트 종류·HomeView/parseRoute·삭제). 1-2a(목록·요약·체크·라우트), 1-2b(줄 시트), 1-2c(삭제와 테스트 정리)로 나누는 것을 권한다. 삭제는 마지막 소비처가 사라진 같은 변경 안에서 한다.
- 스펙의 P·L 예시 이름은 `src/test/interiorPlanFixture.ts`의 `makePlanP`(항목 4개)와 겹친다. 새 고정값은 이름을 달리해야 한다(예: `makeLinePlan`, `makeLegacyPlan`).

## 리스크

- R1: 사용자 데이터. 숨은 값 보존이 한 번 틀리면 지급·날짜가 조용히 지워진다. 쓰기 입력 deep-equal 표(AC-0(c))가 유일한 방어선이므로 쓰기 함수마다 L의 X 같은 "모든 숨은 값이 있는 항목" 입력으로 케이스를 만든다.
- R2: 위 4번. AC 문장을 고치지 않으면 QA가 "테스트 diff 0" 때문에 통과 불가능한 기준을 받는다.
- R3: D2 b의 부분 실패·점프·상한 문제. 태스크 2를 하더라도 R3은 남는다.
- R4: 줄 100개 상한이 "엑셀 표 한 장"의 기대보다 낮을 수 있다(견적 비교는 공정당 3~5줄). 상수만 올리면 되지만 서버 크기 상한 계산(`interior-planner` "크기 상한")을 다시 해야 하므로 지금은 스펙대로 두고 후보에 둔다.
- R5: 인쇄·CSV에서 구분 병합 규칙은 이전 스펙 그대로라 문제 없음(코드 `PlanTable`이 이미 `tradeGroups` 단위; 줄 모델로 바꿀 때 병합 기준만 `trade`로 유지).

## 스펙에 넣을 조건

- C1 (AC-0 수정): (b)(e)·1-4의 "diff 0"을 "storage assertion(쓰기 0회, 원문 `===`, 새 키 없음, 이전·함께 쓰기 동작)은 한 줄도 지우거나 약화하지 않고, 화면 조작 줄(버튼 이름·고르는 칸·기대 문구)만 새 화면에 맞게 바꾼다"로 고친다. 영향 파일(`AppRoutes.storageKeys{,.loggedIn,.hub}.test.tsx`, `MortgageHome.listingEntry*.test.tsx`)을 명시한다. 서버·`useInteriorPlanSource.test.tsx`·`useInteriorPlanImport.test.tsx`는 diff 0 유지.
- C2 (AC-0(a) 수정): diff 명령에 `src/lib/constants/interiorPlan.ts`를 넣고 "삭제만 허용(INTERIOR_TRADES, INTERIOR_PROCESS_*, INTERIOR_ITEM_STATUS_LABELS, INTERIOR_PAYMENT_LABEL_PRESETS, 안 쓰게 된 import)"으로 쓴다. 이 파일이 서버 전이 의존이므로 검증에 worker 타입 검사(프로젝트의 `pnpm build`에 포함되는지 확인)를 넣는다.
- C3 (삭제 확인): 견적 0~1개 항목의 숨은 `payments`가 있으면 삭제 확인에 "지급 n건도 함께 지워집니다"를 보인다. AC-2(d)·AC-4(c)에 케이스 추가. A6 문구 보정.
- C4 (체크 동작): 저장 중에는 같은 항목의 모든 체크 비활성(D2 a에서 형제 줄 연타가 거짓 충돌을 내지 않게). 토글의 `conflict`는 시트 전용 문구가 아닌 별도 한 줄. A7을 이에 맞게 고친다. 행은 "여는 버튼 + 체크 라벨" 형제 구조, 체크 영역 44px 이상, 360px에서 금액·체크 열은 줄어들지 않음을 "화면" 절에 쓴다.
- C5 (D2 a 안내): 목록에서 다른 견적 확정이 풀릴 때 목록 위 한 줄 안내(AC-4(d)에 추가). 태스크 2는 "옛 다견적 항목 존재 확인 후"를 조건으로 건다(D2 b 채택 시 점프·`limit` 처리도 AC-7에 추가).
- C6: 줄 시트는 `ItemSheet`를 고쳐 쓴다(삭제 목록에서 `ItemSheet`를 빼고 "교체"로). 구분 입력은 `<datalist>`로 기존 구분 제안, 구분이 채워져 열리면 업체에 포커스, 견적 없는 줄의 체크는 disabled로 보인다.
- C7 (태스크 분해): 1-2를 a/b/c로 나눈다. 1-1에 `summarizeInteriorPlan`의 `now`·`summarizeHub`의 `now` 삭제와 `toLocalDateString` 이동, 쓰기 함수 시그니처(항목 전체 + `quoteId|null`)를 적는다. 새 고정값 이름이 기존 `makePlanP`와 겹치지 않게 한다.

## 계약에 없는 API / 결정 필요

- 필요한 API: 없음 (기존 `/api/interior-plans*`만, D1 A).
- 결정 필요: D1 A 확정 요청(찬성). D2는 "옛 다견적 항목이 실제로 있는가"에 따라 태스크 2 착수 여부를 정한다(사용자 확인 필요; 없으면 태스크 2 삭제).
