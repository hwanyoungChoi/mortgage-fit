# ADR-040 라벨·값 구분 패턴을 어떻게 공유하나

- 상태: 채택
- 맥락: 디자인 다듬기(specs/design-polish.md)에서 화면 다섯 곳 이상의 "라벨(작고 흐림) / 값(크고 굵고 tabular)" 구분을 맞춰야 한다. 공유 방식을 정해야 했다.
- 선택지: A 토큰(`--fs-*`, `--fs-value` 등) + index.css 규칙 주석만 / B 공통 CSS Module(composes) / C 공통 컴포넌트(`<Stat label value>`)
- 의견: pm(A 추천, 공유할 것이 크기·굵기·색 세 줄뿐) / fe(A 찬성, 배치가 5곳마다 다르고 C는 마크업·테스트 위험, B는 cross-file composes 사례 0건이라 빌드 확인 필요 — 승격은 사후에) / qa(A로도 검증 가능, 단 muted 사용 여부는 grep으로 못 잡아 화면 확인 필요. B가 검증은 가장 쉬움)
- 검토 원문: [fe](../reviews/20261111-1501-fe-spec-design-polish.md) · [qa](../reviews/20261111-1501-qa-spec-design-polish.md)
- 결정: A
- 이유: CLAUDE.md "가장 단순한 구현, 추측성 추상화 금지"와 CONVENTIONS "승격은 사후에". 공유 대상이 값 세 개뿐이라 토큰이 곧 공유 단위다. qa가 짚은 검증 공백은 AC-2~5 화면 확인(computed 값)으로 메운다.
- 뒤집을 조건: 같은 라벨/값 CSS 묶음이 세 곳 이상에서 그대로 복붙되거나, 다음 디자인 작업에서 토큰만으로 일관성이 또 무너지면 B로 승격한다.
