# interior-vendor-tbd-line-order 스펙 — FE 검토

2026-10-28 · 검토 대상: `.cony/specs/interior-vendor-tbd-line-order.md` · 기준 코드: f5ad2b0 위 브랜치

## 판정: 조건부 찬성

구조(플랜 필드 `lineOrder`, 읽기는 `buildInteriorPlanRows` 한 곳, 쓰기는 기존 `updatePlan` 경로 그대로, 2단계 배포)는 코드와 맞고 구현할 수 있다. 아래 조건 1~5는 구현 전에 스펙에 못 박아야 하고, 나머지는 구현 메모다.

## 확인한 사실 (코드로 확인)

1. **업체 표시 위치 표는 읽는 곳을 빠짐없이 짚었다.** `rg vendor src server`로 확인했다. 서버는 `vendor` 언급이 0건이고 공용 검증 하나가 전부다.
   - 읽는 곳: `LineRow.tsx:22,59,63`, `buildInteriorPlanTable.ts:43`, `PlanTable.tsx:48`, `interiorPlanTableToCsvRows.ts:23`, `interiorLineDraft.ts:40`. 모두 표와 일치한다.
   - 표에 안 나온 것:
     - `PlanTable.tsx:96`(계 줄의 빈 `vendorCell`)은 바뀔 것이 없다.
     - `buildInteriorPlanTable.ts:12`의 타입 주석 "견적 없는 줄은 ''"은 3분류가 되면 거짓이 된다.
     - `ItemSheet.tsx:149-150` 주석과 `ItemSheet.tsx:252-254` 업체 칸은 2단계 대상이다.
     - `src/test/interiorSimpleFixture.ts`의 `vendor: string` 인자 헬퍼(19·190·242행)로는 V의 R8·R9를 만들 수 없다. "추가만 한다"는 규칙대로 새 헬퍼가 필요하다.
   - 홈 허브·요약·`interiorPlanExportText.ts`는 업체를 안 본다. 스펙 말이 맞다.
2. **`LineRow`에서 확정 체크는 여는 버튼의 형제**다(`LineRow.tsx:49-86`). `setActivatorNodeRef`와 listeners를 여는 버튼에만 달면 체크 라벨은 구조상 손잡이가 될 수 없다. 스펙 U6과 맞는다. 묶음 끝 [+ 구분에 줄 추가]와 떠 있는 [+](`position: fixed; z-index: 5`)는 DndContext 밖 형제 DOM이라 충돌이 없다. `DragOverlay`의 기본 z-index(999)가 [+]를 덮는다. 스크롤은 window이고 `index.css`의 `scroll-padding-bottom`이 있어 자동 스크롤에도 문제가 없다.
3. **묶음마다 `SortableContext`를 두면 다른 묶음 줄이 밀리지 않는다.** `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:507`에서 `displaceItem`이 `isValidIndex(activeIndex)`일 때만 켜진다. 든 줄이 없는 컨텍스트는 `activeIndex = -1`이라 변위가 없다. 줄 key는 `item.id:quote.id`로 전체에서 유일해서 DndContext 하나에 SortableContext 여러 개가 안전하다.
4. **서버 PATCH와 캐시는 순서 저장에 맞게 되어 있다.**
   - 서버 PATCH는 `json_patch`(`handleInteriorPlans.ts:299`)라 이름·예산 PATCH가 `lineOrder`를 지우지 않는다.
   - 서버 `toPlan`은 `JSON.parse(data)`를 그대로 펼친다. 응답에 `lineOrder`가 실리려면 PATCH 검증에서 `lineOrder`를 통과시키기만 하면 된다.
   - `useUpdateInteriorPlan`은 `{...plan, items: cached.items}`로 항목을 지키고, `updateInteriorPlanListCache`가 먼저 `cancelQueries`를 한다. 쓰기 전에 시작한 재조회가 끝나며 옛 순서로 덮는 일은 막혀 있다. 단 pending을 `mutateAsync` 이후에 풀어야 한다(조건 3).
