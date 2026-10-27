# 홈 카카오 로그인·우리 집 줄 글자 순서 qa 검증

- 날짜: 2026-10-27
- 브랜치: cony/home-login-swap (main 746c551 기준), 대상 커밋 c897519 · c6ee193, qa 커밋 2769ab2
- 판정: 통과

## 결과

| AC                                                                          | 결과 | 근거                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 줄: 첫 줄 세부내용, 그 아래 업체                                            | 통과 | `MortgageHome.lines.test.tsx` "세부내용이 있으면 세부내용이 첫 줄…", `listShape` 7개 · qa `lineOrderQa` "로그인(서버 출처) L도…"                                                                                |
| 줄: 세부내용 없으면 업체가 첫 줄(빈 줄 없음)                                | 통과 | 같은 테스트 + qa "가리기 중 L: … ••• 세부내용 줄이 없다"                                                                                                                                                        |
| 줄: 가리기 중 업체 먼저, 세부내용 •••                                       | 통과 | "가리기 중에는 업체가 첫 줄이고…" · qa "가리기 중 L"·"가리기 중 P" · 기존 AC-1 가리기 innerHTML 단언                                                                                                            |
| 줄: 세부내용 두 줄 자르기                                                   | 부분 | qa "세부내용 200자는 첫 줄에 잘리지 않고 다 있고…"(DOM에 전체 값). 두 줄 자르기 자체는 CSS라 화면 확인                                                                                                          |
| 홈: 로그아웃 → 이유 한 줄 + 넓은 로그인 링크(카드 위)                       | 통과 | `MortgageHub.account.test.tsx` 로그아웃 · qa "주 동작 크기(isWide)"·"h1 홈 다음, 카드 목록 앞에…"                                                                                                               |
| 홈: 로그인 → "카카오 계정에 저장 중"만                                      | 통과 | account "로그인: …" · qa "로그인: 상태 줄도 카드 목록 앞이고 링크는 카드 3개뿐"                                                                                                                                 |
| 홈: 확인 중 → 숨겨 자리만(session-hint로 예측)                              | 통과 | account 확인 중 2개 · qa "확인 중 → 응답이 로그인이면…", "응답이 로그아웃(세션 끝남)이면…", "inert·aria-hidden 안에…"                                                                                           |
| 홈: 오류 → 없음                                                             | 통과 | account "계정 확인 실패(/api/me 500 + 로그인했던 브라우저)" · qa "로그인한 적 없는 브라우저는 로그인이 보인다"(오류가 아니라 loggedOut)                                                                         |
| AC-0 홈·목록 열기만 하면 기존 키 쓰기 0회(로그인 시 session-hint 기존 동작) | 통과 | qa 상태별 4개(로그아웃 setItem 0·removeItem은 session-hint뿐, 로그인 setItem은 session-hint뿐, 확인 중·실패 0회) · 기존 `MortgageHub.summary` · `AppRoutes.storageKeys.interiorSimple` AC-0(d) · table AC-12(f) |
| AC-0 표·CSV 열 순서 무변경                                                  | 통과 | 두 커밋이 표·CSV 파일을 건드리지 않음(`git diff 746c551 HEAD --stat`), `MortgageHome.table.test.tsx`·`interiorPlanTableToCsvRows.test.ts` 통과                                                                  |

## 기존 테스트 수정 검토

- `MortgageHome.lines.test.tsx`: 바뀐 것은 `listShape` 기대 글자 7개와 주석뿐. 지운 `expect` 없음, storage 단언(`setItem` 0회·`storedItem` 등) 무변경. 약화 아님.
- `MortgageHub.test.tsx` AC-5 첫 테스트: 첫 링크가 "카카오로 로그인"임을 새로 단언하고 나머지 카드 순서·href·이름·설명 단언은 그대로. 약화 아님.
- fe의 `MortgageHub.account.test.tsx` 저장소 단언은 session-hint 키를 상태와 무관하게 빼고 봐서, 로그아웃 홈이 session-hint를 써도 못 잡는다. qa 테스트가 상태별로 정확히 막는다.

## 변이 (모두 되돌림, 작업 트리 깨끗)

| 변이                                       | 결과 | 잡은 테스트(예)                                  |
| ------------------------------------------ | ---- | ------------------------------------------------ |
| M1 줄 순서 되돌리기(업체 먼저)             | 잡힘 | lines AC-1·AC-4 `listShape`, qa 로그인 L, 200자  |
| M2 세부내용 없을 때 빈 첫 줄               | 잡힘 | fe 줄 순서, qa 로그인 L                          |
| M3 가리기 중 세부내용 노출                 | 잡힘 | fe 가리기 순서, AC-1 가리기 innerHTML, qa 가리기 |
| M4 로그인 상태에 로그인 링크               | 잡힘 | account 로그인, qa 로그인 링크 수                |
| M5a 확인 중 inert 제거                     | 잡힘 | account 확인 중, qa inert                        |
| M5b 확인 중 aria-hidden 제거               | 잡힘 | account 확인 중, qa inert                        |
| M5c 확인 중 숨김 전부 제거                 | 잡힘 | 여러 개                                          |
| M6 오류일 때 로그인 노출                   | 잡힘 | account 계정 확인 실패                           |
| M6b 오류일 때 상태 줄 노출                 | 잡힘 | account 계정 확인 실패                           |
| M7a 홈에서 session-hint 쓰기(로그아웃에도) | 잡힘 | qa 로그아웃·확인 중·실패 쓰기, summary           |
| M7b 홈에서 draft 쓰기                      | 잡힘 | account·qa 쓰기, summary                         |
| M8 isWide 빠짐                             | 잡힘 | qa "주 동작 크기"만 (fe 테스트는 못 잡음)        |
| M9 확인 중 session-hint 무시               | 잡힘 | account 확인 중(로그인한 적 있음)                |
| M10 계정 자리를 카드 아래로                | 잡힘 | account 로그아웃, AC-5, qa 순서                  |

## 실행

- `pnpm lint` · `pnpm format:check` · `pnpm test`(102 파일, 1918 통과 + 1 todo, 1903 → 1918) · `pnpm build` 모두 통과.

## 결함

- 없음.

## 화면에서 직접 확인할 항목

- 우리 집 줄 첫 줄(세부내용)이 360px에서 두 줄로 잘리고 말줄임 되는지, 업체 줄이 작고 흐린 스타일인지.
- 홈 로그인 버튼이 48px 높이로 줄을 채우는지, 확인 중 → 확인 뒤 카드가 밀리지 않는지(자리 높이가 같은지).
- 확인 중 숨은 링크가 Tab 포커스를 받지 않는지(실제 브라우저의 inert).
