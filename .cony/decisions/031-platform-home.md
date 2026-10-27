# ADR-031 홈 허브 첫 화면·하단 아이콘 탭의 경로·이름·[가가] 자리·아이콘·읽기 훅

- 상태: 채택
- 맥락: 앱을 종합 임장·계약 서비스로 키우며 홈 화면과 네비를 개선한다(사용자 요청). 사용자는 "단계를 강제하지 말고, 인테리어만 필요한 상황일 수도 있다"고 했고, 네비는 화면 아래 아이콘 탭을 골랐다. ADR-004(라우트 두 개)·ADR-029(계산기가 첫 탭)를 갱신한다. 스펙: [platform-home](../specs/platform-home.md)
- 선택지:
  - D1 A 홈 `#/` + 계산 `#/calculator` / B 계산 `#/` 유지, 홈은 해시 없이 열 때만 / C 계산이 첫 화면, 홈은 탭으로만
  - D2 A 허브는 코드에서 `hub`, 우리 집은 `home`·`#/home` 그대로 / B 우리 집을 `interior`로 바꾸고 허브를 `home`으로 / C 우리 집 경로 이동 + `#/home` 별칭
  - D3 A 전역 머리 줄(스크롤과 함께 올라감) 오른쪽 / B 홈 화면에만 / C 화면마다 제목 줄 오른쪽
  - D4 A `lucide-react` 추가 / B Lucide SVG 4개 복사 / C 직접 그림
  - D5 A 계획 출처 훅 통째로 전역 / B 읽기 부분만 `src/hooks/`로 분리 / C `AppRoutes`가 목록을 props로
- 의견: pm(전부 A·A·A·A·B 추천) / fe(D1·D2·D3 찬성, D4·D5 조건부) / qa(조건부 찬성: AC-0 예외 형태·banner 질의·상태표 보강)
- 검토 원문: [fe](../reviews/20261027-1541-fe-spec-platform-home.md) · [qa](../reviews/20261027-1541-qa-spec-platform-home.md)
- 결정: D1 A, D2 A, D3 A, D4 A, D5 B. 반대가 없어 반론 라운드는 생략. 아래 조건을 구현 필수로:
  1. **AC-0 형태(qa C1·C2·C3, fe 7)**: 기존 `AppRoutes.storageKeys*` 방식 그대로 — 확인 전 쓰기 0회, 로그아웃 확인 후 `removeItem session-hint`만, 로그인 후 `setItem session-hint "1"`만, 나머지 키 원문 `===`·쓰기 0회. 로그인 경로는 imports 4키 시드(혼자)·가구 시드 두 갈래. 스파이는 주입 스토리지 + `Storage.prototype` 1개, 홈 첫 안정 직후와 이동마다 체크포인트.
  2. **홈 요약(qa C4·C5, fe 5·6)**: 순수 함수는 `containers/Mortgage/Hub/` 옆, 출력은 판별 유니온(`intro|loading|error|corrupt|summary`). 금액은 `validateAmount(...).status === "valid"` 경계표. 카드별 독립 상태표, 로딩 중 로컬 값 플래시 금지(deferred 판정), 30초 폴링 한 줄, 요약 줄 최소 높이. 계정 확인 실패는 기존 `selectAccountSourceStatus`를 그대로 쓴다. 홈은 규제값 수치를 보이지 않는다.
  3. **레이아웃(fe 2·3·4·10)**: `--bottom-tab-height`가 위 테두리 포함인지 한 곳에서 정의, safe-area `env()`는 탭 줄만, `scroll-padding-bottom`은 `:root` 한 번, 머리 줄·탭 줄은 인쇄에서 숨김.
  4. **접근성(qa C7)**: 전역 머리 줄은 `<main>` 바깥, 이름을 주고 `getByRole("banner", { name })`로 질의. 화면 안 `<header>`를 `<div>`로 바꾸지 않는다.
  5. **경로(fe 8, qa 링크 표)**: 공유·초대 "취소"는 `PATHS.hub`로 직접 바꾼다. AC-1에 `AppRoutes` 기존 링크 통합 `it.each` 표(화면·최종 해시·이력 불변·aria-current).
  6. **기존 테스트 수정 감사(qa C8)**: 1-1의 테스트 변경은 기계적 이름 변경만, 삭제된 `expect` 0. `#/` 시작 부정형 테스트 감사. 2-1은 `useInteriorPlanSource.test.tsx`·`MortgageHome*.test.tsx` diff 0으로 통과.
  7. **D4 조건(fe·qa)**: 아이콘 4개만, `aria-hidden` 명시 prop, 1-1 전후 `pnpm test` 시간과 메인 청크 크기를 기록하고 늘면 `lucide-react/icons/*` 깊은 경로로.
  8. **D5 문구(fe)**: 홈이 쓰기를 갖지 않는 구조 보장은 계획에만 해당. 매물은 `useListingSource`를 그대로 쓰고 "홈이 쓰기를 부르지 않는다 + 스파이 테스트"로 지킨다.
  9. **판정 방법(qa C6)**: AC-3(겹침·인쇄·safe-area)과 "가장 큰 카드"는 리드 화면 확인 수치로(`getBoundingClientRect`, `scrollWidth <= 360`), AC-0(c)는 `git diff $(git merge-base main HEAD) -- server migrations worker wrangler.jsonc` 빈 출력.
- 이유: A는 모든 입구에서 첫 화면이 같고 `parseRoute` 표 하나로 검증된다(D1). 기존 `home`=우리 집 의미를 코드 전체에서 유지해 테스트 84개를 건드리지 않는다(D2). [가가]가 모든 화면 같은 자리 하나라 통합 테스트 하나로 덮이고 탭은 내비게이션만 갖는 HIG 관례(D3). 검증·유지되는 라이브러리를 쓴다는 CLAUDE.md 원칙, 아이콘 단위 번들(D4). 실제 재사용되는 읽기만 승격하는 지역성 원칙, 기존 훅 반환 타입 불변으로 회귀 확인(D5).
- 뒤집을 조건: 옛 `#/` 북마크로 들어온 사용자가 계산까지 한 탭이 늘어 불편하다는 피드백이 반복되면 D1 B 재검토. 로그인 사용자의 앱 시작 `GET /api/interior-plans`가 부담이 되면 계획 요약 전용 API(후속). `pnpm test` 시간이 눈에 띄게 늘면 D4 깊은 경로 import.
- 롤백: 클라이언트만 바뀐다. 옛 번들로 되돌리면 `#/`가 다시 계산기다. 저장 키·DB 무변경.
- 검토 권장: D1(첫 화면이 계산기에서 홈으로 바뀜), D4(새 의존성 `lucide-react`).
- 제품 기본값(사용자 확인 전): 스펙 U1~U11(카드 순서·탭 라벨·아이콘·문구·요약 내용·[가가] 자리·제목·공유/초대 탭 표시·상태 문구·함께 쓰는 중 문구·홈에 가리기 토글 없음).
