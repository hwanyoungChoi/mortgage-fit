# ADR-032 우리 집을 "공정별 업체 견적 줄 + 확정 합계"로 단순화하는 데이터 매핑

- 상태: 채택
- 맥락: 사용자가 [우리 집]을 공간·일정·지급 없이 "공정별로 업체 견적을 줄로 쌓고, 확정한 줄만 지출 예정액으로" 쓰고 싶다고 했다(한 줄 = 업체 견적 하나, 한 공정에 여러 줄 확정 가능, 총 예산·남은 예산만 남김 — 사용자 선택). 이미 저장된 계획(공간·여러 견적·지급·상태·날짜)을 로그인 여부와 상관없이 보존해야 한다(AC-0). ADR-029(D1 C 저장 모델)·ADR-030(표 보기)을 갱신한다. 스펙: [interior-simple](../specs/interior-simple.md)
- 선택지:
  - D1 A 저장 형식 그대로, 화면에서 "줄 = (항목, 견적) 한 쌍"으로 읽고 쓴다(새 줄 = 견적 1개 항목) / B 항목에 새 필드(`confirmedQuoteIds` 등) + 검증·서버 확장 / C 새 키·0008 테이블·새 API
  - D2 옛 여러 견적 항목의 줄을 고칠 때: a 제자리 수정(같은 항목 안 확정은 하나) / b 처음 고칠 때 새 항목으로 떼어 내기 / c 열 때 일괄 쪼개기
