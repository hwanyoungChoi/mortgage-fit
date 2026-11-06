# interior-budget-exclude 스펙 — be 검토

2026-11-06

## 판정: 조건부 찬성 (D1 = A 찬성, 1단계 배포 찬성)

## 근거 (코드에서 확인한 사실)

1. **서버 검증에 키 추가는 필요하다. 이것 하나가 서버 쪽 전부다.** `validateInteriorItemFields`(`src/lib/utils/validateInteriorPlan.ts`)는 알려진 키만 새 객체로 돌려준다. 서버 `parseInteriorPlanRequests.ts`가 이 함수를 그대로 쓰고(`validateInteriorItemFields`·`parseInteriorItem`·`parseInteriorPlan`), `replaceInteriorItem`은 `JSON.stringify(parsed.value)`를 저장한다. 키를 추가하지 않으면 POST/PUT/import에서 조용히 버려진다. 추가하면 서버 파일 diff 0이라는 스펙 말이 맞다. GET은 저장된 `data`를 `JSON.parse`로 되돌려 주기만 한다(`toItem`). 마이그레이션 없음, D1 JSON 컬럼 맞다.
2. **옛 번들은 모르는 키를 버리고 손상으로 읽지 않는다 (ADR-029 조건 2 해당).** 옛 번들의 읽기 경로 세 곳(`interiorPlanStorage.ts` 로컬 `parseInteriorPlan`/`parseInteriorItem`, 서버 응답 `useCreateInteriorItem`·`useUpdateInteriorItem`·`useUpdateInteriorPlan`의 `parseInteriorItem/Plan`)이 모두 알려진 키만 복사하고 모르는 키는 검사하지 않는다. null 판정은 알려진 필드 위반 때만 난다. 그러므로 필수 → 선택 완화(ADR-033·036)와 달리 2단계 배포가 필요 없다는 판단은 코드상 맞다.
3. **D1 A(`isOffBudget?: true`, false는 키 없음) 찬성.** 항목 단위가 맞다: 확정 견적은 항목당 하나이고 쓰기는 `inputOf(item)`(`interiorLineWrites.ts`)이 id·시각만 빼고 통째로 옮겨 PUT 전체 교체하므로, 검증이 키를 돌려주는 한 확정·완료 토글과 견적 삭제가 코드 변경 없이 키를 보존한다. B(견적 단위)는 확정 이동 시 값이 따라오지 않는다. C는 추측성이다. `false`를 받아 키로 쓰지 않는 규칙은 `parseOptionalText`의 빈 문자열 규칙과 같은 모양이고, 저장 표현이 하나여서 `json_extract` 같은 조회가 필요해져도 단순하다.

## 조건 (구현 시 지킬 것)

- 검증 규칙은 `hasValue` 기준으로 쓴다: 키 없음·`undefined` → 없음, `true` → `true`, `false` → 없음, 그 밖(`null`·문자열·숫자)은 항목 null. `parseOptional`은 `false`를 거부하므로 재사용 못 하고 작은 전용 판정이 필요하다(한 함수, 순수).
- 반환 객체에서 키 위치는 `...(isOffBudget && { isOffBudget: true })`로 하고, `false`가 새어 나가지 않게 한다. AC-2의 `SELECT data`에 키가 없음 확인이 이를 지킨다.
- 위 변경 후 `InteriorItemInput`이 `Omit`이라 `parseInteriorPlanRequests.ts`의 서버 타입이 따라오는지 `pnpm build`(worker 타입 검사)로 확인한다.

## 리스크

- **함께 쓰기 충돌은 항목 단위 마지막 저장 우선이다.** PUT은 항목 전체 교체이고(`replaceInteriorItem`), 409는 ADR-029 조건 8에서 의도적으로 넣지 않았다(클라이언트 `updatedAt` 비교만). 그래서 A 기기가 예산 외로 바꾸는 사이 B 기기가 오래된 캐시로 [완료]를 누르면 B의 PUT이 키를 지울 수 있다. 데이터 손실은 아니고 표시가 반영으로 돌아가는 것이다. 새 위험은 아니고 기존 모든 필드와 같은 성질이다. 허용 가능, 스펙 "남는 위험"에 함께 쓰기 경우를 한 줄 더하면 좋다.
- **배포 순서**: 스펙은 서버와 번들이 한 배포에 함께 바뀐다고 가정한다(ADR-011 Pages Functions). 새 번들이 아직 옛 워커에 붙는 짧은 창이 있으면 서버가 키를 400이 아니라 조용히 버려 표시가 사라진다. 사용자 두 명이라 새로고침 한 줄로 충분하다는 스펙 판단에 동의한다.
- 옛 로그아웃 탭이 `interior-plans` 원문을 다시 쓰면 모든 항목의 키가 지워진다는 스펙 서술은 코드와 맞다(읽을 때 버리고 다시 쓰므로). 금액·견적 손실은 없다.
- 롤백 revert는 안전하다(되돌린 번들이 키를 버림, D1 행의 키는 해당 항목을 다시 쓰기 전까지 남음).
- `/import`는 로컬 항목을 `validateInteriorItemFields`로 거쳐 전달하므로 키 추가만 되면 AC-7 import 왕복이 성립한다고 추론한다(import 경로의 검증 호출 라인 61을 확인했고 실행은 안 함).

## 확인하지 않은 것

- 코드를 고치거나 테스트를 실행하지 않았다. 계산·화면(fe) 쪽 검토는 하지 않았다.
