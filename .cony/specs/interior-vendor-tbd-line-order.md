# 우리 집 — 업체 "미정" 줄과 줄 끌어 옮기기

> 작성 2026-10-28 · 브랜치 `cony/interior-vendor-tbd-line-order` · 상태: **D1·D2 결정됨(ADR-036 채택: D1 A, D2 A)**, 제품 기본값 U1~U7은 사용자 확인 전
> 관련: ADR-001(손상이면 전체 corrupt) · 012(선택 필드 = 키 없음) · **026(직접 정렬: id 배열 + @dnd-kit, 꾹 누르기)** · 029(검증 원본 `validateInteriorPlan.ts`, PATCH = JSON Merge Patch) · 032(줄 = (항목, 견적), key `item.id:quote.id`) · **033(필수 → 선택 완화는 2단계 배포, 게이트 = 사용자 확인, 24시간 대기는 사용자가 없앰)** · 034(원 단위 키, 읽기 한 곳) · 035(우리 집에는 가리기가 없음) · **036(이 스펙의 결정: 업체 미정 + `lineOrder`)** · 스펙 `interior-tbd-amount.md`(형식·AC-0 규칙·예시 P⁺) · `interior-simple.md`(예시 P·L)

## 목표

업체를 아직 정하지 못한 견적 줄도 적어 둘 수 있게 하고(업체 칸을 비우면 "미정"), 공정 묶음 안에서 줄을 꾹 눌러 끌어 원하는 순서로 놓을 수 있게 한다. 순서는 표·CSV·인쇄와 다른 기기·함께 쓰는 사람 화면에도 똑같이 보인다. 이미 저장된 계획은 로그인 여부와 상관없이 하나도 잃지 않는다.

## 사용자 시나리오

1. (업체 미정) [+]에서 구분 "조명", 세부내용 "거실 간접등", 견적 300,000원을 적고 업체는 비운 채 저장하면 목록에 "거실 간접등 / 업체 미정 · 300,000원"으로 보인다. 확정하면 지출 예정에 30만원이 더해진다.
2. (둘 다 미정) 구분 "철거"만 적고 업체·견적을 비운 채 [확정]을 켜 저장하면 "업체 미정 · 미정" 줄이 확정되고, 요약에 "금액 미정 1건 제외"가 붙는다(U2).
3. (나중에 채우기) 업체를 정하면 그 줄을 열어 업체 칸만 채운다. 줄 위치는 그대로다.
4. (끌어 옮기기) "욕실" 묶음에서 "타일 덧방" 줄을 꾹 눌러(약 0.25초) 들어 올려 맨 위로 끌어 놓으면 그 순서로 저장된다. 짧게 누르면 지금처럼 줄 시트가 열린다.
5. (같이 보기) [표]로 바꾸면 표·CSV·인쇄가 바뀐 순서 그대로다. 남편 휴대폰(함께 쓰는 중)에도 30초 안에 같은 순서로 보인다.
6. (보류) 금액 칸에 `000`·`00` 키나 `+`·`-` 키가 나오는 키패드는 이번에 하지 않는다(다음 단계 후보).

## 참고한 사례

- **스프레드시트·견적 비교 관례(엑셀·구글 시트, Smartsheet Bid Comparison)**: 아직 정하지 않은 칸은 비우거나 "미정(TBD)"이라고 적는다. 줄이 사라지지 않고 빈 칸이 그대로 보인다. → 업체도 금액과 같은 규칙으로 "키 없음 = 미정"(ADR-012·033), 표·CSV 글자는 금액과 같은 "미정". https://www.smartsheet.com/content/construction-bid-templates-and-forms
- **Parallel Change(Expand–Contract, Martin Fowler)**: 읽는 쪽을 먼저 넓혀 배포하고 그 뒤에 새 형식을 쓰기 시작한다. → 업체 필수 → 선택 완화는 ADR-033 조건 2대로 2단계 배포. https://www.martinfowler.com/bliki/ParallelChange.html
- **직접 정렬의 저장 방식**:
  - Trello 카드 `pos`(숫자 간격)와 Jira Rank(LexoRank, 문자열)는 줄마다 정렬 키를 두어, 한 번 옮길 때 그 줄 하나만 고친다. 대신 키가 길어지거나 재정렬(rebalance)이 필요하다. https://jira.atlassian.com/browse/TRELLO-1590 · https://community.atlassian.com/forums/Jira-articles/How-Jira-Issue-Ranking-Works/ba-p/1371226 · https://yasoob.me/posts/how-to-efficiently-reorder-or-rerank-items-in-database/
  - 우리 저장 목록(ADR-026)은 부모 쪽에 **id 배열 하나**를 두고 한 번 끌면 요청 하나(`PUT /api/listing-order`)로 끝낸다. 순서에 없는 것은 기본 규칙으로 붙이고 지워진 id는 무시한다. 항목 수가 수백 개를 넘어 충돌이 잦아지면 per-row 키(B)로 바꾼다는 뒤집을 조건이 있다.
  - → 줄 수가 계획당 최대 500(항목 100 × 견적 5)이고 쓰는 사람이 두 명이라 ADR-026과 같은 "부모에 key 배열"로 **결정됨**(ADR-036 D1 A).
- **섹션 안 끌어 옮기기(Todoist 섹션, Apple 미리 알림 목록, iOS 길게 누르기 후 끌기)**: 모바일은 길게 눌러 들고, 짧게 누르면 열기다. 끄는 동안 다른 줄이 자리를 비켜 준다. → 저장 목록(`CompactListingList`)과 같은 상호작용을 그대로 쓴다. 이번에는 묶음 안에서만 옮기고, 묶음을 넘나드는 이동(= 구분 바꾸기)은 시트로 한다.
- **@dnd-kit(이미 설치: core 6.3.1, sortable 10.0.0, utilities 3.2.2)**: `SortableContext` 여러 개, `MouseSensor`·`TouchSensor`의 `activationConstraint { delay, tolerance }`, `KeyboardSensor` + `sortableKeyboardCoordinates`, `accessibility.announcements`, `DragOverlay`. 새 패키지는 없다(`@dnd-kit/modifiers`도 설치하지 않는다). 든 줄이 없는 `SortableContext`는 `activeIndex = -1`이라 줄이 밀리지 않으므로 묶음마다 `SortableContext`를 두고 `DndContext`는 하나로 둔다.
- **우리 코드**:
  - `CompactListingList.tsx`의 `LONG_PRESS = { delay: 250, tolerance: 5 }`, `KEYBOARD_CODES`(스페이스로 들기, 스페이스·엔터로 놓기, Esc 취소), 스크린리더 안내·알림 문구, "든 순간의 목록을 그린다(`draggedListings`)".
  - `MortgageListings.tsx`의 `pendingOrder`(저장이 끝날 때까지 놓은 순서로 보이기)·`ORDER_FAILURE_MESSAGES`(실패하면 원래 순서로 되돌리고 목록 바로 위 한 줄).
  - 서버 PATCH는 `json_patch(data, ?)`(RFC 7396)라 배열은 통째로 바뀌고 `null`은 키 삭제다(`handleInteriorPlans.ts:299`).

## 범위

- 포함:
  - 견적 업체를 선택으로(키 없음 = 업체 미정): 공용 검증·타입, 목록·표·인쇄·CSV 표시, 쓰기 보존
  - 시트에서 업체 비우기(2단계), 업체·견적·세부내용이 모두 빈 줄의 처리(U2), 관련 안내 문구 정리
  - 묶음 안 줄 끌어 옮기기: 플랜 필드 `lineOrder`(ADR-036 D1 A) 읽기·쓰기, 목록·표·CSV·인쇄 순서 반영, 로그아웃·로그인·함께 쓰는 중 세 출처
  - 2단계 배포(ADR-033 조건 2, ADR-036 조건 1): 태스크 1 = 업체 미정 읽기·표시·보존 + 줄 끌어 옮기기, 태스크 2 = 시트에서 업체 비우기
- 범위 밖:
  - 금액 입력 키패드(`000`·`00`, `+`·`-`, 빠른 더하기 칩) — 다음 단계 후보
  - 묶음(구분) 자체의 순서 바꾸기(U4) — 다음 단계 후보
  - 묶음을 넘나드는 끌기(끌어서 구분 바꾸기)
  - 표 보기에서 끌기(표는 순서만 반영)
  - 업체 미정 건수 요약("업체 미정 n건")·필터
  - 옛 탭을 알아채는 번들 버전 확인 장치(ADR-033 뒤집을 조건, 다음 단계 후보 그대로)

## 데이터 모델

### 업체 미정 (저장 형식 완화 = 2단계 배포)

- `InteriorQuote.vendor?: string`. **키가 없으면 업체 미정**이다(ADR-012). 값이 있으면 지금처럼 trim 후 1~30자다.
  - 키 없음과 `undefined`만 미정이다. `""`·`"   "`·`null`·숫자·31자는 지금처럼 거부한다(`validateInteriorPlan.test.ts` 190·191행 그대로 통과). `" 가나 "` → `"가나"`도 그대로다.
  - 미정의 표현은 "키 없음" 하나뿐이다. `contact`·`memo`처럼 `""`를 받아 키를 빼는 규칙(`parseOptionalText`)을 쓰지 않는다. 나중에 넓히는 것은 2단계 배포로 할 수 있지만, 한 번 받은 형식을 좁히는 것은 저장된 값 때문에 할 수 없으므로 좁은 쪽으로 시작한다.
  - 돌려주는 객체에 `vendor: undefined` 키를 남기지 않는다(`Object.hasOwn` 단언, `exactOptionalPropertyTypes` 꺼짐).
