// 함께 쓰는 목록(ADR-028)의 범위 판단을 한 곳에 둔다. listings·budget·listing-order·me·초대·인테리어 플랜이 모두 이 파일을 쓴다.
import type { Household } from "../../src/lib/types/household";

/** 함께 쓰는 목록의 인원 상한(U5) */
export const HOUSEHOLD_MAX_MEMBERS = 2;

/**
 * 함께 쓰는 목록 하나의 매물 상한(U7). 혼자 쓰는 계정의 상한과 같은 값이고,
 * 직접 정렬 순서 한도(`LISTING_ORDER_MAX_LENGTH`)와 맞춘다.
 */
export const HOUSEHOLD_LISTINGS_MAX = 500;

/**
 * 요청자(바인딩 `?1`)의 구성원 id 집합. 가구가 있으면 같은 `household_id`의 users, 없으면 요청자 하나.
 * 혼자 쓰는 사용자는 `household_id = NULL`이 거짓이라 `{요청자}`가 되어 기존 `user_id = ?1`과 결과가 같다.
 * 매물 범위는 이 집합에 숨김 조건을 더한 `LISTING_SCOPE_SQL`을 쓴다.
 */
export const MEMBER_IDS_SQL =
  "SELECT id FROM users WHERE id = ?1 OR household_id = (SELECT household_id FROM users WHERE id = ?1)";

/**
 * 요청자(바인딩 `?1`)가 보고 쓸 수 있는 `listings` 행의 조건. 구성원 매물 중 숨기지 않은 행만이다.
 * 수락 때 숨긴 B의 매물(`hidden_household_id` = 가구)은 A 매물과 id가 같아도 조회·쓰기·상한·중복 id 검사에 들어가지 않는다.
 * 혼자 쓰는 사용자의 행은 모두 NULL이라(0006 이전 행, 나가기로 되돌린 행) 기존 `user_id = ?1`과 결과가 같다.
 * 쓰는 쪽은 `FROM listings WHERE ${LISTING_SCOPE_SQL} AND …`처럼 넣는다(listings 별칭 없이).
 */
export const LISTING_SCOPE_SQL = `user_id IN (${MEMBER_IDS_SQL}) AND hidden_household_id IS NULL`;

/**
 * 요청자(바인딩 `?1`)가 보고 쓸 수 있는 `interior_plans` 행의 조건. 매물과 같은 규칙(ADR-029 D4)이고 열 이름도 같아
 * 같은 식을 쓴다: 구성원 플랜 중 숨기지 않은 행. 쓰는 쪽은 `FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND …`처럼 넣는다(별칭 없이).
 */
export const PLAN_SCOPE_SQL = LISTING_SCOPE_SQL;

/**
 * 요청자(`?1`)의 범위 안 플랜에 속한 `interior_plan_items` 행의 조건. 항목 행에는 숨김 컬럼이 없어 항목을 읽고 쓰는
 * 모든 문장(목록 GET·항목 POST 개수 검사·PUT·DELETE)이 이 조각을 거친다. 빠뜨리면 숨긴 플랜의 항목이 보인다.
 * 한 플랜만 볼 때는 `AND plan_id = ?2`를 붙인다(범위 안 플랜 id는 겹치지 않는다: POST는 서버 id, import는 범위 검사).
 * 서브쿼리 안의 `user_id`·`id`는 가장 안쪽 FROM인 `interior_plans`의 열이다(항목 테이블의 `id`로 해석되지 않는다).
 */
export const PLAN_ITEM_SCOPE_SQL = `(plan_user_id, plan_id) IN (SELECT user_id, id FROM interior_plans WHERE ${PLAN_SCOPE_SQL})`;

/** 예산·순서처럼 구성원이 함께 쓰는 값. 같은 이름의 컬럼이 `users`와 `households`에 있다. */
export type SharedColumn = "budget" | "listing_order";

/** 가구가 있으면 `households`의 값, 없으면 `users`의 값(NULL = 없음) */
export async function readSharedValue<T>(
  db: D1Database,
  userId: string,
  column: SharedColumn,
): Promise<T | null> {
  const row = await db
    .prepare(
      `SELECT CASE WHEN u.household_id IS NULL THEN u.${column} ELSE h.${column} END AS value
       FROM users u LEFT JOIN households h ON h.id = u.household_id
       WHERE u.id = ?1`,
    )
    .bind(userId)
    .first<{ value: T | null }>();
  return row?.value ?? null;
}

/**
 * 같은 값을 가구가 있으면 `households`에, 없으면 `users`에 쓴다. `expression`은 새 값 SQL이고 `?2`가 `value`다
 * (예: `?2`, `COALESCE(budget, ?2)`). 두 UPDATE를 한 batch(한 트랜잭션)로 보내 한쪽만 1행을 바꾼다.
 * 돌려주는 값은 쓴 뒤의 컬럼 값이다(users 행이 없으면 undefined).
 */
export async function writeSharedValue<T>(
  db: D1Database,
  userId: string,
  column: SharedColumn,
  expression: string,
  value: unknown,
): Promise<T | null | undefined> {
  const [solo, household] = await db.batch<{ value: T | null }>([
    db
      .prepare(
        `UPDATE users SET ${column} = ${expression} WHERE id = ?1 AND household_id IS NULL
         RETURNING ${column} AS value`,
      )
      .bind(userId, value),
    db
      .prepare(
        `UPDATE households SET ${column} = ${expression}
         WHERE id = (SELECT household_id FROM users WHERE id = ?1)
         RETURNING ${column} AS value`,
      )
      .bind(userId, value),
  ]);
  return (solo.results[0] ?? household.results[0])?.value;
}

/** `/api/me`의 `household`. 혼자 쓰면 null */
export async function readHousehold(db: D1Database, userId: string): Promise<Household | null> {
  const row = await db
    .prepare(
      `SELECT household_id,
              (SELECT COUNT(*) FROM users m WHERE m.household_id = u.household_id) AS member_count
       FROM users u WHERE u.id = ?1`,
    )
    .bind(userId)
    .first<{ household_id: string | null; member_count: number }>();
  return row === null || row.household_id === null ? null : { memberCount: row.member_count };
}
