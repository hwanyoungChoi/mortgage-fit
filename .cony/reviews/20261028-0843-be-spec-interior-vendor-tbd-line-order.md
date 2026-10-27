# interior-vendor-tbd-line-order 스펙 — be 검토

날짜: 2026-10-28 · 관점: 데이터 무결성, 보안, 성능, API 계약 · 코드 수정 없음

## 판정: 조건부 찬성

D1 = A(플랜 필드 `lineOrder`), D2 = A(PATCH만 128KB), 업체 선택화와 2단계 배포 구성에 찬성한다. 아래 조건 1~4는 스펙에 반영해 주기를 바란다.

## 근거 (코드로 확인한 사실)

1. **옛 번들 안전성이 스펙 주장대로다.**
   - `validateInteriorPlanFields`(`validateInteriorPlan.ts:232-258`)는 알려진 키만 담은 새 객체를 돌려준다. 옛 번들은 `lineOrder`를 손상 없이 버린다.
   - `parseQuote`(169행)는 `vendor`를 `parseRequiredText`로 필수 검사한다. 업체 없는 견적은 옛 번들에서 손상이다.
   - 1단계에는 업체를 비우는 화면이 없다. 그래서 1단계 배포 직후 옛 탭이 읽을 업체 없는 견적은 생기지 않는다. 노출은 로컬 `lineOrder` 소실뿐이고, 이는 순서만 기본으로 돌아가는 비파괴 손실이다.
   - 서버는 `json_patch`(`handleInteriorPlans.ts:299`)라 옛 번들이 항목 PUT, 이름·예산 PATCH를 해도 `lineOrder`를 지우지 않는다.
   - 서버와 번들은 한 번에 배포된다(A4).
2. **D2 = A가 맞다.** C(상한을 230개로 줄이기)는 옛 다견적 계획을 막으므로 반대한다.
   - 실제 id는 `createRandomId` 32자 hex다. 줄 key는 65자이고 JSON 원소는 약 68바이트다.
   - 500줄이면 약 34KB로 16KB를 넘고, 16KB는 약 235줄에서 끝난다.
   - 검증이 허용하는 최악(64자 id 두 개, 129자 key)은 500 × 132 = 약 66KB다. 128KB는 다른 PATCH 키(`spaces` 30개 등 수 KB)를 더해도 여유가 있다.
   - key 정규식이 ASCII뿐이라 JSON 이스케이프로 부풀지 않는다.
   - D1 바인딩 한도 우려는 낮다. import가 이미 최대 1MB를 바인딩한다(`IMPORT_MAX_BYTES`). SQL 문장 길이 한도는 SQL 텍스트에 걸리고 바인딩 값에는 걸리지 않는다(이 부분은 D1 문서 기억이며 이번에 문서를 열어 확인하지는 않았다. 위의 1MB import가 저장소 안의 근거다).
   - 기존 413 테스트(`handleInteriorPlans.d1.test.ts` 359·690행, smoke 146행)는 계획 POST와 항목 POST만 본다. PATCH 16KB 테스트는 없어서 D2-A가 기존 테스트를 깨지 않는다.
   - "하나 이상" 오류 문구를 단언하는 기존 테스트도 없다(grep 0건). 그래서 "기존 server 테스트 수정 0"이 성립한다.
3. **PATCH 저장 의미가 맞다.**
   - `budgetMergePatch(patch)`의 결과를 `{...patch, ...budgets}`로 펼쳐서 `lineOrder`가 그대로 지나간다.
   - RFC 7396에서 배열은 통째로 교체되고 `null`은 키 삭제다. 문자열 원소뿐이라 배열 안 null 처리 문제는 없다.
   - 가구 범위는 `PLAN_SCOPE_SQL`이 행 범위만 정하고 `data`는 건드리지 않는다. 구성원 모두가 같은 `lineOrder`를 읽고 쓴다(스펙 "세 출처" 주장 확인).
   - import는 `parseInteriorPlan`(공용)을 거쳐 `planFields`로 저장하므로 `lineOrder`가 들어간다.