5. **로컬 `applyPlanPatch`는 알려진 키만 다시 조립**한다(`interiorPlanStorage.ts:91-106`). `updatePlan`은 `validateInteriorPlanFields(patched)` 결과로 새 객체를 만든다(`:230-238`). 그래서 두 곳을 빠뜨리면 이름만 바꿔도 순서가 지워진다. 두 곳은 `applyPlanPatch`에 `lineOrder`를 더하는 것과 `validateInteriorPlanFields`가 `lineOrder`를 돌려주는 것이다. 후자는 스펙 1-1에 있다. `addItem`·`updateItem`은 `{...plan, items}`라 안전하다. 로그인 이전(`/import`)은 계획 전체를 보내므로 `lineOrder`가 따라간다.
6. **2단계 `editedQuote` 함정은 스펙대로 실재**한다(`interiorLineWrites.ts:37-52`). `{...rest}`에 기존 `vendor`가 들어 있고 지금은 `vendor: values.vendor`로 덮어쓴다. `values.vendor`가 undefined가 되면 `vendor: undefined` 키가 남거나(검증이 정리하지만 로컬 입력·서버 PATCH 본문 단언이 깨진다) 기존 업체가 되살아난다. 구조 분해로 `vendor`를 빼고 값이 있을 때만 넣어야 한다. `Omit<InteriorQuote, "vendor">` 매개변수 타입은 `vendor?`가 되면 필요 없어진다.
7. **저장 목록 끌기에는 jsdom 테스트가 하나도 없다.** `rg -il "dnd|drag|꾹|들었습니다" src --glob '*.test.*'`가 0건이고 Space/Arrow 키 드래그 테스트도 없다. 그때 검증은 로그(`.cony/log.md` 374행) 기준 브라우저 터치 에뮬레이션이었다. 그래서 AC-4의 "저장 목록 기존 끌기 테스트가 diff 0으로 통과한다"는 지킬 대상이 없다. 공통 추출이 저장 목록을 깨도 자동 테스트가 못 잡는다.
8. **`useSyncExternalStore`·폴링 경로에서 계획 목록이 바뀌어도 `PlanScreen`은 같은 인스턴스**다. `MortgageHome.tsx`의 `renderPlan`에 key가 없어서 `#/home/{다른 planId}`로 바꿔도 PlanScreen 상태가 유지된다(조건 3의 근거).

## 조건 (구현 전에 스펙에 반영)

1. **`lineOrderAfterMove` 입력을 정하라.** 지금 시그니처 `(groups, groupTrade, activeKey, overKey)`는 AC-3 마지막 줄과 모순된다. 끄는 동안 재조회로 R1이 지워지고 R6가 더해져도 "저장된 순서에서 R1 key는 없고 R6은 맨 끝 자기 묶음에 보인다"고 했는데, 든 순간 스냅샷(R1 있음, R6 없음)만 받으면 R1이 배열에 남고 R6은 빠진다. 제안은 다음과 같다.
   - 이동은 스냅샷 묶음 순서에서 `arrayMove`한다.
   - 저장 배열은 놓는 순간의 현재 묶음들로 만든다. 옮긴 묶음은 "스냅샷 이동 결과 중 아직 있는 key" 뒤에 "새로 생긴 key"를 붙인다.
   - 든 줄이 지워졌거나 묶음(구분)이 바뀌었으면 쓰지 않는다. AC에 이 두 경우를 더한다.
   - 이 규칙을 단위 테스트로 못 박는다.
2. **끌기 상태를 `PlanLines` 한 곳에 두되 "든 순간 목록 고정"은 줄 객체가 아니라 묶음 스냅샷**이다. `Compact`의 `draggedListings`와 같은 방식이다. `onDragEnd`에서 고정을 풀기와 pending 설정이 같은 이벤트 안에서 일어나야 한 프레임 깜빡임이 없다. 저장 목록 `handleReorder`가 이미 그렇게 한다(`setPendingOrder(ids)`가 첫 줄, `await` 앞).
3. **pending 순서는 `PlanScreen`(또는 그 위)에 두고, 계획 id로 묶는다.** 두 가지 이유가 있다.
   - 표 보기도 같은 `rows`를 쓰므로 한 곳이 맞다. `PlanLines`에 두면 저장 중에 [표]로 바꾸면 옛 순서가 보인다.
   - `PlanScreen`에 key가 없어서(사실 8) 저장 중 다른 계획으로 가면 pending 배열이 다른 계획의 `lineOrder`를 덮는다. `{ planId, order }`로 들거나 `PlanScreen`에 `key={plan.id}`를 준다.
   - pending 해제는 `await source.updatePlan(...)` 뒤(성공이면 캐시·로컬 스냅샷에 새 순서가 들어간 뒤)다. 해제를 먼저 하면 깜빡인다.
