# ADR-028 함께 쓰는 목록의 데이터 모델·반영 방식·초대 복귀

- 상태: 채택
- 맥락: 공유하면 같이 편집되게(사용자 선택: 두 계정이 한 목록을 함께 쓰는 방식). 기존 데이터를 깨지 않는 모델, 다른 기기 반영 방식, 로그인 후 초대 화면 복귀를 정해야 했다. 스펙: [shared-list](../specs/shared-list.md)
- 선택지: D1 A `households` + `users.household_id`, 구성원 매물 합집합 / B 전 사용자 space로 매물 이전 / C 수락 시 B 매물을 A 소유로 이전 · D2 A 포커스 + 가구일 때만 30초 폴링 / B WebSocket(Durable Objects) · D3 A 서버 쿠키 `mf_oauth_invite` / B sessionStorage
- 의견: pm(전부 A) / be(D1 찬성, D2·D3 조건부)
- 검토 원문: [be](../reviews/20261025-1351-be-spec-shared-list.md)
- 결정: D1 A, D2 A, D3 A. be 조건을 구현 필수로:
  1. 수락 batch는 `household_invites.accepted_by` 가드로 뒤 문장을 묶고, 상한·인원·`household_id IS NULL`도 batch 안에서 검사, 성공은 마지막 문장 `meta.changes`로 판정.
  2. 가구의 import·POST는 "가구 범위 id 미존재 AND 합계 + n ≤ 500"을 한 문장 INSERT…SELECT로(사전 SELECT 제거).
  3. 순서 병합은 가구에 실제 있는 id만, 500 이하.
  4. 초대 쿠키: 콜백에서 토큰 모양 재검사, `?invite=` 없는 로그인 시작·취소·실패에서 쿠키 삭제.
  5. 수락 문구에 "초대한 사람이 내 목록을 보고 수정·삭제할 수 있고 되돌릴 수 없다", 나가기 문구에 "상대가 지운 매물은 돌아오지 않는다".
  6. 초대 생성은 미사용 초대 삭제·만료 정리·INSERT·2명 가드를 한 batch로, `UNIQUE INDEX (inviter_id) WHERE used_at IS NULL`. 수락 시 양쪽 미사용 초대 삭제.
  - 혼자 쓰는 사용자의 응답은 배포 전후 같게(`ORDER BY user_id, id` 명시), 주기 요청 0건. 폴링 간격은 상수.
- 이유: 기존 행·PK를 건드리지 않고 혼자 쓰는 경로가 그대로라 AC-0에 가장 안전하다(D1). 부부 둘이 쓰는 규모라 소켓은 과하다(D2). 쿠키 방식은 다른 탭·기기 로그인에도 돌아온다(D3).
- 뒤집을 조건: 3명 이상·실시간 동시 편집 요구가 생기면 D2 B와 권한 모델을 다시 본다.
- 롤백: 가구가 하나도 없을 때만 이전 Worker로 안전하게 되돌릴 수 있다.
- 제품 기본값(사용자 확인 전): 스펙 U1~U7.