## 조건

1. **`POST /api/interior-plans`(계획 생성)는 `lineOrder`를 저장하지 않는다.** 스펙 표는 "받음"이라고 쓰지만 이 경로는 항목 id를 서버가 만든다(`createRandomId`, `handleInteriorPlans.ts` 계획 POST). 클라이언트가 보낸 `lineOrder`의 key(`item.id:quote.id`)는 서버가 만든 item id와 절대 맞지 않아, 저장하면 영구히 죽은 값이다.
   - `parsePlanCreateRequest`에서 `lineOrder`를 버린다. ADR-029 조건 2(모르는 키는 버림)와 같은 처리이고, 400이 아니라 조용히 버리는 쪽이 일관된다.
   - 스펙 API 표의 해당 줄을 "무시(저장하지 않음)"로 고치고, 서버 하네스에 "POST에 `lineOrder`를 보내도 201이고 `SELECT data`에 키 없음"을 한 줄 더한다.
   - 구현이 단순해지는 쪽은 `InteriorPlanInput`을 그대로 두고 파서에서 구조 분해로 빼는 방식이다.
2. **PATCH D2 상수는 PATCH 경로에만 둔다.**
   - `PLAN_PATCH_MAX_BYTES = 128 * 1024`를 `WRITE_MAX_BYTES` 옆에 두고, 근거를 주석에 적는다: 500 × 132바이트 = 약 66KB와 다른 키 여유.
   - 줄 291행의 `readJsonBody` 한 곳만 바꾸고 345·399행(항목)과 135행(계획 POST)은 16KB 그대로다.
   - 하네스 테스트: (a) 최악 key(64자 id 두 개)로 서로 다른 500개 → 200, 이후 `SELECT data`가 입력과 같음. (b) PATCH 본문 정확히 128KB → 200, +1바이트 → 413(`payloadTooLarge`), 413이면 행이 안 바뀜. (c) 항목 PUT·계획 POST는 여전히 16KB+1에서 413.
   - 413 문구가 `maxBytes / 1024`로 만들어져 "128KB 이하"로 자동 갱신된다. 스펙 API 표에 이 문구를 적을 필요는 없다.
3. **`parseLineOrder`의 시그니처를 고정한다.** 호출자가 둘(공용 플랜 필드, 서버 PATCH)이고 `[]`의 의미가 다르다.
   - 공용 필드: `[]` = 키 없음(통과, 키를 쓰지 않음).
   - PATCH: `[]` = 400. `null` = 키 삭제.
   - `parseLineOrder(value): string[] | null`은 유효한 비어 있지 않은 배열만 돌려주고, 빈 배열 처리는 호출자가 한다.
   - 한 함수에 "빈 배열" 판단을 두 곳으로 흩뜨리지 않으려면 판단은 PATCH 쪽 한 줄(`raw.lineOrder !== null && (Array.isArray(raw.lineOrder) && raw.lineOrder.length === 0)`)과 공용 필드 쪽 한 줄이면 충분하다. 대안으로 PATCH `[]`를 `null`과 같이 키 삭제로 받으면 400 경로가 사라진다. 이쪽이 더 단순하지만 스펙의 선택(400)도 허용한다. 어느 쪽이든 하네스에서 결과를 못 박는다.
4. **`lineOrderAfterMove` 출력이 항상 `parseLineOrder`를 통과함을 테스트로 고정한다.**
   - `lineOrder`가 틀리면 로컬은 저장소 전체가 `corrupt`(ADR-001)이고 로그인은 목록 파서 한 건 실패로 전체 `loadFailed`가 된다(`useInteriorPlanList.ts`). 화면 순서 하나가 전체 계획을 못 읽게 만들 수 있으므로 쓰는 쪽이 정확해야 한다.
   - 테스트: 입력에 지워진 key·옛 `item.id:` key가 섞여 있어도 출력은 중복 없음, 길이 ≤ 현재 줄 수 ≤ 500, key 정규식 통과. 줄 500개(100 × 5) 계획에서도 마찬가지.

