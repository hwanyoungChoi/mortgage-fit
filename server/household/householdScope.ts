// 함께 쓰는 목록(ADR-028)의 범위 판단을 한 곳에 둔다. listings·budget·listing-order·me·초대가 모두 이 파일을 쓴다.
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
 * 쓰는 쪽은 `user_id IN (${MEMBER_IDS_SQL})`처럼 넣는다.
 */
export const MEMBER_IDS_SQL =
  "SELECT id FROM users WHERE id = ?1 OR household_id = (SELECT household_id FROM users WHERE id = ?1)";

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