4. **실패 문구는 `Record<Reason, string | null>`로 쓴다.** `ORDER_FAILURE_MESSAGES`(`MortgageListings.tsx:87`)와 같은 방식이라 reason 추가 때 타입 검사가 걸린다. 401은 `null`(스펙대로 홈 세션 안내가 알린다)이다. `conflict`는 `updatePlan`에서는 안 나오므로 `Exclude`로 뺀다. 순서 실패 안내는 `useLineConfirmToggle`의 `notice`와 같은 자리에 겹치므로 안내 슬롯을 하나로 합치거나 둘을 모두 `role="alert"`로 나란히 둘 중 하나를 정하라. 다음 끌기 성공 때 지우는 규칙에 "계획을 바꾸면 지운다"를 더한다.
5. **공용화 범위를 줄여라.** 스펙은 "알림 문장은 명사만 다르므로 그 차이만 인자로"라고 했는데, 줄 쪽 알림은 구조가 다르다("{구분} 줄 n개 중 k번째", "묶음 밖", 줄 이름 `nameOf`). 매물 쪽 알림은 전체 n개와 목록 밖 두 문장이다. 아래만 전역으로 올리고 알림 문장은 각 목록이 따로 만든다.
   - 꾹 누르기 상수 `LONG_PRESS`, `KEYBOARD_CODES`, `SCREEN_READER_INSTRUCTIONS`: 비-React라 `lib/constants/`
   - 센서 세 개 묶음: `hooks/`의 훅 하나
   - 이유: 알림 문장 팩토리는 분기가 인자로 늘어나는 "추측성 추상화"가 되기 쉽다.
   - 추출 때 저장 목록 동작을 지키려면 자동 테스트가 없으므로(사실 7) 추출 전에 특성 테스트(꾹 누르기 활성화, 키보드 들기·놓기)를 한 번 더하거나 AC-4 수동 항목에 저장 목록 재확인을 넣는다.

## 업체 미정 표시 (태스크 1-2) 구현 메모

- **표 모델 3분류는 판별 유니온 + 글자 함수 하나**로 하라. 금액은 `number | "tbd" | undefined`로 센티넬이 안전했지만, 업체는 이름이 글자 그대로 "tbd"일 수 있어 센티넬 문자열을 못 쓴다(스펙도 이 점을 짚는다). `{ kind: "none" } | { kind: "tbd" } | { kind: "named"; name }` 같은 형태로 하고, `tableAmountText`처럼 `tableVendorText(vendor)`를 `buildInteriorPlanTable.ts`에 두어 `PlanTable.tsx`와 CSV가 같은 함수를 부르게 한다. 그러면 표·인쇄·CSV 글자가 갈라질 수 없다(AC-0(h)의 ⑥).
- **"업체 있음/없음" 판단도 한 함수**로 둔다. `LineRow`(`nameOf`, 첫 줄, 둘째 줄)·표 모델·`toInteriorLineDraft` 네 곳에서 `quote.vendor === undefined`를 따로 쓰지 말고 `vendorOf(quote)` 같은 순수 함수 하나를 부른다. 2단계에서 "빈칸이 미정" 규칙을 바꿀 때도 한 곳이다.
- **스타일**: 스펙은 `tbdAmount` 계열을 쓰라는데 `tbdAmount`는 `composes: amount`(16px 600, `nowrap`)라 글자 크기·굵기가 다르다. 업체 미정은 `primaryText`(500)·`secondaryText`(작은 흐림)에 색만 얹는 새 클래스(`tbdText`)가 맞다. 세부내용이 있는 줄의 둘째 줄은 `secondaryText`가 이미 `--color-text-muted`라서 "업체 미정"과 일반 업체 이름이 색으로는 구별이 안 되고 글자로만 구별된다. 스펙의 "흐린 글자"는 첫 줄(세부내용 없음)에서만 시각 차이가 있다는 점을 U1에 적어 두라. 대비 4.5:1 검사는 첫 줄 기준이다.
- **접근 가능한 이름**: R9와 같은 구분의 업체 없는 줄이 둘이면 이름이 똑같다("철거 업체 미정 열기" ×2). 이미 같은 업체·세부내용이 겹칠 수 있는 지금과 같은 수준이라 받아들인다.
- `rg "\.vendor\b" src` 허용 목록을 PR에 붙이라는 스펙 조건은 좋다. 위 4곳을 한 함수로 모으면 목록이 짧아진다.

## 줄 끌어 옮기기 (태스크 1-3) 구현 메모