## 리스크 (조건은 아님)

- **동시 끌기는 배열 통째 덮어쓰기라 스펙이 쓴 것보다 영향이 넓다.** 스펙은 "다른 묶음을 동시에 끌면 나중 저장이 이긴다"고 쓴다. 정확히는 A가 든 시점의 전체 배열로 덮으므로, 그 사이 B가 옮긴 다른 묶음의 순서까지 되돌려진다. 줄이 사라지는 데이터 손실은 아니고 순서만 되돌아간다. 사용자가 둘이고 재조회가 30초라 수용 가능하며 ADR-026과 같은 모양이다. ADR-036에 "묶음 하나만 옮겨도 다른 묶음 순서가 되돌려질 수 있음"으로 적어 두기를 권한다.
- **PATCH `lineOrder` 하나의 저장이 `updated_at`을 갱신한다.** 계획 정렬은 `created_at, id`라 영향 없음. 확인했다.
- **id 규칙이 바뀌면 저장된 `lineOrder`가 손상이 된다.** key 정규식이 `isInteriorId`의 패턴(`^[A-Za-z0-9_-]{1,64}$`)을 복제한다. 정규식은 `ID_PATTERN` 하나에서 만들고 새 리터럴로 복제하지 않는다(`validateInteriorPlan.ts:40`, 같은 판단은 한 함수에).
- **옛 다견적 데이터가 아닌 새 화면만 보면 한도가 16KB로도 충분했다.** 100줄 × 68바이트 = 약 7KB다. 128KB는 검증이 허용하는 옛 데이터 상한에 맞춘 값이므로 "근거 없이 크다"는 반론이 나오면 이 숫자를 답으로 쓴다.
- **롤백 하한 서술이 보수적이다.** 1단계와 2단계 사이에는 업체 없는 견적이 UI에서 생기지 않으므로 그 사이 롤백은 로컬 `lineOrder` 소실 말고 손상을 일으키지 않는다. 2단계 이후에는 스펙 서술이 정확하다. 하한 규칙을 단순하게 유지하려는 선택이므로 이대로 좋다.
- **서버를 롤백하고 번들만 새 것이면 끌기 저장이 400이다.** 한 번에 배포되는 구조(A4)라 발생하지 않는다. 발생해도 "순서를 저장하지 못했다"로 되돌려질 뿐이다.

## 스펙 계약 확인 결과

- 인용한 위치가 맞다: `handleInteriorPlans.ts:35`(`WRITE_MAX_BYTES`), `:299`(`json_patch`), `interiorPlanStorage.ts:91`(`applyPlanPatch`).
- 마이그레이션 없음이 맞다(JSON `data` 컬럼, 새 열 없음). 새 환경변수 없음.
- 항목 POST·PUT의 `vendor` 생략 허용은 `validateInteriorItemFields`가 `parseQuote`를 거치므로 공용 검증 한 줄로 따라온다.
- `vendor: null`·`""`·31자 거부, `" 가나 "` trim은 `parseRequiredText`를 키가 있을 때만 부르는 방식으로 그대로 유지된다.
- 400 본문 문구, 413, 404, PATCH `null` 삭제는 스펙 표대로 구현 가능하다.
- AC-0(e) `PATCH lineOrder: null` 뒤 `SELECT data`에 키가 없음은 `json_patch`의 의미상 성립한다.

## 확인하지 못한 것

- D1 문서의 한도 수치는 문서를 열어 확인하지 않았다(위 근거 2의 괄호). 저장소 안의 근거는 import의 1MB 바인딩뿐이다.
- 실제 PATCH 호출과 `pnpm test`는 코드가 없어 돌리지 않았다(검토 모드).
