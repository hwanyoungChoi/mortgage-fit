# interior-group-collapse 스펙 — fe 검토

2026-11-07

## 판정: 조건부 찬성

## 근거 (코드 확인한 사실)

1. 센서 충돌 없음. `useLongPressSensors`는 Mouse/Touch에 250ms·5px, Keyboard는 start=Space만(`KEYBOARD_CODES`). 짧게 누르기는 activation constraint 미충족이라 드래그가 시작되지 않고 click이 그대로 온다. 꾹 누른 뒤에는 dnd-kit가 click을 막는다(core 1504행 근방). 엔터는 start 코드가 아니라 센서가 건드리지 않으므로 기본 click이 난다(드래그 중 엔터는 end). 같은 조합이 `CompactListingRow`(짧게/엔터 = 펼치기, 꾹/스페이스 = 끌기)에 이미 있다.
2. 끌기 중 접힌 묶음: `PlanLines`가 든 순간 스냅샷(`draggedGroups`)을 그리고, 묶음 id는 `group/{trade}`라 접힘과 무관하다. 접힌 묶음은 안쪽 `SortableContext`·줄을 안 그리므로 키보드 이동이 줄 자리로 건너뛸 일이 오히려 줄어든다. 바꿀 곳은 `DragOverlay`(280~291행)가 접힘이면 줄 목록을 빼는 것 하나. 접힘 값은 저장소에서 라이브로 읽어도 든 동안 click이 없어 바뀌지 않는다.
3. D1 A 찬성. 기능당 키 하나 관례와 맞고, 식별자가 구분 글자인 것은 묶음 실체가 없는 현 구조와 일치(`interiorPlanRows.ts` 180행 trim 그룹핑, 끌기 id도 trade).

## 조건 (구현 때 놓치기 쉬운 것)

- `canMoveGroup`이 false인 2개 이상 묶음 상태(순서 저장 중, `canReorder=false`)에서도 제목은 접기 버튼이어야 한다. dnd-kit `attributes`는 disabled일 때 `aria-disabled`를 붙이므로 `CompactListingRow`처럼 `dragProps`를 조건부로 펼치고, `useSortable`의 disabled는 `draggable`만 끈다.
- 스페이스 키보드 들기/놓기 후 click이 안 나는 것은 `CompactListingRow`와 같은 구조라 안전해 보이나(추론), jsdom은 click 억제를 못 본다. 스펙대로 qa 실기기 확인 유지.
- `aria-roledescription`이 버튼 역할 낭독을 덮을 수 있다. `aria-expanded`가 읽히는지 VoiceOver로 한 번 확인.
- `GroupHeader`는 `h3` 안에 title을 넣는 구조라 `<h3><button>` APG 마크업과 맞다. 다만 `aria-controls`용 id와 접힘 표시(꺾쇠, "· n줄")를 title 쪽(버튼 안)에 넣고, 뜬 묶음(`as="p"`)은 버튼 없는 별도 title을 쓰게 prop을 하나 추가해야 한다.

## 함께 쓰기에서 상대가 구분 이름을 바꿨을 때

접힘은 기기 로컬이라 옛 이름은 무시되고 새 이름 묶음은 펼침으로 보인다. 오류는 없고 자연스럽다(정보 손실 = 접힘 한 번 다시 하기). 정리 규칙의 위험은 한 가지: 폴링·일시 편집으로 묶음이 잠깐 사라진 시점에 다른 묶음을 접으면 그 이름이 지워진다. 영향이 작아 허용하되, 단순함을 원하면 정리를 빼고 계획당 목록을 그대로 둬도 된다(AC-5 변경 필요). 현 스펙대로 가도 무방.

## 누락·범위

- 구분이 빈 글자("")인 묶음이 가능한지 확인 필요(`trim()` 결과가 "")이면 제목 버튼 이름이 비고 `[+ 에 줄 추가]`가 된다. 기존 문제지만 버튼 이름이 비어 접근성 오류가 되므로 빈 구분 처리(라벨 폴백 여부)를 스펙에 한 줄 명시 권장.
- 접힌 묶음 포커스: 접으면 포커스는 제목 버튼에 그대로라 문제 없음. 펼칠 때 자동 스크롤 불필요.
- 범위는 적절(서버 무변경, 표·CSV 무영향, 태스크 1·2 한 PR). 애니메이션·모두 접기 제외도 동의. U1~U7 기본값 동의.

## 실행한 검증

코드 읽기만(수정·테스트 실행 없음).