- 바뀌는 검증은 `validateInteriorPlan.ts` `parseQuote`의 업체 한 줄이다(`parseRequiredText` → 키가 있을 때만 `parseRequiredText`). 서버·로컬 저장·로그인 이전·응답 파서가 같이 넓어진다.
- 견적 `{ id }`(업체·금액·세부내용 모두 없음)도 올바른 견적이다. 목록에서는 "업체 미정 · 미정" 줄이다.
- 계산은 바뀌지 않는다. 지출 예정·미정 건수는 금액만 본다(업체 미정이고 금액이 있는 확정 줄은 지출 예정에 더한다).
- **"업체 있음/없음" 판단은 `vendorOf(quote)` 순수 함수 한 곳**이다(ADR-036 조건 8). `LineRow`(`nameOf`·첫 줄·둘째 줄)·표 모델·`toInteriorLineDraft`가 각자 `quote.vendor === undefined`를 쓰지 않고 이 함수를 부른다. 2단계에서 규칙이 바뀌어도 한 곳이다.
- 표 모델(`buildInteriorPlanTable`)의 업체 칸은 **판별 유니온 `{ kind: "none" } | { kind: "tbd" } | { kind: "named"; name }`**(견적 없음 / 업체 미정 / 이름)이다. 업체 이름이 글자 그대로 "미정"·"tbd"일 수 있으므로 문자열 하나에, 센티넬 문자열로 두 뜻을 싣지 않는다(금액 칸 `InteriorPlanTableAmount`는 `number | "tbd" | undefined`로 안전했지만 업체는 다르다, ADR-033 조건 4). 표·인쇄·CSV는 `buildInteriorPlanTable.ts`의 **같은 변환 함수 하나**(`tableVendorText`)를 부른다.
- **옛 번들 영향(배포 순서의 근거)**: 지금 main(f5ad2b0) 번들의 `parseQuote`는 업체를 필수로 본다. 업체 없는 견적이 하나라도 저장되면:
  - 로그아웃 옛 탭: `storage` 이벤트로 그 기기 계획 전체가 손상 화면이 되고, [계획 초기화]를 누르면 로컬 계획이 지워진다(유일한 손실 경로, interior-tbd-amount A3과 같음).
  - 로그인 옛 탭: 목록 조회가 "불러오지 못함"이 될 뿐 파괴 동작은 없다.
  - 그래서 업체를 비우는 화면은 2단계(게이트 뒤)에 연다.

### 줄 순서 (결정됨: ADR-036 D1 A, 플랜 필드 `lineOrder`)

- `InteriorPlan.lineOrder?: string[]`: 줄 key(`item.id:quote.id`, 견적 없는 줄은 `item.id:`)를 보이는 순서대로 담는다. `InteriorPlanInput`·`InteriorPlanPatch`(`lineOrder?: string[] | null`)에도 더한다.
- **빈 배열 정책은 하나다**(ADR-036 조건 2). 저장된 값·공용 필드의 `[]`는 **키 없음**으로 읽고, PATCH `lineOrder: []`는 로컬·서버 모두 `null`과 같이 **키 삭제**로 받는다. 400 경로를 만들지 않는다.
- 검증(`validateInteriorPlanFields`, 로컬·서버·이전 공통):
  - `parseLineOrder(value): string[] | null`(export, 서버 PATCH도 씀)은 **비어 있지 않은 유효 배열만** 돌려주고 나머지는 null이다. 빈 배열 처리는 호출자가 한다(공용 필드: `[]` → 키를 쓰지 않음, PATCH: `[]` → `null`과 같은 삭제).
  - 키 없음 = 순서 없음(지금 기본 순서). 돌려주는 객체에는 키를 쓰지 않는다(ADR-012).
  - 원소는 `^[A-Za-z0-9_-]{1,64}:([A-Za-z0-9_-]{1,64})?$` 문자열(id 규칙 두 개를 `:`로 이은 것, 뒤는 비어도 됨). **정규식은 `isInteriorId`의 `ID_PATTERN` 한 곳에서 만들고 새 리터럴로 복제하지 않는다**(id 규칙이 바뀌면 저장된 `lineOrder`가 손상이 되므로 판단을 한 곳에 둔다).
  - 중복 없음, 최대 `INTERIOR_LINE_ORDER_MAX_COUNT = INTERIOR_ITEM_MAX_COUNT × INTERIOR_QUOTE_MAX_COUNT`(= 500, 두 상수에서 계산하고 새 숫자를 쓰지 않는다).
  - 어긋나면(배열 아님, 문자열 아님, 모양 틀림 `"a"`·`"a:b:c"`·`":q"`·65자 id, 중복, 501개) 다른 필드와 같이 플랜 전체가 올바르지 않다(로컬은 ADR-001대로 corrupt).
  - 항목에 실제로 있는 key인지는 보지 않는다(플랜과 항목은 따로 저장된다). 받은 배열을 순서 그대로 돌려준다.
- 읽기 규칙(**`buildInteriorPlanRows` 한 곳**, 목록·표·CSV·인쇄가 같은 결과를 쓴다). 입력 타입은 `Pick<InteriorPlanWithItems, "items" | "lineOrder">`다. 호출자(`summarizeInteriorPlan`, `PlanScreen`, `MortgageHome` 시트 줄 찾기)는 계획 전체를 넘기고, 저장 중 순서를 얹을 때는 `{ items: plan.items, lineOrder: pending ?? plan.lineOrder }`로 넘긴다.
  1. 줄을 지금처럼 항목 순 → 견적 순으로 펼친다(기본 순서).
  2. 줄마다 위치 = `lineOrder`에서 그 key의 자리. 없으면 같은 항목의 빈 줄 key `item.id:`의 자리(견적 없는 줄에 업체를 채워 key가 바뀐 경우 제자리 유지). 그것도 없으면 위치 없음. 자기 key와 `item.id:`가 둘 다 있으면 자기 key의 자리가 이긴다.
  3. 위치 있는 줄을 위치 순으로, 그 뒤에 위치 없는 줄을 기본 순서로 놓는다(안정 정렬. 위치 맵 하나로 푼다). `lineOrder`에 있지만 줄이 없는 key(지워진 줄)는 무시한다. 같은 위치를 받은 줄(빈 줄 key 하나에 견적 n개)은 기본(견적) 순서를 유지한다.
  4. 묶음 = trim한 구분, 묶음 순서 = 그 묶음 줄의 가장 이른 위치(지금 규칙 그대로). 그래서 새 줄은 그 구분 묶음의 맨 끝, 새 구분은 맨 끝 묶음이다(U5).
- 쓰기 규칙(순수 함수 `lineOrderAfterMove(snapshotGroups, currentGroups, groupTrade, activeKey, overKey): string[] | null`, `src/lib/utils/`, ADR-036 조건 4). 입력은 **든 순간의 묶음 스냅샷**과 **놓는 순간의 현재 묶음**이다(끄는 동안 재조회로 줄이 바뀔 수 있어서다).
  1. 이동은 스냅샷의 `groupTrade`(trim 기준) 묶음에서 `arrayMove(activeKey → overKey)`한 결과다.
  2. 옮긴 묶음의 값 = 이동 결과 중 **현재 묶음에 아직 있는 key** 뒤에 **현재 묶음에 새로 생긴 key**(현재 순서)를 붙인 것.
  3. 다른 묶음의 값 = **놓는 순간의 현재 값**(스냅샷이 아니다).
  4. 돌려주는 배열 = 현재 묶음 순서대로 위 값을 이어 붙인 것. 그래서 묶음 안 이동은 묶음 순서를 바꾸지 않고, 지워진 key는 저장 때 걷히며, 개수는 언제나 지금 줄 수(≤ 500)다.
  5. **null(쓰지 않음)**: 제자리(active == over), `overKey`가 그 묶음 밖·없는 key, 줄 1개 묶음, 든 줄이 현재 목록에서 사라졌거나 구분이 바뀐 경우.
  6. 출력은 **항상 `parseLineOrder`를 통과**한다(중복 없음, 길이 ≤ 현재 줄 수 ≤ 500, key 정규식). 틀린 `lineOrder`는 로컬 전체 corrupt·로그인 목록 전체 `loadFailed`가 되므로 쓰는 쪽이 정확해야 한다.
  - 쓰기는 플랜 PATCH `{ lineOrder }` 한 번이다. 항목은 건드리지 않는다.
- 플랜 PATCH가 `lineOrder`를 지키는 곳: 서버는 `json_patch`라 다른 키 PATCH(이름·예산·매물 연결)가 `lineOrder`를 건드리지 않는다. 로컬은 두 곳이 모두 `lineOrder`를 다뤄야 한다. `applyPlanPatch`(`interiorPlanStorage.ts:91`)는 알려진 키만 다시 조립하므로 `lineOrder`를 `mergeValue`로 함께 옮겨야 하고, `updatePlan`은 `validateInteriorPlanFields(patched)` 결과로 새 객체를 만드므로 그 함수가 `lineOrder`를 돌려줘야 한다(빠뜨리면 이름만 바꿔도 순서가 지워진다, AC-0(h)의 일부러 넣는 버그 ③). `addItem`·`updateItem`은 `{...plan, items}`라 안전하다.
- **동시 끌기**: 한 번의 저장은 그 사람이 놓는 순간의 전체 배열로 덮는다. 두 사람이 동시에 끌면 나중 저장이 이기고, 그 사이 상대가 옮긴 **다른 묶음의 순서까지** 되돌려질 수 있다(줄이 사라지지는 않고 순서만 되돌아간다). 사용자 두 명·재조회 30초라 받아들인다(ADR-026과 같은 모양, 뒤집을 조건은 ADR-036).
- **본문 크기(D2 결정됨: PATCH만 128KB)**: 줄 key 최대 129자 → JSON 원소 최대 132바이트 × 500 ≈ 66KB. 지금 id(32자 hex)로도 68바이트 × 500 ≈ 34KB다. 지금 PATCH 한도 `WRITE_MAX_BYTES = 16KB`(`handleInteriorPlans.ts:35`, 약 235줄에서 끝)를 넘는다. 새 화면 줄은 견적 1개 항목이라 보통 100줄 ≈ 7KB지만, 옛 다견적 계획까지 상한 안에서 저장되게 한다. `PLAN_PATCH_MAX_BYTES = 128 * 1024`를 `WRITE_MAX_BYTES` 옆에 두고 **PATCH 경로(`readJsonBody` 한 곳, 291행)에만** 쓴다. 근거는 상수 옆 주석에 적는다(500 × 132바이트 ≈ 66KB + 다른 키 여유). 항목 쓰기(345·399행)·계획 POST(135행)는 16KB 그대로다.
- **옛 번들 영향**: 옛 번들은 `validateInteriorPlanFields`가 알려진 키만 돌려주므로 `lineOrder`를 조용히 버린다(손상 판정 없음).
  - 로그아웃 옛 탭이 그 기기에 아무 쓰기나 하면 `interior-plans` 원문을 다시 써서 **그 기기 모든 계획의 `lineOrder`가 사라진다**(순서만 기본으로 돌아간다. 다른 값은 그대로).
  - 로그인 옛 탭은 PATCH에 `lineOrder`를 보내지 않고 서버는 새 코드라(서버·번들 동시 배포) 순서가 지워지지 않는다.
  - 그래서 1단계 PR에 함께 넣는다. 2단계 게이트(탭 새로고침 확인)가 이 위험도 같이 닫는다.

## API 계약