- **구조**: `PlanLines` → `DndContext` 하나, 안에서 묶음마다 `LineGroup`(새 컴포넌트) → `SortableContext items={row.key[]}`. 줄(`LineRow`)은 `useSortable({ id: row.key, disabled })`를 부르고 `setNodeRef`는 `<li>`, `setActivatorNodeRef`와 `attributes·listeners`는 여는 버튼에 단다. 줄 수 1개인 묶음은 `dragProps`를 비운다(`CompactListingRow`와 같은 패턴).
- **`DragOverlay` 안에 들어갈 줄 표시는 버튼·체크 없는 순수 표시 컴포넌트**로 `LineRow`에서 뽑아야 한다. 같은 `LineRow`를 오버레이에 넣으면 접근 가능한 이름이 중복되고 체크박스가 둘 생긴다. 오버레이는 `aria-hidden`으로 둔다. 오버레이는 묶음 카드(`.group`의 배경·둥근 모서리) 밖이라 배경·그림자를 따로 줘야 한다.
- **여는 버튼 CSS**: `CompactListingRow.module.css`의 `.draggableRow`(`touch-action: manipulation; user-select: none; -webkit-touch-callout: none`)와 같은 설정이 `.openButton`에 필요하다. 줄 1개 묶음에는 붙이지 않는다. `index.css`는 `[aria-roledescription]` 버튼의 눌림 효과를 이미 빼 두었다.
- **다른 묶음 위로 넘어가는 키보드 이동**: `sortableKeyboardCoordinates`는 모든 droppable을 본다. 묶음 마지막 줄에서 아래 화살표를 누르면 다음 묶음의 첫 줄로 들어가 `over`가 묶음 밖이 된다. 스펙의 "묶음 밖 알림, 놓으면 제자리"가 이 경우를 다룬다. 마우스·터치는 커스텀 `collisionDetection`으로 같은 묶음 후보만 걸러도 되지만(마지막 칸 놓기가 쉬워진다) 필수는 아니다. 먼저 `closestCenter`로 시작하고 브라우저 수동 확인에서 불편하면 거르라.
- **저장 흐름**: `PlanScreen`에서 `onReorder(lineOrder)`를 받아 `source.updatePlan(plan.id, { lineOrder })`를 부른다. 세 출처(로그아웃·로그인·가구)가 `useInteriorPlanSource.updatePlan`의 `writeBySource`로 갈라지므로 화면은 출처를 모른다. 로그인 상태에서만 `invalidate`·`expireSession`이 일어난다. 이것이 스펙 "새 저장 경로 없음"의 구현이다.
- **읽기 입력 타입**: `buildInteriorPlanRows(plan: Pick<..., "items" | "lineOrder">)`의 호출자는 세 곳(`summarizeInteriorPlan`, `PlanScreen`, `MortgageHome` 시트 줄 찾기)이고 모두 계획 전체를 넘긴다. `lineOrder`를 빠뜨리는 호출자는 없다. 단 pending 순서를 얹을 때는 `{ items: plan.items, lineOrder: pending ?? plan.lineOrder }`로 넘겨야 한다. `tradeSuggestions`(시트 구분 제안)도 이 결과를 쓰므로 순서가 따라간다. 문제는 없다.
- **정렬 구현**: 위치 맵(`Map<key, index>`) 하나로 두 단계(자기 key → `item.id:` 대체 → 없음)를 풀고 `Array.prototype.sort`(안정 정렬)를 쓴다. 줄 500개에서 문제가 없다. 대체 자리를 같은 항목의 두 줄이 함께 쓰는 경우(빈 줄 key 하나에 견적 n개)는 안정 정렬이 기본 순서로 풀어 주므로 따로 처리하지 않는다.

## 테스트 가능성 (jsdom에서 dnd-kit)

