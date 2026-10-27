-- 인테리어 플래너(ADR-029 D1 C, 스펙 interior-planner). 추가만 한다: 새 테이블 2개, 부분 인덱스 1개.
-- 기존 테이블·행을 읽거나 고치지 않는다. 플랜은 행마다 JSON(매물과 같은 패턴), 항목도 행마다 JSON이다.

CREATE TABLE interior_plans (
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- 만든 사람(나가기 때 이 사람 것)
  id                  TEXT NOT NULL,
  data                TEXT NOT NULL,   -- JSON: name, budget?, listingId?, spaces
  hidden_household_id TEXT,            -- listings와 같은 규칙(수락 시 B 플랜 숨김). NULL = 보임
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (user_id, id)            -- 로컬 id를 그대로 옮기므로 listings와 같은 PK
);
CREATE INDEX interior_plans_hidden_household_id ON interior_plans (hidden_household_id)
  WHERE hidden_household_id IS NOT NULL;

CREATE TABLE interior_plan_items (
  plan_user_id TEXT NOT NULL,
  plan_id      TEXT NOT NULL,
  id           TEXT NOT NULL,
  data         TEXT NOT NULL,          -- JSON: InteriorItem에서 id·시각 뺀 것
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (plan_user_id, plan_id, id),
  FOREIGN KEY (plan_user_id, plan_id) REFERENCES interior_plans (user_id, id) ON DELETE CASCADE
);
