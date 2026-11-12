# ADR-041 로딩 스켈레톤 부품과 "한 번에 드러내기" 방식

- 상태: 채택
- 맥락: 홈·매물·예산 탭이 /api/me·/api/listings·/api/interior-plans 도착 순서대로 하나씩 커지며 아래를 밀어냄. 사용자가 스켈레톤을 지정. 스펙 [loading-skeleton](../specs/loading-skeleton.md).
- 선택지: D1 A 직접 만든 공통 `Skeleton`(src/components) / B react-loading-skeleton. D2 A 기존 상태 유니온에서 "모두 준비됨"을 파생 / B Suspense로 이전.
- 의견: pm(D1 A, D2 A — B는 gradient라 ui-refresh 금지 규칙과 충돌, Suspense 이전은 데이터 훅 전반을 바꿈). 사용자가 속도를 요청해 검토 라운드는 생략.
- 결정: D1 A, D2 A. ADR-031 조건 2(홈 섹션 독립 표시)는 로딩 중에 한해 "함께 드러내기"로 개정.
- 이유: 맥박 하나에 CSS 몇 줄이라 라이브러리가 복잡도를 줄이지 않음. 유니온 파생이 가장 단순하고 기존 테스트 구조를 유지.
- 뒤집을 조건: 스켈레톤 변형이 많아져 직접 관리가 부담되거나 데이터 훅이 Suspense로 옮겨갈 때.
- 제품 기본값 · 사용자 확인 전: U1 한 번에 / U2 밝기 맥박 / U3 300ms 지연.