- **순수 함수(`buildInteriorPlanRows`, `lineOrderAfterMove`, 표 모델, 검증)**: jsdom 없이 완전히 가능하다. AC-2·AC-3 일부·AC-0(h) ③④⑤⑥은 여기서 잡는다.
- **로컬 `applyPlanPatch`·서버 PATCH 본문**: 스토어/하네스에서 `updatePlan({lineOrder})`를 직접 불러 검증하면 된다(AC-0(d)·(e)). 화면 없이도 "끌기 한 번 = setItem 1회/PATCH 1건"은 `onReorder` 콜백을 직접 호출하는 방식으로 본다.
- **`PlanLines`의 끌기 접착 코드**: `@dnd-kit/core`의 `DndContext`를 모킹해 props로 받은 `onDragStart/onDragEnd/onDragCancel`을 직접 호출하는 방식이 가장 안정적이다. 고정 스냅샷, 제자리·다른 묶음 놓기 쓰기 0회, 실패 되돌리기, pending 해제 시점(AC-3 대부분, AC-0(h) ⑦)을 이것으로 본다.
- **실제 센서(AC-4)는 jsdom이 약하다.**
  - 마우스 250ms 활성화는 `fireEvent.mouseDown` + 가짜 타이머로 가능하다.
  - 키보드 화살표 이동은 안 된다. `sortableKeyboardCoordinates`가 `getBoundingClientRect`로 다음 후보를 고르는데 jsdom은 전부 0이라 `over`가 안 바뀐다. 줄마다 rect를 모킹하는 헬퍼가 필요하다.
  - `DragOverlay`의 놓기 애니메이션은 `Element.animate`를 부르는데 jsdom에는 없어서 오류가 날 수 있다. 테스트에서 `dropAnimation`을 끌 수 있는 길이나 `animate` 폴리필이 필요하다.
  - 제안: 센서 상수가 공유 export인지는 단위 테스트로, 꾹 누르기·Esc·키보드 이동은 브라우저(수동 또는 e2e)로 AC-4 수동 항목에 넣는다. 스펙이 jsdom에서 전부 자동화된다고 가정하지 않게 한다.
- **회귀**: 사실 7의 이유로 저장 목록 끌기를 "diff 0 테스트"로 지킨다는 문장은 정정이 필요하다.

## 리스크

1. (중) 공통 추출이 자동 테스트 없이 저장 목록 끌기를 건드린다. 조건 5로 범위를 줄이고 수동 재확인을 넣는다.
2. (중) pending이 다른 계획으로 새거나(조건 3) 든 순간 스냅샷과 현재 목록의 차이(조건 1)를 잘못 풀면 순서가 조용히 틀린다. 둘 다 단위 테스트로 잡을 수 있다.
3. (낮) 로컬 `updatePlan`은 `lineOrder: []`를 키 삭제로 받고 서버 PATCH는 400이다. 화면이 줄 2개 이상 묶음에서만 보내므로 도달하지 않지만 두 경로가 다르다. 둘 중 한쪽을 문서로 못 박아 두라.
4. (낮) 동시에 두 사람이 다른 묶음을 끌면 나중 저장이 앞 저장을 덮는다. ADR-026과 같은 수용 항목이고 스펙이 적었다.
5. (낮) 413은 `toWriteFailure`에서 `invalid`가 되어 "순서를 저장하지 못해 원래 순서로 되돌렸습니다"만 보인다. 스펙대로다. 사용자가 할 수 있는 일이 없는 실패이므로 충분하다.

## 사용성 체크리스트 대조

- URL 상태: 끌기는 URL 상태가 없다. 보기(`?view=table`)는 기존 그대로다. 해당 없음.
- 짧은 누르기=시트, 스크롤 우선, 놓은 뒤 시트가 열리지 않음: dnd-kit이 끌기 뒤 click을 막는다(저장 목록과 같은 동작). 브라우저에서 한 번 확인하라.
- 로딩·빈·에러: 목록 쪽은 기존 상태를 그대로 쓴다. 끌기의 `canReorder`는 pending 하나뿐이면 된다. 출처가 정해지기 전에는 `PlanScreen` 자체가 안 그려지므로 `Listings`의 `isOrderMissing` 같은 상태는 필요 없다.
- 버튼 위치 흔들림: [+] 고정, 목록 하단 여백 그대로. 추가 변경 없음.

## 조건 요약

1. `lineOrderAfterMove` 입력과 삭제·추가·구분 변경 시 규칙을 스펙·AC에 명시
2. 든 순간 묶음 스냅샷 + 놓기 시 현재 목록 기준 저장 배열 구성
3. pending 순서를 `PlanScreen`에 두고 계획 id로 묶음, 해제는 `await` 뒤
4. 실패 문구를 `Record`로, 안내 슬롯 하나, 계획 변경 시 지움
5. 공용화는 상수·센서 훅만, 알림 문장은 각자. 저장 목록 회귀는 수동 재확인 또는 특성 테스트 추가
6. AC-4의 jsdom 가정 수정(키보드 이동·`DragOverlay` 애니메이션), "저장 목록 기존 끌기 테스트" 문구 정정
7. 업체 미정 표 모델은 판별 유니온 + 글자 함수 하나, "업체 있음" 판단 함수 하나, 목록용 새 클래스(`tbdAmount` 재사용 금지)
