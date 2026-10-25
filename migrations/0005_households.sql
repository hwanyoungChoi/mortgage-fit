-- 함께 쓰는 목록(ADR-028 D1 A). 추가만 한다: 새 테이블 2개, users에 NULL 컬럼 1개, 인덱스 3개.
-- 기존 행을 읽거나 고치지 않는다(users 기존 행의 household_id는 NULL = 혼자 쓰는 중). listings·sessions·shares는 그대로다.

-- 가구. 구성원이 있는 동안만 존재한다(나가기로 1명 이하가 되면 지운다). 예산·순서는 구성원 공통 값.
CREATE TABLE households (
  id            TEXT PRIMARY KEY,                -- 서버가 만든 16바이트 hex
  budget        INTEGER,                         -- users.budget과 같은 규칙, NULL = 없음
  listing_order TEXT,                            -- users.listing_order와 같은 규칙(JSON id 배열), NULL = 없음
  created_at    TEXT NOT NULL                    -- ISO 8601
);

ALTER TABLE users ADD COLUMN household_id TEXT REFERENCES households (id);
CREATE INDEX users_household_id ON users (household_id);

-- 초대. 토큰 평문은 저장하지 않는다. 1회용, 7일. 만료 행은 초대 생성 때 정리한다(크론 없음).
CREATE TABLE household_invites (
  token_hash  TEXT PRIMARY KEY,                  -- 토큰(16바이트 base64url 22자)의 SHA-256 hex
  inviter_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,                  -- unix 초
  expires_at  INTEGER NOT NULL,                  -- unix 초, created_at + 7일
  used_at     INTEGER,                           -- unix 초, NULL = 아직 안 씀
  accepted_by TEXT REFERENCES users (id) ON DELETE CASCADE -- 수락한 사용자. 수락 batch의 뒤 문장 가드
);
CREATE INDEX household_invites_inviter_id ON household_invites (inviter_id);
-- 1인 1초대(미사용 기준)를 DB가 보장한다.
CREATE UNIQUE INDEX household_invites_one_open ON household_invites (inviter_id) WHERE used_at IS NULL;
