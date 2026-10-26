-- 함께 쓰는 목록 개정(ADR-028 개정 2026-10-26): 수락자(B)의 기존 매물은 합치지 않고 숨겼다가 나가면 돌려준다.
-- 추가만 한다: NULL 컬럼 2개, 부분 인덱스 1개. 기존 행을 읽거나 고치지 않는다(기존 행은 모두 NULL = 숨기지 않음, 초대자 기록 없음).

-- 수락 때 숨긴 B의 매물에 그 가구 id를 둔다. NULL = 보이는 행. 가구 범위·혼자 쓰는 범위 모두 NULL인 행만 본다.
-- FK를 걸지 않는다: 나가기 batch가 이 값을 NULL로 되돌린 뒤 가구 행을 지운다.
ALTER TABLE listings ADD COLUMN hidden_household_id TEXT;
-- 나가기 때 "이 가구에 숨긴 행"을 찾는다. 숨긴 행만 담는다(혼자 쓰는 사용자 행은 인덱스에 없음).
CREATE INDEX listings_hidden_household_id ON listings (hidden_household_id)
  WHERE hidden_household_id IS NOT NULL;

-- 가구를 만든 초대자(A). 나가기 때 가구 예산·순서를 A의 users 값으로 옮긴다(B는 수락 전 users 값 그대로).
-- 초대 행은 만료 정리로 지워지므로 거기서 찾지 않는다.
ALTER TABLE households ADD COLUMN inviter_id TEXT REFERENCES users (id);