경로·봉투·오류 모양은 그대로다. 마이그레이션 없음(JSON `data` 컬럼), 새 환경변수 없음.

| Method | Path                                                                            | Request                                                                                                     | Response                                                                              | 에러                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/interior-plans`                                                           | —                                                                                                           | 플랜에 `lineOrder`가 있으면 저장된 배열 그대로. 업체 미정 견적에는 `vendor` 키가 없다 | 그대로                                                                                                                                                                                                                                 |
| PATCH  | `/api/interior-plans/{id}`                                                      | `{ plan: { lineOrder: string[] \| null } }`(다른 키와 함께 보내도 된다). **`null`과 `[]`는 같다 = 키 삭제** | 200 `{ plan }`(항목 없음, `lineOrder` 포함, 삭제하면 키 없음)                         | 400: 배열 아님·원소 규칙 위반·중복·501개 이상("lineOrder는 줄 key 배열(최대 500개)이거나 null이어야 합니다"). 413: **PATCH 본문 128KB 초과**(문구는 `maxBytes / 1024`로 자동 갱신). "하나 이상" 오류 문구의 키 목록에 `lineOrder` 추가 |
| POST   | `/api/interior-plans/{id}/items`, PUT `/api/interior-plans/{id}/items/{itemId}` | `quotes[].vendor` 생략 가능(1단계부터)                                                                      | 생략한 그대로                                                                         | 400: `vendor`가 `""`·공백·`null`·31자. 413: 16KB 그대로                                                                                                                                                                                |
| POST   | `/api/interior-plans`                                                           | `items[].quotes[].vendor?` 받음. **`plan.lineOrder`는 받아도 버린다(저장하지 않음, 201, 400 아님)**         | 그대로(응답·`SELECT data`에 `lineOrder` 없음)                                         | 업체 규칙은 위와 같음. 413: 16KB 그대로                                                                                                                                                                                                |
| POST   | `/api/interior-plans/import`                                                    | 로컬 플랜의 `lineOrder`·업체 미정 견적을 **그대로 보존**해 옮긴다                                           | `{ imported }`                                                                        | 위와 같은 규칙. 한도 1MB 그대로                                                                                                                                                                                                        |

- 계획 POST가 `lineOrder`를 버리는 이유: 이 경로는 항목 id를 서버가 만들어(`createRandomId`) 클라이언트가 보낸 key(`item.id:quote.id`)가 절대 맞지 않는다. 저장하면 영구히 죽은 값이다. ADR-029 조건 2(모르는 키는 버림)와 같은 처리로, `InteriorPlanInput`은 그대로 두고 `parsePlanCreateRequest`에서 구조 분해로 뺀다. `/import`는 항목 id를 보존하므로 `lineOrder`도 보존한다.
- 서버 변경: `parsePlanPatchRequest`의 알려진 키 목록·`lineOrder` 검사(공용 `parseLineOrder` 재사용, `[]` → `null`로 취급), `parsePlanCreateRequest`의 `lineOrder` 버리기, `PLAN_PATCH_MAX_BYTES`를 PATCH `readJsonBody` 한 곳에. 그 밖의 서버 코드 diff는 0이고 기존 `server/**` 테스트 파일 수정도 0이다(새 D1 하네스 파일만 더한다).
- 화면은 줄이 2개 이상인 묶음에서만 끌 수 있어 `lineOrder` 빈 배열을 보낼 일이 없다. 그래도 로컬·서버 모두 `[]`는 키 삭제로 받아 두 경로가 갈라지지 않는다.

## 화면

### 업체 미정 표시 (1단계)

업체를 보이는 곳 전부(코드 grep 결과). **`vendor?`로 바꿔도 타입 오류가 나지 않는 곳이 대부분이다**(JSX 자식 `undefined`, `?? ""`). 아래 목록을 고칠 곳 목록으로 쓰고, 판정은 grep이 아니라 표면별 렌더 출력으로 한다(ADR-036 조건 7, AC-1).

| 위치                                                                                  | 지금                  | 바뀐 뒤                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LineRow.tsx:63` 첫 줄(세부내용 없음)                                                 | `quote.vendor`        | "업체 미정"(흐린 글자, **새 클래스** `tbdText`: `primaryText`(500) 크기에 색만 얹는다. `tbdAmount`는 `composes: amount`(16px 600, nowrap)라 재사용하지 않는다. 새 색 토큰 없음) |
| `LineRow.tsx:59` 둘째 줄(세부내용 있음)                                               | `quote.vendor`        | "업체 미정"(`secondaryText`가 이미 흐린 색이라 일반 업체 이름과 색으로는 같고 글자로만 구별된다)                                                                                |
| `LineRow.tsx:22` 접근 가능한 이름 `nameOf`                                            | 업체가 없으면 빠짐    | "{구분} 업체 미정 {세부내용}" → "… 열기"·"… 확정"                                                                                                                               |
| `buildInteriorPlanTable.ts:43` 표 모델 (타입 주석 `:12` "견적 없는 줄은 ''"도 고친다) | `quote?.vendor ?? ""` | 판별 유니온 3분류 + `tableVendorText` 한 함수                                                                                                                                   |
| `PlanTable.tsx:48` 표·인쇄 칸                                                         | `row.vendor`          | `tableVendorText` 결과("미정", 금액 칸 "미정"과 같은 상수 `INTERIOR_PLAN_TBD_LABEL`)                                                                                            |
| `interiorPlanTableToCsvRows.ts:23` CSV                                                | `row.vendor`          | `tableVendorText` 결과("미정")                                                                                                                                                  |
| `interiorLineDraft.ts:40` 시트 채우기                                                 | `quote?.vendor ?? ""` | `vendorOf` 경유, 미정이면 빈칸                                                                                                                                                  |
| `interiorLineWrites.ts:45`, `ItemSheet.tsx:149-150,252-254`                           | 업체 필수             | 2단계 대상("줄 시트에서 업체 비우기")                                                                                                                                           |
| 새 끌기 알림·`DragOverlay`                                                            | —                     | 위 `nameOf`·줄 글자를 같이 쓴다                                                                                                                                                 |

- 홈 허브·요약·표 머리·`PlanTable.tsx:96`(계 줄의 빈 업체 칸)은 업체를 보이지 않아 바뀌지 않는다(`summarizeHub.ts`, `interiorPlanExportText.ts`).
- 견적 없는 줄은 지금처럼 "견적 없음"이고 표·CSV 업체 칸은 빈칸이다(업체 미정과 구분된다).
- 1단계 줄 시트: 업체 미정 줄을 열면 업체 칸은 `""`이다. 업체 없이 저장하면 지금처럼 "업체 이름을 입력하세요"이고 쓰기 0회다(2단계에서 없어진다).
- 업체 미정의 흐린 글자 대비 4.5:1은 첫 줄(세부내용 없음) 기준으로 잰다.

### 줄 끌어 옮기기 (1단계, 목록 보기)

- **들기**: 줄의 여는 버튼(세부내용·업체·금액 영역)을 마우스·터치로 약 250ms 동안 5px 안에서 누르고 있으면 든다. 그 전에 움직이면 스크롤이고, 짧게 떼면 지금처럼 줄 시트가 열린다. 키보드는 여는 버튼에 포커스를 두고 스페이스로 들고, 위아래 화살표로 옮기고, 스페이스·엔터로 놓고, Esc로 취소한다(엔터는 들기 전에는 시트 열기).
- **손잡이가 아닌 것**: [확정] 체크 라벨(44px 영역)은 들기 손잡이가 아니다(여는 버튼의 형제라 `setActivatorNodeRef`·listeners를 여는 버튼에만 달면 구조상 손잡이가 될 수 없다). 체크를 꾹 눌러도 들리지 않고 지금처럼 체크만 바뀐다. 묶음 끝 [+ {구분}에 줄 추가]와 떠 있는 [+]도 손잡이가 아니다. 별도 손잡이 아이콘은 두지 않는다(저장 목록과 같음, U6).
- **범위**: 같은 구분 묶음 안에서만 움직인다. 다른 묶음 위로 끌고 가 놓으면 제자리다(쓰기 0). 줄이 하나뿐인 묶음의 줄은 들 수 없고 끌기 속성(`aria-roledescription` 등)도 붙이지 않는다. 키보드로 묶음 마지막 줄에서 아래 화살표를 누르면 다음 묶음의 첫 줄로 들어가 `over`가 묶음 밖이 된다. 아래 "묶음 밖" 알림이 이 경우를 다룬다.
- **끄는 동안**: 든 순간의 **묶음 스냅샷**을 그린다. 재조회(함께 쓰는 중 30초·창 포커스)나 다른 탭의 `storage` 이벤트로 줄이 바뀌어도 끄는 줄이 밀리지 않고, 놓은 뒤에 반영한다. 든 줄은 `DragOverlay`로 떠 보이고 원래 자리는 빈 자리(placeholder)다. 놓을 때 저장 값은 `lineOrderAfterMove`가 스냅샷과 놓는 순간의 현재 목록을 합쳐 만든다.
- **놓은 뒤**: 저장이 끝날 때까지 놓은 순서로 보인다(되돌아가 깜빡이지 않게).
  - 놓는 순간 **고정 해제와 pending 설정은 같은 이벤트 안에서** 한다(한 프레임 깜빡임 방지, 저장 목록 `handleReorder`가 이미 그렇다).
  - **pending 순서는 `PlanScreen`에 두고 계획 id와 묶는다**(`{ planId, order }`). 표 보기도 같은 `rows`를 쓰므로 한 곳이어야 저장 중 [표]로 바꿔도 같은 순서가 보인다. `PlanScreen`에 key가 없어 저장 중 다른 계획으로 가면 pending이 다른 계획을 덮을 수 있으므로 id로 묶는다.
  - pending 해제는 `await source.updatePlan(...)`이 **끝난 뒤**(캐시·로컬 스냅샷에 새 순서가 들어간 뒤)다.
  - 저장 중에는 다른 줄을 들 수 없다. 짧게 누르기(시트 열기)와 확정 체크는 된다.
- **저장 실패**: 원래 순서로 되돌리고 그 계획 목록 바로 위에 한 줄(`role="alert"`)로 알린다. 이 줄은 **확정 저장 결과 안내(`useLineConfirmToggle`의 `notice`)와 같은 안내 슬롯 하나**를 쓴다. 다음 끌기가 성공하거나 계획을 바꾸면 지운다. 문구는 `Record<사유, string | null>`(`ORDER_FAILURE_MESSAGES`와 같은 방식, `conflict`는 `updatePlan`에서 나오지 않으므로 `Exclude`로 뺀다)로 둬 사유가 늘면 타입 검사가 걸린다.
  - 네트워크·500: "순서를 저장하지 못해 원래 순서로 되돌렸습니다. 연결을 확인하고 다시 시도해 주세요"(저장 목록 문구와 같음).
  - 로컬 `unavailable`·`corrupt`·`notFound`·`deletedInHousehold`·`notReady`: 기존 `planWriteFailureMessage` 문구 앞에 "순서를 저장하지 못해 원래 순서로 되돌렸습니다. "를 붙인다.
  - 401: `null`. 기존 홈 세션 만료 안내가 알리고(ADR-035 조건 5) 목록 위 줄은 두지 않는다. 출처가 로그아웃으로 바뀌어 로컬 계획이 보인다.
  - 413·400(`invalid`): "순서를 저장하지 못해 원래 순서로 되돌렸습니다"만.
- **스크린리더**: 안내 "순서를 바꾸려면 스페이스 키로 들고 위아래 화살표로 옮긴 뒤 스페이스나 엔터 키로 놓습니다. Esc 키로 취소합니다. 터치 화면에서는 길게 눌러 끕니다."(저장 목록과 같은 문장). 알림은 "'{이름}' 줄을 들었습니다. {구분} 줄 n개 중 k번째입니다." / "… k번째 자리로 옮겼습니다." / "… k번째 자리에 놓았습니다." / 묶음 밖이면 "… 묶음 밖에 있습니다. 놓으면 제자리입니다." / 취소면 "옮기기를 취소했습니다. '{이름}' 줄은 k번째 자리 그대로입니다." 역할 이름 "순서를 바꿀 수 있는 버튼".
- **표 보기**: 끌기 없음. 표·CSV·인쇄는 목록과 같은 순서다.
- **세 출처**: 로그아웃(로컬 `updatePlan`), 로그인 혼자·함께 쓰는 중(서버 PATCH). 화면은 `source.updatePlan(plan.id, { lineOrder })` 하나만 부르고 출처를 모른다. 함께 쓰는 사람의 순서 변경은 다음 재조회에 보인다. 두 사람이 동시에 끌면 나중 저장이 이긴다(데이터 모델 "동시 끌기").
- **구분을 바꾼 줄**: 시트에서 구분을 바꾸면 그 줄은 순서 배열의 자기 자리를 유지한 채 새 묶음에 들어간다. 그 자리에 따라 새 묶음의 중간에 들어가거나, 그 줄이 새 묶음의 가장 이른 줄이면 새 묶음이 앞으로 올 수 있다(지금도 "가장 이른 줄" 규칙 때문에 생기는 일, U7. 예: P + `["r2:rq2","r1:rq1","r3:rq3","r4:rq4","r5:rq5"]`에서 R2의 구분을 "욕실"로 바꾸면 [욕실: R2, R3, R4, R5] → [도배: R1]로 뒤집힌다).
- **코드 위치(공용화 범위, ADR-036 조건 6)**: 전역으로 올리는 것은 `LONG_PRESS`·`KEYBOARD_CODES`·`SCREEN_READER_INSTRUCTIONS`(비-React라 `lib/constants/`)와 센서 설정 묶음(`hooks/`의 훅 하나)뿐이다(Listings·Home 두 container가 쓰므로. CONVENTIONS "승격은 사후에", container 간 import 금지). `CompactListingList`와 `PlanLines`가 같은 export를 import하고 복사하지 않는다. **알림 문장은 각자 둔다**(줄은 "묶음 안 k번째"라 구조가 달라 인자로 합치면 추측성 추상화가 된다). 옮긴 뒤 저장 목록 끌기를 리드가 브라우저에서 다시 확인한다.
- **`DragOverlay`**: 버튼·체크 없는 순수 표시 컴포넌트를 쓰고 `aria-hidden`으로 둔다(같은 `LineRow`를 넣으면 접근 가능한 이름과 체크박스가 중복된다).
- **반복 사용 불편 방지**: 짧게 누르기 = 지금과 같은 시트 열기 · 스크롤은 그대로(누르고 바로 움직이면 스크롤) · 놓은 뒤 스크롤 위치 유지(줄 DOM key `item.id:quote.id` 그대로라 다시 마운트되지 않음) · 실패 안내는 목록 바로 위 · 순서는 기기를 바꿔도 같음.

### 줄 시트에서 업체 비우기 (2단계)

- 라벨 "업체(비우면 미정)"(견적 "견적(비우면 미정)"과 같은 관례). 필수 오류 "업체 이름을 입력하세요"를 없애고 길이만 본다(31자 오류는 그대로).
- 칸 순서는 그대로다: 구분 → 세부내용(선택) → 업체(비우면 미정) → 견적(비우면 미정) → 비고(선택) → 확정.
- 저장 규칙(U2):
  - 업체·견적·세부내용 중 하나라도 있으면 견적 1개 줄이다. 비운 칸은 키가 없다.
  - 셋 다 비고 확정이 **꺼져** 있으면 견적 없는 줄이다(구분·비고만). 새 줄이면 `quotes` 키 없는 항목, 견적 없는 줄을 고치면 그대로 견적 없는 줄.
  - 셋 다 비고 확정이 **켜져** 있으면 견적 `{ id }` 하나를 만들어 확정한다(업체·금액 미정, "금액 미정 n건"에 센다).
  - 이미 견적이 있는 줄에서 셋을 모두 지우면 견적은 남는다(`{ id, contact? }`). 견적을 없애는 것은 [삭제]다.
- **`editedQuote`는 `vendor`도 `memo`·`amount`·`amountWon`처럼 구조 분해로 빼고 값이 있을 때만 넣는다**(ADR-036 조건 9; 지우면 키 삭제). 지금은 `{...rest}`가 기존 `vendor`를 펼친 뒤 덮어쓰므로, 덮어쓰기만 없애면 지운 업체가 남는다. `vendor?`가 되면 `Omit<InteriorQuote, "vendor">` 매개변수 타입은 필요 없다.
- 견적 없는 줄 확정 체크 안내(`LineRow.tsx:81`, 화면에 안 보이는 설명): "견적이 없어 확정할 수 없습니다. 줄을 열어 [확정]을 켜세요"(U3). 체크는 지금처럼 비활성이다.

## 수용 기준

예시 **V**: `makeSimplePlanPPlus()`(P⁺ = R1~R7) 뒤에 R8 "조명 · 업체 키 없음 · 거실 간접등 · `amountWon: 300000` · ✓", R9 "철거 · 견적 `{ id: "rq9" }`(업체·금액·세부내용 없음) · 미확정"을 이 순서로 더한다(총 예산 `budget: 1000`). fixture는 `src/test/interiorSimpleFixture.ts`에 **추가만** 한다(기존 헬퍼는 `vendor: string` 인자라 V의 R8·R9를 못 만드므로 새 헬퍼를 더한다). 테스트 리터럴은 이 문서의 문자열을 그대로 쓰고 상수에서 가져오지 않는다. 줄 key는 `r{n}:rq{n}`, L은 `item-x:q1`·`item-x:q2`·`item-y:`·`item-z:q3`다(기본 순서 x → y → z, 구분은 X·Z가 욕실, Y가 도배).

- [ ] **AC-0 데이터 보존(최우선)**
  - (a) 기존 데이터 무변화.
    - **기대값은 변경 전(f5ad2b0) 결과를 리터럴 JSON 골든으로 먼저 커밋한다**(변경 후 코드로 기대값을 만들면 순환이 된다). P·L·옛 P(`makePlanP`)·P⁺·M 원문을 `parseInteriorPlans`에 넣은 결과가 이 골든과 `toStrictEqual`이다(`lineOrder` 키가 생기지 않고 `vendor`가 그대로). 같은 입력을 서버 하네스 GET으로 받아도 같다.
    - P·L·P⁺·M의 목록 묶음·줄 순서, 표, CSV(`SIMPLE_P_CSV_LINES`·`LEGACY_L_CSV_LINES`·`SIMPLE_P_PLUS_CSV_LINES`·`PLAN_M_CSV_LINES`)가 diff 0으로 통과한다(`lineOrder` 없으면 지금 순서).
  - (b) 검증 경계.
    - `validateInteriorPlan.test.ts`의 `quote({ vendor: undefined })` → null(192행) 한 줄만 의도된 **반전**("업체 키 없음 → 통과, 결과에 `vendor` 키 없음, `Object.hasOwn`")으로 바꾸고 감사 기록에 반전으로 남긴다. 188~191·193행은 그대로 통과한다. 기계 검증: `git diff -U0 -- src/lib/utils/validateInteriorPlan.test.ts | grep -c '^-.*expect('`가 정확히 1이다.
    - 새 단언: `vendor: null`·`0` → null, 키 없음·`undefined` → 통과(키 없음), `{ id }`만 있는 견적 → 통과.
    - `lineOrder`(`parseLineOrder`와 `validateInteriorPlanFields`): 키 없음·`[]` → 결과에 키 없음(공용 필드), `["r1:rq1", "item-y:"]` → 그대로, 500개 → 통과, 501개·중복·`"a"`·`"a:b:c"`·`":q"`·65자 id·숫자 원소·문자열(배열 아님)·`null` → 플랜 null.
    - **빈 배열·null 정책(로컬·서버 각 한 줄로 고정)**: 로컬 `updatePlan(id, { lineOrder: [] })`와 `{ lineOrder: null }` → 둘 다 그 플랜의 `lineOrder` 키 삭제(`applyPlanPatch` 경로). 서버 PATCH `lineOrder: []`와 `null` → 둘 다 200, `SELECT data`에 키 없음. 두 경로 모두 400이 아니다.
    - 서버 하네스(새 D1 파일, 기존 `server/**` 테스트 수정 0):
      - 업체 없는 견적의 항목 POST·PUT·계획 POST·`/import` 200, `vendor: ""`·`null` 400.
      - PATCH `lineOrder` 200, 거부 값(위 목록의 배열 아님·원소 규칙 위반·중복·501개) 400.
      - **크기**: 64자 id 두 개로 만든 서로 다른 key 500개 PATCH 200이고 GET이 입력과 `toStrictEqual`. 본문 정확히 128KB 200, +1바이트 413(`payloadTooLarge`)이고 413이면 행이 안 바뀐다. 이름·예산과 함께 보내도 같은 한도. 항목 PUT·계획 POST는 16KB+1에서 계속 413.
      - **계획 POST의 `lineOrder`**: 보내도 201이고 `SELECT data`에 `lineOrder` 키가 없다(`/import`는 보존: 아래 (e)).
    - 클라이언트 응답 파서: 서버가 업체 미정 견적·`lineOrder`가 든 GET·POST·PUT·PATCH 응답을 돌려줘도 `loadFailed`가 되지 않는다(로그인 `AppRoutes` 테스트 1개).
  - (c) 읽기만으로 쓰기 0, 원문 보존.
    - localStorage 키 이름과 `{ plans }` 형식은 그대로이고 새 키는 0개다. 기존 `AppRoutes.storageKeys*.test.tsx`는 storage 단언을 한 줄도 약화하지 않고 통과한다.
    - V(`lineOrder` 있는 것·없는 것 두 가지)와 L을 **들여쓴 JSON**으로 시드한 뒤 열기 → R8·R9 시트 열고 닫기 → 줄 짧게 누르기 → 꾹 눌러 들었다가 Esc → 들었다가 제자리에 놓기 → 다른 묶음 위에 놓기 → [표] → CSV·인쇄 → 홈을 거쳐도 `interior-plans` 원문이 `===`이고, `setItem`·`removeItem` 스파이 호출이 0회다(원문 `===`만으로는 같은 내용을 다시 쓰는 경로를 못 잡는다). 로그아웃·로그인 혼자·가구 세 모드에서 확인한다(로그인·가구는 `api.writes()`가 `[]`, 로그아웃은 스토리지 스파이 0회). 들기·놓기 동작 중 jsdom에서 자동화되지 않는 것(AC-4 스파이크 결과)은 키보드 경로로만 확인하고 그 사실을 qa 기록에 적는다.
    - 탭 간: V(`lineOrder` 포함) 원문을 `storage` 이벤트로 흘려 보내면 목록이 정상 갱신되고 `corrupt`가 되지 않으며, 이후 목록 순서까지 `lineOrder`대로다.
  - (d) 쓰기 입력·보존.
    - 끌기 한 번(P에서 R2를 R1 위로): 로컬은 `setItem` 정확히 1회이고 그 플랜의 `lineOrder`·`updatedAt`만 다르며 `items`와 다른 플랜은 `toStrictEqual`이다. 서버는 PATCH 정확히 1건, 본문 `{ plan: { lineOrder: ["r2:rq2", "r1:rq1", "r3:rq3", "r4:rq4", "r5:rq5"] } }`와 `toStrictEqual`, 항목 PUT 0건.
    - `lineOrder`가 있는 플랜에서 설정 시트로 이름만 바꾸면(로컬·서버) `lineOrder`가 그대로다. 줄 추가·수정·확정·삭제도 `lineOrder`를 건드리지 않는다.
    - 업체 미정 견적 보존(1단계): R8 확정 끄기 → `confirmedQuoteId`만 빠지고 R8 견적에 `vendor` 키가 계속 없다. 업체 미정 견적 q2를 단 `makeFullItem`의 q1 수정 → q2 그대로. n≥2 항목에서 업체 미정 견적 삭제 → 나머지 그대로. 업체 미정 줄에 업체 "빛나라조명" 채우기 → `vendor`만 추가.
    - 2단계: 업체 있는 줄의 업체를 지우고 저장하면 `vendor` 키 삭제(`vendor: undefined`·`""`가 남으면 실패).
  - (e) 왕복.
    - 로컬 `createInteriorPlanStore`·D1 하네스·가구 모드에 V 항목을 POST·PUT하고 `lineOrder`를 PATCH한 뒤 GET하면 입력과 `toStrictEqual`이다. PATCH `lineOrder: null` 뒤 D1 `SELECT data`에 `lineOrder` 키가 아예 없다(로컬 `applyPlanPatch`도 같은 단언).
    - 로그아웃에서 만든 V(`lineOrder` 포함)로 로그인하면 `/import` 200, 서버 GET 뒤 9줄·같은 순서·지출 예정 8,300,000원·미정 1건이다.
  - (f) **2단계 배포 게이트(절차 게이트, ADR-036 조건 1)**. 자동 테스트로 판정할 수 없고 main에 필수 체크가 없어 기계가 머지를 막지 못한다. **게이트는 사용자 확인뿐**이고 시간 대기는 없다(ADR-033 뒤집힘, 메모리 규칙).
    - 태스크 2는 다음이 모두 충족된 뒤 바로 머지한다: ① 태스크 1의 배포 커밋·시각이 `.cony/log.md`와 ADR-036에 있다. ② 사용자 두 사람이 각 기기(PC·휴대폰)의 열린 우리 집 탭을 닫거나 새로고침했다고 확인했다. ③ "로그인 없이 만들어 아직 계정으로 옮기지 않은 로컬 계획이 있는가"에 답을 받았다(있으면 로그인해 이전을 확인하거나, 손상 화면에 닿으면 [초기화] 전에 원문을 복사하도록 안내).
    - **qa 기록의 필수 증거(하나라도 없으면 2단계 판정은 실패, qa C10)**:
      - 1단계 커밋 SHA와 `git merge-base --is-ancestor <sha> HEAD`의 종료 코드 0, 배포 시각(`.cony/log.md` 줄 인용).
      - 배포됐다는 증거: 머지만으로는 부족하다. 배포된 서버에서 PATCH `lineOrder`가 200으로 응답하는 운영 스모크 한 줄(읽기 전용으로 확인 가능한 방법, 예: 배포 버전 ID).
      - 사용자 두 사람의 탭 정리 확인과 로컬 전용 계획 질문의 답: 일시와 원문 인용.
      - `git diff --stat {1단계 커밋}..HEAD -- src/lib/utils/validateInteriorPlan.ts src/lib/types/interiorPlan.ts server/` 출력이 비어 있다(0줄, `server/`에는 서버 테스트 파일도 포함). PR에 첨부한다.
    - **롤백 하한 = 태스크 1 커밋.** 2단계에 문제가 있으면 revert PR로 1단계 상태에 맞춘다. 1단계 이전 커밋·번들(대시보드 롤백 버튼 포함)로 되돌리지 않는다(업체 미정 데이터를 손상으로 읽고, 로컬 `lineOrder`도 지운다). 지금 하한 3c0bdc2는 이 커밋으로 올라간다.
  - (g) 옛 파서 기록(영구 테스트는 두지 않는다). 절차를 고정한다(qa C8):
    1. 새 코드 트리에서 V 원문과 "P + `lineOrder`" 원문을 `JSON.stringify`로 파일에 내보낸다(이 JSON이 단일 출처).
    2. `git worktree add <scratch>/old f5ad2b0`(1단계 직전 main)로 옛 트리를 만들고 `node_modules`는 심볼릭 링크로 연결한다.
    3. 옛 트리에서 임시 테스트 한 개가 `parseInteriorPlans(rawText)`에 두 원문을 넣고 V → `status: "corrupt"`, "P + `lineOrder`" → `ok`이며 `lineOrder`만 없음을 단언한다.
    4. 옛 `createInteriorPlanStore`로 `lineOrder`가 든 시드에 `addItem`을 한 번 한 뒤 원문에서 `lineOrder`가 사라지는지도 기록한다(예상된 동작을 데이터로 남긴다).
    5. 통과·실패 로그를 qa 기록에 붙이고 worktree를 지운다. 태스크 2에서는 1단계 커밋으로 같은 절차를 되풀이해 V → `ok`를 확인한다.
  - (h) **일부러 넣은 버그에서 테스트가 실제로 실패하는지** 하나씩 켰다 끄고, 실패한 테스트 이름을 기록한다(실패하지 않으면 그 테스트는 지키는 것이 없다).
    - ① `parseQuote`가 `vendor: ""`를 받게 하기
    - ② 업체를 지울 때 기존 `vendor`가 `{...rest}`로 남게 하기(2단계)
    - ③ 로컬 `applyPlanPatch`에서 `lineOrder` 빠뜨리기
    - ④ 읽기 규칙에서 `item.id:` 대체 자리 빼기
    - ⑤ `lineOrderAfterMove`가 그 묶음 key만 돌려주기
    - ⑥ 표 모델에서 견적 없음과 업체 미정을 `""` 하나로 합치기
    - ⑦ 끄는 동안 재조회 목록으로 다시 그리기
    - ⑧ `parseLineOrder`가 중복 / 501개 / 정규식(`"a:b:c"`, `":q"`)을 통과시키기
    - ⑨ 서버 `parsePlanPatchRequest`가 `lineOrder`를 모르는 키로 처리(조용히 무시)하거나 `[]`를 400으로 만들기
    - ⑩ 서버 PATCH가 `json_patch` 대신 전체 교체로 바뀌어 다른 키 PATCH가 `lineOrder`를 지우기
    - ⑪ `lineOrderAfterMove`가 묶음을 기본 순서로 이어 붙이기(보이는 묶음 순서 무시)
    - ⑫ 제자리/다른 묶음/Esc에서도 쓰기가 일어나기
    - ⑬ 저장 실패 시 `pendingOrder`가 풀리지 않거나 실패 안내가 안 뜨기, 다음 성공 끌기에서 안내가 안 지워지기
    - ⑭ [확정] 체크 라벨이 끌기 손잡이가 되기(listeners 위치 오류)
    - ⑮ `/import` 경로가 `lineOrder`를 버리기
    - ⑯ `parseQuote`가 `vendor: undefined` 키를 남기기(`Object.hasOwn` 단언)
    - ⑰ 목록 `LineRow`가 업체 미정에서 빈 첫 줄이나 빈 접근 이름을 내기
    - ⑱ 표/CSV가 견적 없음과 업체 미정을 한 문자열로 합치기(⑥의 CSV 쪽)
  - (i) `pnpm lint`·`format:check`·`test`·`build`(worker 타입 검사 포함)와 `server/**` 테스트가 통과한다.
- [ ] **AC-1 업체 미정 표시**(태스크 1). 표면별 **렌더 출력**으로 판정한다(grep 아님; `rg "\.vendor\b" src` 허용 목록은 PR 첨부용).
  - V를 열면 묶음은 [도배: R1, R2, R7] → [욕실: R3, R4, R5] → [조명: R6, R8] → [철거: R9]이다.
  - R8은 첫 줄 "거실 간접등", 둘째 줄 "업체 미정"(흐린 글자), 금액 "300,000원", 체크됨. R9는 첫 줄 "업체 미정"(흐린 글자), 금액 "미정", 체크 안 됨. R8·R9 어디에도 빈 첫 줄이나 "undefined"가 없다. 흐린 글자는 새 클래스(`tbdText`) 이름 단언 + 수동 대비 4.5:1로 판정한다.
  - 접근 가능한 이름은 `toBe`로 같다: R8 "조명 업체 미정 거실 간접등 확정", R9 "철거 업체 미정 확정"(각각 "… 열기"도).
  - 요약: 지출 예정 8,300,000원 · 남은 예산 1,700,000원 · "금액 미정 1건 제외"(R9는 미확정이라 세지 않음). R9를 확정하면 "금액 미정 2건 제외", 지출 예정 그대로.
  - 허브: "우리 집 · 지출 예정 8,300,000원 · 미정 1건"(지금 형식 그대로).
  - CSV는 정확히 11행(`toStrictEqual`): `구분,업체,세부내용,견적(원),확정(원),비고` / `도배,육문수,실크 전체,1800000,1800000,` / `도배,동네도배,합지,1500000,,` / `도배,한솔도배,,미정,,` / `욕실,하루바스,철거·방수 (1),3700000,3700000,` / `욕실,욕실나라,철거·방수 (1),4000000,,` / `욕실,하루바스,타일 덧방 (2),2500000,2500000,` / `조명,빛나라조명,거실 매입등,미정,미정,` / `조명,미정,거실 간접등,300000,300000,` / `철거,미정,,미정,,` / `계,,,,8300000,금액 미정 1건 제외`.
  - 표·인쇄의 R8·R9 업체 칸은 "미정"이고, 같은 계획에 L의 Y(견적 없음)를 두면 Y의 업체 칸은 빈칸이다.
  - 표 모델 단위: 업체 이름이 글자 그대로 "미정"(그리고 "tbd")인 견적과 업체 키 없음 견적이 서로 다른 칸 값이다(버그 ⑥·⑱의 직접 검출).
  - 새 `DragOverlay`·키보드 알림 문구가 `nameOf`를 재사용한다.
  - 1단계 시트: R9를 열면 업체 칸 `value === ""`, 업체 없이 저장하면 "업체 이름을 입력하세요"(업체 칸 아래)·쓰기 0회. 업체 "철거왕"을 넣어 저장하면 R9 견적이 `{ id: "rq9", vendor: "철거왕" }`이 되고 줄 위치는 그대로다.
- [ ] **AC-2 줄 순서 읽기 규칙**(태스크 1, `buildInteriorPlanRows` 단위 + 목록·표 각 1개)
  - P + `lineOrder: ["r5:rq5", "r3:rq3", "r4:rq4", "r2:rq2", "r1:rq1"]` → [욕실: R5, R3, R4] → [도배: R2, R1]. 표·CSV도 이 순서다.
  - 일부만: P + `["r2:rq2"]` → [도배: R2, R1] → [욕실: R3, R4, R5].
  - 지워진 key: P + `["gone:q", "r2:rq2", "r1:rq1"]` → [도배: R2, R1] → [욕실: R3, R4, R5], 오류 없음.
  - 전부 지워진 key: 아무 줄도 매칭되지 않으면 결과가 기본 순서와 `toStrictEqual`이다.
  - 새 줄: P + `["r2:rq2", "r1:rq1", "r3:rq3", "r4:rq4", "r5:rq5"]`에 도배 R10(`r10:rq10`)을 더하면 [도배: R2, R1, R10], 새 구분 "조명" R11을 더하면 맨 끝 [조명: R11].
  - **빈 줄 대체 자리**(버그 ④를 잡는 예시): L + `["item-y:", "item-z:q3", "item-x:q1", "item-x:q2"]` → [도배: Y] → [욕실: Z, X q1, X q2]. 대체 자리가 없으면 Y가 위치 없음으로 맨 끝에 붙어 욕실이 먼저 와서 실패한다. Y를 견적 1개(`item-y:qn`)로 채워도 같은 배열에서 순서가 같다.
  - 묶음 순서는 그 묶음 줄의 가장 이른 위치다: P + `["r3:rq3", "r1:rq1", "r4:rq4", "r2:rq2", "r5:rq5"]` → [욕실: R3, R4, R5] → [도배: R1, R2].
  - **병합 경계**(qa C3):
    - 자기 key와 `item.id:`가 둘 다 있으면 자기 key가 이긴다: L(Y를 `item-y:qn`으로 채움) + `["item-y:", "item-x:q1", "item-y:qn"]` → Y는 3번째 자리 → [욕실: X q1, X q2, Z] → [도배: Y].
    - 견적이 여러 개인 항목에 `item.id:`만 있으면 모든 견적이 같은 위치를 받고 기본(견적) 순서를 유지한다: L + `["item-z:q3", "item-x:"]` → [욕실: Z, X q1, X q2] → [도배: Y].
    - 견적 하나를 지운 n≥2 항목의 남은 견적은 자기 자리를 유지한다: L + `["item-z:q3", "item-x:q2", "item-x:q1"]`에서 q1을 지우면 [욕실: Z, X q2]. 마지막 견적을 지워 견적 없는 줄이 되면 key가 `item.id:`로 바뀌고 대체 자리(`item.id:`)가 `lineOrder`에 없으면 위치 없음이라 맨 끝으로 간다(개선하지 않고 이 동작을 고정, A9): L + `["item-z:q3", "item-x:q1", "item-x:q2"]`에서 Z의 q3를 지우면 [욕실: X q1, X q2, Z] → [도배: Y].
    - 구분을 바꾼 줄(U7): P + `["r2:rq2","r1:rq1","r3:rq3","r4:rq4","r5:rq5"]`에서 R2의 구분을 "욕실"로 바꾸면 [욕실: R2, R3, R4, R5] → [도배: R1].
    - 구분 앞뒤 공백: "도배 "와 "도배"는 같은 묶음이다. 이동 함수의 `groupTrade`도 trim 기준이다.
- [ ] **AC-3 끌어 옮기기 저장**(태스크 1, 세 출처 각각)
  - P에서 R2를 R1 위로 놓으면 AC-0(d)의 본문 하나로 저장되고, 목록 [도배: R2, R1] → [욕실: R3, R4, R5], [표]·CSV도 같은 순서다. 새로고침해도(로컬)·다른 기기 GET에서도(서버·가구) 같다.
  - **`lineOrderAfterMove` 단위**(전역 `arrayMove`를 잘못 쓴 구현을 걸러내는 예시):
    - P⁺(R1~R7)에서 도배 묶음은 R1, R2, R7이고 R7은 기본 항목 순서에서 R3~R6 뒤에 있다. R7을 R1 위로 놓으면 `["r7:rq7","r1:rq1","r2:rq2","r3:rq3","r4:rq4","r5:rq5","r6:rq6"]`이다.
    - `lineOrder`가 이미 묶음 순서를 바꾼 상태(P + `["r3:rq3","r1:rq1","r4:rq4","r2:rq2","r5:rq5"]`, 보이는 순서 [욕실] → [도배])에서 도배 묶음의 R2를 R1 위로 놓으면 `["r3:rq3","r4:rq4","r5:rq5","r2:rq2","r1:rq1"]`이다(보이는 묶음 순서 유지).
    - 연속 두 번: P에서 R2를 R1 위로, 이어서 R5를 R3 위로 놓으면 결과가 `["r2:rq2","r1:rq1","r5:rq5","r3:rq3","r4:rq4"]`로 첫 번째 이동이 남아 있다.
    - 입력 규칙: 스냅샷 이동 결과 중 현재 묶음에 남은 key + 현재 묶음에 새로 생긴 key를 붙이고, 다른 묶음은 놓는 순간의 현재 값이다. 스냅샷에는 R1이 있고 현재에는 지워졌으며 R6이 새로 생긴 경우 결과에 R1 key가 없고 R6이 맨 끝 자기 묶음에 있다.
    - null(쓰기 없음): 제자리(active == over), 줄 1개 묶음, 없는 activeKey/overKey, 다른 묶음의 overKey, 든 줄이 현재 목록에서 사라짐, 든 줄의 구분이 바뀜.
    - 불변식: 묶음 안 이동은 묶음 순서를 바꾸지 않고, 결과 길이 = 현재 줄 수, 지워진 key·중복 없음, **출력이 항상 `parseLineOrder`를 통과**한다. 입력에 지워진 key·옛 `item.id:` key가 섞인 경우와 줄 500개(항목 100 × 견적 5) 계획에서도 마찬가지다.
    - 왕복: P의 5줄 순열 몇 개 × `lineOrderAfterMove`를 적용한 뒤 `buildInteriorPlanRows`로 다시 읽으면 "그 묶음 안만 `arrayMove`한 목록"과 같다(작은 완전 열거).
  - 제자리 놓기·다른 묶음 위에 놓기·Esc 취소 → 쓰기 0회.
  - 저장 지연 중(응답 보류): 놓은 순서로 보이고 다른 줄을 들 수 없으며, 짧게 누르기(시트)·확정 체크는 된다. 성공하면 같은 순서 그대로(깜빡임 없음: 렌더 순서 스냅샷이 "놓은 순서 → 놓은 순서"이고 원래 순서 중간 렌더 없음). 저장 중 [표]로 바꿔도 놓은 순서이고, 저장 중 다른 계획으로 가도 pending이 새지 않는다.
  - 저장 실패(서버 500·네트워크, 로컬 `setItem` 예외): 원래 순서로 돌아오고 목록 바로 위에 "순서를 저장하지 못해 원래 순서로 되돌렸습니다. …" 한 줄. 401: 세션 만료 안내, 목록 위 줄 없음, 출처 전환 뒤 로컬 계획이 보인다. 다음 끌기가 성공하거나 계획을 바꾸면 안내가 사라진다.
  - 함께 쓰는 중: 들고 있는 동안 재조회로 R1이 지워지고 R6가 더해져도 끄는 목록은 든 순간 그대로이고(`console.error`·`console.warn` 스파이로 중복 key 경고 0), 놓으면 저장된 순서에서 R1 key는 없고 R6은 맨 끝 자기 묶음에 보인다.
  - 줄 500개: `lineOrderAfterMove`와 서버 PATCH는 500줄로 자동 검증하고(저장 한도는 AC-0(b) 서버 하네스), 화면 끌기는 30줄 정도로 줄여 본다.
- [ ] **AC-4 끌기 상호작용·접근성**(태스크 1). **jsdom 스파이크 먼저**(ADR-036 조건 7): 묶음 2개·줄 rect 스텁으로 키보드 Space → ArrowDown → Space에 `onReorder`가 한 번 불리는지 짧게 확인한다(`getBoundingClientRect`가 전부 0이면 이동 대상을 못 찾고, `DragOverlay`는 `Element.animate`가 없어 오류가 날 수 있어 `dropAnimation`을 끄거나 폴리필이 필요하다). 결과는 qa 기록에 적는다.
  - 되면: 키보드·알림·Esc를 자동 테스트로 둔다.
  - 안 되면: 순수 함수(`lineOrderAfterMove`) + `onDragEnd` 접착 테스트(`DndContext`를 모킹해 `onDragStart/End/Cancel`을 직접 호출)로 줄이고, 꾹 누르기·키보드 이동·놓은 뒤 시트 안 열림·`DragOverlay`는 **리드 브라우저 확인**으로 넘긴다.
  - 마우스·터치: 250ms 미만 누르고 떼면 줄 시트가 열리고 쓰기 0회. 250ms 전 5px 넘게 움직이면 들지 않는다(스크롤). 250ms 넘게 누르면 들고, 놓은 뒤 시트가 열리지 않는다.
  - 확정 체크 라벨을 꾹 눌러도 들리지 않고 체크만 한 번 바뀐다. [+ {구분}에 줄 추가]·떠 있는 [+]도 들리지 않는다.
  - 키보드: 여는 버튼에서 엔터 → 시트, 스페이스 → 들기, 아래 화살표 → 다음 자리, 스페이스 → 놓기(저장 1회), 다시 들고 Esc → 제자리·쓰기 0회.
  - 스크린리더 안내·알림이 "화면 — 줄 끌어 옮기기"의 문장 그대로다(묶음 안 위치 "n개 중 k번째").
  - 줄이 하나인 묶음([철거: R9])의 여는 버튼에는 `aria-roledescription`이 없고 스페이스는 들지 않는다.
  - 표 보기에는 끌기 속성·`DragOverlay`가 없다. 시트가 열린 동안 목록은 inert라 들 수 없다.
  - **공용화 범위**: 꾹 누르기 값(`LONG_PRESS`)·키보드 키(`KEYBOARD_CODES`)·안내 문장(`SCREEN_READER_INSTRUCTIONS`)·센서 설정은 한 곳에서 가져온다(`CompactListingList`와 `PlanLines`가 같은 export를 import, 복사 0, 값은 단위 테스트로 단언). 알림 문장은 각자 둔다. 태스크 1-0이 저장 목록 끌기 특성 테스트(`CompactListingList.test.tsx`, 키보드·꾹 누르기 14개)를 더했으므로 공용 export로 옮긴 뒤 **그 파일 diff 0으로 통과**해야 하고, 리드가 브라우저에서 저장 목록 끌기를 다시 확인한 결과도 qa 기록에 남긴다(ADR-036 조건 6).
  - 수동 확인: iOS Safari·Android Chrome에서 꾹 눌러 끌기, 끄는 중 화면 끝 자동 스크롤, 360px에서 든 줄 모양, 끄는 중 텍스트 선택·확대경이 뜨지 않는지.
- [ ] **AC-5 시트에서 업체 비우기**(태스크 2)
  - [+]에서 구분 "조명", 세부내용 "거실 간접등", 견적 300,000, 업체 빈칸, 확정 켜고 저장 → `addItem` 입력이 `{ spaceId: "sp-whole", trade: "조명", quotes: [{ id, memo: "거실 간접등", amountWon: 300000 }], confirmedQuoteId: id, status: "planned" }`와 `toStrictEqual`(`vendor` 키 없음).
  - 구분 "철거"만 적고 확정 끈 채 저장 → `{ spaceId: "sp-whole", trade: "철거", status: "planned" }`(`quotes` 키 없음), 목록 "견적 없음". 확정 켠 채 저장 → `quotes: [{ id }]`·`confirmedQuoteId: id`, 목록 "업체 미정 · 미정", "금액 미정 1건 제외"(U2).
  - L의 Y에서 비고만 고쳐 저장 → 견적 없는 줄 그대로(`quotes` 키 없음), 예산 200·상태·`spaceId` s0 유지. 업체 "육문수"만 채우면 견적 1개(금액 없음).
  - R1의 업체를 지우고 저장 → `quotes[0]`이 `{ id: "rq1", amountWon: 1800000, memo: "실크 전체" }`(`vendor` 키 없음, 시트 저장은 금액을 원 키로 쓰고 옛 `amount`를 지운다, ADR-034 조건 4), 목록 "실크 전체 / 업체 미정". R1의 업체·견적·세부내용을 모두 지우면 견적 `{ id: "rq1" }`가 남는다(줄이 "견적 없음"이 되지 않음).
  - 업체 `"   "` → 미정, 31자 → 업체 칸 아래 오류·쓰기 0회. 업체 라벨 "업체(비우면 미정)".
  - 견적 없는 줄 체크의 설명이 "견적이 없어 확정할 수 없습니다. 줄을 열어 [확정]을 켜세요"이고 그 문구와 "업체 이름을 입력하세요"를 단언하던 기존 테스트(`interiorLineDraft.test.ts`·`MortgageHome.lines/lineSheet/createSimple.test.tsx`·`interiorTbdStage2Qa.test.ts`)가 반전으로 기록되며 함께 고쳐진다.

## 태스크

기준: 지금 main(f5ad2b0, 전체 UI 개편 머지 뒤) 위에서 시작한다. PR 미리보기가 운영 D1을 쓰는지 확인되기 전에는 실계정으로 미리보기에 쓰지 않고 로컬 하네스·`pnpm dev`로 검증한다(ADR-033 조건 9).

- [x] 1. **업체 미정 읽기·표시·보존 + 줄 끌어 옮기기(1단계 배포 = expand)** — 업체를 비우는 화면은 아직 없다
  - [ ] 1-0. 착수 전 선행 (담당: qa)
    - 변경 전(f5ad2b0) 결과를 리터럴 JSON 골든으로 먼저 커밋한다(AC-0(a)).
    - jsdom 끌기 스파이크(AC-4): 어느 AC가 자동·수동인지 정한다.
  - [ ] 1-1. 공용 검증·서버·로컬 쓰기 (담당: be)
    - 타입: `InteriorQuote.vendor?`, `InteriorPlan.lineOrder?`, `InteriorPlanInput`·`InteriorPlanPatch`에 `lineOrder`.
    - `validateInteriorPlan.ts`: `parseQuote` 업체 선택, `parseLineOrder(value): string[] | null`(export, 비어 있지 않은 유효 배열만, 정규식은 `ID_PATTERN`에서 만듦), `validateInteriorPlanFields`에 `lineOrder`(`[]` → 키 없음). `constants/interiorPlan.ts`에 `INTERIOR_LINE_ORDER_MAX_COUNT`(두 상수의 곱).
    - 서버: `parsePlanPatchRequest`의 알려진 키·오류 문구·`[]` → `null`과 같은 키 삭제, `parsePlanCreateRequest`가 `lineOrder`를 버림, `PLAN_PATCH_MAX_BYTES = 128 * 1024`(근거 주석)를 PATCH `readJsonBody` 한 곳에만.
    - 로컬: `applyPlanPatch`에 `lineOrder` 합치기(`null`·`[]` → 키 삭제), `updatePlan`이 `lineOrder`를 돌려주는지 확인.
    - `validateInteriorPlan.test.ts` 반전 1줄과 새 단언, 새 D1 하네스 파일(항목·계획·import·PATCH 왕복, 거부 값, 413 경계, 계획 POST의 `lineOrder` 버림, 가구 모드, `SELECT data`).
  - [ ] 1-2. 업체 미정 표시 (담당: fe)
    - "화면 — 업체 미정 표시" 표의 위치 전부. `vendorOf` 한 함수, 표 모델 업체 칸 판별 유니온 + `tableVendorText`, 새 클래스 `tbdText`. "업체 미정"(목록)·"미정"(표·CSV·인쇄) 글자는 `lib/constants/interiorPlanTable.ts`에 모은다.
    - 타입 오류가 안 나는 곳이 많으므로 `rg "\.vendor\b" src`로 다시 확인하고 허용 목록을 PR에 첨부한다.
    - 쓰기(`interiorLineWrites`)가 업체 미정 견적을 보존하는지 확인(1단계는 코드 변경 없이 테스트만). V용 새 fixture 헬퍼.
  - [ ] 1-3. 줄 순서 읽기·끌기 (담당: fe)
    - `buildInteriorPlanRows`에 `lineOrder` 읽기 규칙(대체 자리 포함), 순수 함수 `lineOrderAfterMove`(스냅샷 + 현재 묶음 입력).
    - `PlanLines`·`LineRow`를 묶음마다 `SortableContext`(`LineGroup`)로, 든 순간 묶음 스냅샷 고정, 버튼 없는 `DragOverlay` 표시 컴포넌트, 알림 문장. `LONG_PRESS`·`KEYBOARD_CODES`·`SCREEN_READER_INSTRUCTIONS`는 `lib/constants/`로, 센서 설정은 `hooks/` 훅 하나로 올리고 `CompactListingList`가 같은 것을 import(알림 문장은 각자).
    - `PlanScreen`에서 놓으면 `source.updatePlan(plan.id, { lineOrder })`. pending 순서는 `PlanScreen`에 계획 id와 묶어 두고 `await` 뒤 해제, 실패 문구 `Record<사유, string | null>`, 안내 슬롯은 확정 저장 결과와 하나.
  - [ ] 1-4. 검증 (담당: qa)
    - AC-0(a)~(e)(g)(h)(i), AC-1~AC-4. V fixture 추가. 버그 ①~⑱(② 제외, 2단계) 결과 기록.
    - 수동 확인: 같은 origin·같은 포트에서 1단계 직전 빌드 탭을 연 채 새 빌드 탭에서 끌기 저장 → 옛 탭이 손상 없이 기본 순서로 보이는지, 옛 탭에서 쓰기 한 번 뒤 `lineOrder`가 빠지는지(예상된 동작) 기록. 모바일 끌기(AC-4 수동 항목), 저장 목록 끌기 재확인(리드), 흐린 "업체 미정" 대비 4.5:1, 인쇄 미리보기.
    - 1단계 배포 커밋·시각을 `.cony/log.md`와 ADR-036에 남긴다(새 롤백 하한).
- [x] 2. **시트에서 업체 비우기(2단계 배포 = contract)** — AC-0(f) 게이트(배포 기록 · 두 사람 탭 정리 확인 · 로컬 전용 계획 질문)를 충족하면 바로 머지
  - [ ] 2-1. 시트·쓰기 (담당: fe)
    - `interiorLineDraft`: 업체 선택 칸(길이만), `InteriorLineValues.vendor?`, 라벨 "업체(비우면 미정)".
    - `editedQuote`의 `vendor` 구조 분해, `addLineInput`·`editLineInput`의 U2 규칙(셋 다 빔 + 확정 꺼짐 → 견적 없음, 확정 켜짐 → `{ id }`).
    - 견적 없는 줄 체크 설명 문구, 관련 테스트 반전 기록.
    - `validateInteriorPlan.ts`·`types/interiorPlan.ts`·`server/**` diff 0.
  - [ ] 2-2. 검증 (담당: qa): AC-0(d 2단계)(f)(g 2단계)(h ②), AC-5. 게이트 증거(1단계 SHA·`merge-base --is-ancestor`·배포 시각·운영 스모크·사용자 확인 원문·diff 0줄)를 qa 기록에 모두 적는다. 하나라도 없으면 판정은 실패다.

의존 관계:

- 1-0은 1-1~1-3보다 먼저(골든은 변경 전 코드에서 만들어야 한다). 스파이크 결과가 1-3·1-4의 자동/수동 분담을 정한다.
- 1-1의 타입·`parseLineOrder` 시그니처가 정해지면 1-2·1-3은 병렬로 할 수 있다(같은 fe가 하면 1-2 → 1-3, 별도 커밋).
- 1-3의 서버 저장은 1-1의 PATCH 키가 있어야 한다(로컬 경로는 `applyPlanPatch` 뒤).
- 1-4는 1-1~1-3 뒤. 1-1~1-3은 한 PR(1단계)이다.
- 태스크 2는 태스크 1 배포와 AC-0(f) 게이트 뒤에 시작·머지한다.

## 다음 단계 후보

- 금액 입력 키패드(`000`·`00`, 빠른 더하기 칩 대안): 사용자 질문 "커스텀 키보드라 오래 걸리지? 오래 걸리면 보류" → 보류. 시스템 숫자 키패드(`inputmode="numeric"`)에는 `000`·`00` 키가 없어 화면 키패드를 직접 만들어야 한다. 대안은 견적 칸 아래 [+10만] [+100만] [000] 같은 칩.
- ~~묶음(구분) 순서 끌어 옮기기~~ → 사용자 요청으로 PR #47(9be6f81, 2026-10-28 운영 반영)에서 함. 묶음 제목이 손잡이, 저장 형식 그대로.
- 제품 기본값 U1~U3·U5~U7 사용자 확인(보드에서 옮김, 2026-10-28). 답이 오면 이 스펙의 "사용자 확인 필요"에 적고 바꿀 것이 있으면 새 작업으로.
- 묶음을 넘나드는 끌기(끌어 놓으면 구분이 바뀜 = 항목 PUT + 순서 PATCH 두 번 쓰기, 부분 실패 처리 필요).
- 구분을 바꾼 줄을 새 묶음 맨 끝으로 보내기(U7 대안).
- "업체 미정 n건" 요약·미정 줄만 모아 보기.
- 옛 탭 손상 판정 방지용 번들 버전 확인 장치(ADR-033 뒤집을 조건, 생기면 다음 형식 완화를 한 번 배포로).
- 손상 화면 [계획 초기화]를 "원문 내려받기 뒤에만 활성"으로.
- 떠 있는 [+]가 스크롤 중 줄의 확정 체크 위에 겹칠 수 있음(끝 여백은 있음).
- 가끔 실패하는 서버 테스트 `handleHousehold.d1` "동시 나가기"(PR #47 CI에서도 1회, 재실행 통과).
- 홈에 "이전 완료" 안내가 안 보이는 문제.
- 묶음 키보드 놓기 뒤 포커스가 body로 빠짐(줄 끌기도 같은지 미확인).
- 줄이 수백 개를 넘어 순서 충돌이 잦으면 per-row 정렬 키(fractional index)로(ADR-036 D1 뒤집을 조건).

## 가정

- A1: "업체도 비우고 입력 시 미정으로"는 금액 미정과 같은 동작(빈칸으로 저장 = 미정, 화면에 "미정")을 뜻한다. 업체 미정이 금액 미정처럼 합계에서 빠지지는 않는다(금액이 있으면 더한다).
- A2: "집 목록처럼"은 저장 목록 간단히 보기의 꾹 눌러 끌기(ADR-026)와 같은 손동작·같은 저장 방식(부모의 순서 배열 하나)을 뜻한다. 대상은 [우리 집] 목록 보기의 줄이다.
- A3: 묶음 안 이동이 요청의 핵심이다(같은 공정 안 업체 견적 줄을 원하는 순서로). 구분을 바꾸는 이동은 지금처럼 시트로 한다.
- A4: 서버와 정적 번들은 한 번의 Workers 배포로 함께 바뀐다(interior-tbd-amount A2). 위험은 열려 있는 옛 번들 탭뿐이다. 서버만 롤백하고 번들이 새 것이면 끌기 저장이 400이 되지만(순서를 저장하지 못해 되돌려질 뿐) 한 번에 배포되어 일어나지 않는다.
- A5: 사용자는 두 사람이고 기기가 적다. 게이트의 본체는 두 사람의 직접 확인이고 시간 대기는 없다(ADR-033 뒤집힘, 메모리 규칙).
- A6: 계획당 줄은 최대 500(항목 100 × 견적 5)이다. 항목 100개 상한은 서버·로컬 추가·import가 지키고, 견적 5개 상한은 검증이 지킨다.
- A7: 끌기는 우리 집에 가리기가 없으므로(ADR-035) 가리기 상태를 고려하지 않는다.
- A8: 업체 이름 "미정"을 글자 그대로 적은 줄과 업체 미정 줄은 화면에서 같아 보인다. 저장 값은 다르고(문자열 / 키 없음) 계산에 차이가 없으므로 받아들인다. 접근 가능한 이름도 같은 구분의 업체 없는 줄이 둘이면 겹친다(지금도 같은 업체·세부내용이 겹치는 수준과 같다).
- A9: 마지막 견적을 지워 견적 없는 줄이 된 항목은 `lineOrder`에 `item.id:`가 없으면 위치 없음으로 맨 끝에 간다(대체 자리를 더 넓히지 않는다). 다음 끌기 저장 때 새 key로 정리된다.

## 결정 필요

- **결정됨: ADR-036 D1 A, D2 A** (반대 없음)
  - D1 줄 순서의 저장 형태 = A 플랜 필드 `lineOrder?: string[]`(위 "데이터 모델"). B(항목·견적마다 정렬 키)는 옛 번들 탭이 항목을 한 번 쓰면 키가 지워지고, C(별도 저장소)는 새 localStorage 키·서버 저장 경로를 만든다. 뒤집을 조건: 동시 끌기로 순서가 되돌아가는 일이 잦으면 B, 줄이 500을 넘는 요구가 생기면 한도 재검토.
  - D2 PATCH 본문 한도 = A PATCH만 128KB(`PLAN_PATCH_MAX_BYTES`). 항목 쓰기·계획 POST의 16KB는 그대로(B는 근거 없이 넓어지고, C는 옛 다견적 계획에서 저장이 안 되는 줄 수가 생긴다).
  - 조건 1~9는 ADR-036을 따르며 이 스펙의 해당 절에 옮겨 적었다(1 → AC-0(f)·태스크 2, 2 → 데이터 모델·API 표, 3 → API 표·AC-0(b), 4 → 데이터 모델 쓰기 규칙·AC-3, 5 → 화면, 6 → 화면 코드 위치·AC-4, 7 → AC-4·AC-0(a)(c)(g)(h), 8 → 데이터 모델·화면 표·AC-1, 9 → 화면 2단계·AC-5).
- 그 밖에 새로 정할 되돌리기 비싼 선택은 없다.

## 사용자 확인 필요

**사용자 확인 전** 제품 기본값이다. 되돌리기 쉬우며, 답이 오기 전에는 이 기본값으로 진행한다.

- U1 업체 미정 표기: **목록은 "업체 미정"(흐린 글자, 목록에는 열 제목이 없어서), 표·인쇄·CSV는 "미정"(열 제목 "업체" 아래)**. 세부내용이 있는 줄의 둘째 줄은 원래 흐린 색이라 색으로는 일반 업체 이름과 구별되지 않고 글자로만 구별된다(흐린 글자의 시각 차이는 세부내용 없는 첫 줄에서만). 대안: 모든 곳 "미정" / 목록에서 업체 자리를 비움.
- U2 업체·견적·세부내용이 모두 빈 줄: **확정이 꺼져 있으면 지금처럼 견적 없는 줄(구분·비고만), 켜져 있으면 "업체 미정 · 미정" 견적 하나로 확정**(금액 미정 n건에 셈). 이미 견적이 있는 줄은 셋을 다 지워도 견적이 남는다(없애려면 [삭제]). 대안: 새 줄은 언제나 견적 하나로 만든다("견적 없음" 줄은 옛 계획·가져온 추가 비용에만 남음).
- U3 견적 없는 줄의 목록 체크: **지금처럼 비활성, 설명은 "줄을 열어 [확정]을 켜세요"**. 대안: 체크를 켤 수 있게 하고 누르면 빈 견적을 만들어 확정(목록 클릭 한 번이 항목 모양을 바꿈).
- U4 묶음 순서: (사용자 답: 묶음도 통째로 옮기기 → PR #47에서 함) **이번에는 묶음 안 줄만 옮긴다. 묶음 순서 바꾸기는 다음 단계**(저장 형식은 이미 지원). 대안: 이번에 묶음 제목을 끌어 묶음 순서도 바꾸기.
- U5 순서를 정한 뒤 새로 적은 줄의 자리: **그 구분 묶음의 맨 끝(새 구분이면 맨 끝 묶음)**. [+ {구분}에 줄 추가]가 묶음 끝에 있는 것과 맞춘다. 대안: 묶음 맨 위(저장 목록은 새 매물이 맨 위).
- U6 끌기 손잡이: **별도 아이콘 없이 줄 전체를 꾹 눌러 든다(저장 목록과 같음), 확정 체크는 손잡이가 아니다**. 대안: 줄 왼쪽에 ⋮⋮ 손잡이를 두고 그 자리만 끌기.
- U7 시트에서 구분을 바꾼 줄의 자리: **순서 배열의 자기 자리 그대로(새 묶음 중간에 들어가거나 새 묶음이 앞으로 올 수 있음. 예: R2의 구분을 "욕실"로 바꾸면 욕실 묶음이 도배 묶음 앞으로 온다)**. 대안: 새 묶음 맨 끝으로(저장 때 순서 PATCH를 한 번 더 씀).
- 배포 게이트 질문(2단계 머지 전, AC-0(f)): 두 분 각 기기의 열린 우리 집 탭을 닫거나 새로고침했는지, 로그인 없이 만들어 아직 계정으로 옮기지 않은 로컬 계획이 있는지.