- 의견: pm(D1 A, D2 태스크1 a·태스크2 b) / be(D1 A 찬성, D2 a 찬성·b 조건부·c 반대) / fe(D1 A 찬성, D2 a 찬성·b는 옛 다견적 항목이 실제로 있을 때만) / qa(D1 A 찬성, D2 a 찬성·b는 이중 계산·100개 상한 미해결 시 반대)
- 검토 원문: [be](../reviews/20261027-1713-be-spec-interior-simple.md) · [fe](../reviews/20261027-1713-fe-spec-interior-simple.md) · [qa](../reviews/20261027-1713-qa-spec-interior-simple.md)
- 결정: D1 A, D2 a. **태스크 2(D2 b 떼어 내기)는 이번 범위에서 뺀다** — 셋 모두 "옛 다견적 항목이 실제로 있을 때만"을 조건으로 걸었고, 기능이 2026-10-27에 막 배포돼 옛 다견적 계획은 드물며, b는 부분 실패 시 이중 계산·100개 상한·줄 점프라는 새 복잡도를 만든다(CLAUDE.md: 가장 단순한 구현). 반대가 없어 반론 라운드 생략. 아래 조건을 구현 필수로:
  1. **서버·검증 무변경(be 1·3, fe C2, qa C4)**: `server/`·`migrations/`·`worker/`·`wrangler.jsonc`·`validateInteriorPlan.ts` diff 0. `src/lib/constants/interiorPlan.ts`는 삭제만(`+` 줄 0, `INTERIOR_ITEM_STATUSES`·모든 `*_MAX_*` 값 불변). `git diff --exit-code <merge-base> HEAD`와 `git status --porcelain`을 함께 보고, `pnpm build`(worker 타입 검사 포함)와 `server/**` 테스트 통과.
  2. **숨은 값 보존 쓰기(be 2, fe 근거 1, qa C2)**: 쓰기 입력은 `const { id, createdAt, updatedAt, ...input } = item`에 바꾼 칸만 덮는 순수 함수. 테스트는 c1 `toStrictEqual(validateInteriorItemFields(input))`, c2 바꾼 키를 뺀 나머지가 원래 항목과 같음, c3 모든 선택 키가 채워진 fixture + `satisfies Record<keyof InteriorItemInput, true>`. 비운 선택 칸은 키 삭제. 확정을 켜고 꺼도 `status` 불변(옛 "확정하면 상태가 확정" 테스트는 반전으로 기록). 확정 견적을 지우면 `confirmedQuoteId` 키도 빠진다. 견적 0개 줄의 합성 비고("예산 n만원")는 `item.memo`로 저장하지 않는다. 로컬과 D1 하네스에서 PUT 후 GET 왕복 1회씩.
  3. **열기만 하면 쓰기 0회(qa C3)**: 새 `src/AppRoutes.storageKeys.interiorSimple.test.tsx` — 14키 시드(옛 P·L 들여쓴 JSON), 목록·시트 열고 닫기·표·CSV·인쇄·가리기·홈·뒤로 가기, 로그아웃(`Storage.prototype` 스파이 포함)·로그인 혼자·가구에서 로컬 쓰기 0·서버 쓰기 0, 체크 1번이면 정확히 1회 쓰는 대조군.
  4. **기존 테스트 수정 규칙(fe C1, qa C1·감사 규칙)**: storage 단언(쓰기 0회·원문 `===`·새 키 없음·이전·함께 쓰기)은 한 줄도 약화하지 않고 화면 조작 줄·허브 기대 문자열만 바꾼다. `useInteriorPlanSource.test.tsx`·`useInteriorPlanImport.test.tsx`·`interiorPlanStorage.test`·`validateInteriorPlan.test`·`interiorItemConflict.test`·`householdPlans.test`·서버 테스트는 diff 0. 지우는 테스트는 R(주제 삭제)/T(이동)/X(설명 없음)로 분류해 X 0, 상한·경계·가리기·충돌·401·404·표 병합·계 테스트는 T. `interiorPlanFixture.ts`는 추가만, 새 fixture는 `src/test/interiorSimpleFixture.ts`.
  5. **확정 체크(fe C4, qa C7·C8)**: 체크와 요약은 같은 캐시에서 파생(낙관적 갱신 없음), 저장 중에는 같은 항목의 모든 체크 비활성, 충돌은 시트용이 아닌 한 줄 문구. 행은 "여는 버튼 + 체크 라벨" 형제 구조, 체크 영역 44px 이상. 견적 없는 줄의 체크는 disabled로 보이고 강제 클릭해도 쓰기 0. 가리기 중 체크 이름은 `{구분} {업체} 확정`, `innerHTML`에 세부내용·비고·금액 없음.
  6. **옛 다견적 항목(D2 a, fe C5)**: 견적마다 한 줄로 펼치고 같은 항목 안 확정은 하나, 다른 견적 확정이 풀릴 때 목록 위 한 줄 안내. 구분·비고 수정은 형제 줄에도 같이 보인다는 안내를 시트에.
  7. **줄 삭제(be 9, fe C3, qa)**: 견적 0~1개 항목이면 항목째 삭제, 2개 이상이면 그 견적만. 숨은 지급이 있으면 확인 문구에 "지급 n건도 함께 지워집니다".
  8. **입력·묶음(fe C6, qa 경계)**: 줄 시트는 기존 `ItemSheet`를 고쳐 쓴다(초기값 한 번 읽기·고친 것 없으면 저장 막기·닫을 때 확인·충돌·첫 오류 포커스 유지). 구분 입력에 `<datalist>`로 기존 구분 제안, 앞뒤 공백 trim, 대소문자는 구분. 묶음 순서는 "그 구분의 가장 이른 줄 순"으로 정의하고 삭제 뒤 순서가 바뀌는 경우를 AC에 쓴다. 상한은 항목 수 100(줄 수 아님).
  9. **보기·허브**: `HomeView`는 `"list" | "table"`, 옛 `?view=trade|space`·알 수 없는 값은 목록으로 replace. 허브는 "{이름} · 지출 예정 n만원", `summarizeInteriorPlan`·`summarizeHub`의 `now` 입력 삭제.
- 이유: A만 새 키가 없어 옛 번들·서버의 "알려진 키만 복사"에 지워질 값이 없고, 서버·마이그레이션·가구 batch를 건드리지 않는다(AC-0, 가장 단순). a는 쓰기 1번이라 부분 실패 상태가 없다.
- 뒤집을 조건: 옛 다견적 항목에서 "다른 견적 확정이 풀린다"는 불편이 실제로 나오면 태스크 2(D2 b, be·qa 조건 4~8 포함) 재검토. 100개 상한이 엑셀 한 장 기대보다 낮다는 피드백이 오면 상한·본문 크기 재계산.
- 롤백: 클라이언트만 바뀐다. 옛 번들로 되돌려도 새 줄은 "전체" 공간의 견적 1개 항목으로 보인다.
- 검토 권장: 없음(저장 형식 무변경).
- 제품 기본값(사용자 확인 전): 스펙 U1~U12.
