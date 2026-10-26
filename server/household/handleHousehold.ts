// 함께 쓰는 목록의 초대·수락·나가기(ADR-028, 스펙 shared-list). 초대 토큰은 목록 편집 권한을 주므로 해시만 저장한다.
// 여러 문장을 쓰는 처리는 모두 D1 batch(한 트랜잭션) 한 번이고, 뒤 문장은 앞 문장이 성공했을 때만 행을 바꾸게 가드한다.
import { HOUSEHOLD_LISTINGS_MAX, HOUSEHOLD_MAX_MEMBERS, MEMBER_IDS_SQL } from "./householdScope";
import { createRandomId } from "../../src/lib/utils/createRandomId";
import { randomBase64url, sha256Hex } from "../crypto/tokens";
import { errorResponse, jsonResponse, noContentResponse } from "../http/response";

import type {
  AcceptHouseholdInviteResponse,
  CreateHouseholdInviteResponse,
  HouseholdInviteResponse,
} from "../../src/lib/types/household";

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVITE_TOKEN_BYTES = 16;
/** 16바이트 base64url. 모양이 다르면 DB를 보지 않고 404 */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const NO_STORE = { "Cache-Control": "no-store" };

type InviteRow = { inviter_id: string; used_at: number | null; expires_at: number };

const toUnixSeconds = (date: Date) => Math.floor(date.getTime() / 1000);
const toIsoString = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

/** 초대 토큰 모양 검사. 로그인 `?invite=`·콜백 쿠키도 이 함수로 본다. */
export const isInviteToken = (value: string | null): value is string =>
  value !== null && INVITE_TOKEN_PATTERN.test(value);

/** 없음·끊김·사용됨·만료는 모두 같은 404(클라이언트 화면 하나) */
const inviteNotFound = () => errorResponse(404, "notFound", "만료되었거나 이미 쓴 초대입니다");
const householdFull = () =>
  errorResponse(
    409,
    "householdFull",
    `이미 ${HOUSEHOLD_MAX_MEMBERS}명이 함께 쓰고 있는 목록입니다`,
  );

/**
 * POST /api/household/invites → 201. 1인 1초대: 내 미사용 초대 삭제 · 만료 초대 정리 · 새 초대 넣기를 한 batch로 한다
 * (유니크 인덱스 `household_invites_one_open`이 DB에서도 보장). 이미 인원이 차 있으면 넣지 않고 409.
 */
export async function createHouseholdInvite(
  request: Request,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  const createdAt = toUnixSeconds(now());
  const expiresAt = createdAt + INVITE_TTL_SECONDS;
  const token = randomBase64url(INVITE_TOKEN_BYTES);

  const [, , inserted] = await db.batch([
    db
      .prepare("DELETE FROM household_invites WHERE inviter_id = ?1 AND used_at IS NULL")
      .bind(userId),
    db.prepare("DELETE FROM household_invites WHERE expires_at <= ?1").bind(createdAt),
    db
      .prepare(
        `INSERT INTO household_invites (token_hash, inviter_id, created_at, expires_at)
         SELECT ?2, ?1, ?3, ?4
         WHERE (SELECT COUNT(*) FROM (${MEMBER_IDS_SQL})) < ?5`,
      )
      .bind(userId, await sha256Hex(token), createdAt, expiresAt, HOUSEHOLD_MAX_MEMBERS),
  ]);
  if (inserted.meta.changes === 0) return householdFull();

  const response: CreateHouseholdInviteResponse = {
    token,
    url: `${new URL(request.url).origin}/#/invite/${token}`,
    expiresAt: toIsoString(expiresAt),
  };
  return jsonResponse(201, response, NO_STORE);
}

/** DELETE /api/household/invites → 204. 내 미사용 초대를 지운다(없어도 204). */
export async function revokeHouseholdInvite(db: D1Database, userId: string): Promise<Response> {
  await db
    .prepare("DELETE FROM household_invites WHERE inviter_id = ? AND used_at IS NULL")
    .bind(userId)
    .run();
  return noContentResponse();
}

/** GET /api/household/invites/{token} → 200 `{ expiresAt }`. 초대한 사람 정보는 내려주지 않는다. */
export async function getHouseholdInvite(
  token: string,
  db: D1Database,
  now: () => Date,
): Promise<Response> {
  if (!isInviteToken(token)) return inviteNotFound();
  const row = await db
    .prepare(
      "SELECT expires_at FROM household_invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    )
    .bind(await sha256Hex(token), toUnixSeconds(now()))
    .first<{ expires_at: number }>();
  if (row === null) return inviteNotFound();
  const response: HouseholdInviteResponse = { expiresAt: toIsoString(row.expires_at) };
  return jsonResponse(200, response, NO_STORE);
}

/**
 * 수락 batch ①의 조건. 바인딩: ?1 수락자(B), ?2 token_hash, ?3 지금(unix 초), ?4 초대자(A), ?5 매물 상한.
 * 쓸 수 있는 초대 · 자기 초대 아님 · 두 사람 모두 혼자 쓰는 중(2명 가구라 초대자도 혼자여야 한다) · 합계 상한 이하.
 * B의 id가 A와 겹치면 지우지 않고 새 id로 바꾸므로 합계는 그대로다.
 */
const ACCEPT_GUARD_SQL = `
  token_hash = ?2 AND used_at IS NULL AND expires_at > ?3
  AND inviter_id = ?4 AND inviter_id <> ?1
  AND (SELECT household_id FROM users WHERE id = ?1) IS NULL
  AND (SELECT household_id FROM users WHERE id = ?4) IS NULL
  AND (SELECT COUNT(*) FROM listings WHERE user_id IN (?1, ?4)) <= ?5`;

/**
 * 합친 순서(U2·조건 3): A 순서 다음에 (B 순서 − A 순서). 두 사람 매물에 실제 있는 id만 남기므로 상한 이하다.
 * 둘 다 순서가 없으면 NULL. B 매물 중 id를 새로 받는 것은 순서에 없어 맨 위에 온다(ADR-026 규칙, 의도한 동작).
 * 바인딩: ?1 B, ?4 A. 이름 바꾸기(③)보다 먼저 계산해야 겹친 id가 A 매물을 가리킨다.
 */
const MERGED_ORDER_SQL = `
  CASE
    WHEN (SELECT listing_order FROM users WHERE id = ?4) IS NULL
     AND (SELECT listing_order FROM users WHERE id = ?1) IS NULL THEN NULL
    ELSE (
      SELECT json_group_array(value ORDER BY part, position) FROM (
        SELECT value, 0 AS part, key AS position
        FROM json_each((SELECT listing_order FROM users WHERE id = ?4))
        UNION ALL
        SELECT value, 1, key
        FROM json_each((SELECT listing_order FROM users WHERE id = ?1))
        WHERE value NOT IN (
          SELECT value FROM json_each(COALESCE((SELECT listing_order FROM users WHERE id = ?4), '[]'))
        )
      )
      WHERE value IN (SELECT id FROM listings WHERE user_id IN (?1, ?4))
    )
  END`;

/**
 * 수락이 왜 안 됐는지. batch가 아무것도 바꾸지 않은 뒤에만 부른다(성공 판정에는 쓰지 않음).
 * 초대 행을 다시 읽어 동시 수락에서 진 쪽은 404가 된다.
 */
async function describeAcceptFailure(
  db: D1Database,
  userId: string,
  tokenHash: string,
  nowSeconds: number,
): Promise<Response> {
  const state = await db
    .prepare(
      `SELECT i.inviter_id, i.used_at, i.expires_at,
              (SELECT household_id FROM users WHERE id = ?1) AS acceptor_household,
              (SELECT household_id FROM users WHERE id = i.inviter_id) AS inviter_household,
              (SELECT COUNT(*) FROM listings WHERE user_id IN (?1, i.inviter_id)) AS total
       FROM household_invites i WHERE i.token_hash = ?2`,
    )
    .bind(userId, tokenHash)
    .first<
      InviteRow & {
        acceptor_household: string | null;
        inviter_household: string | null;
        total: number;
      }
    >();
  if (state === null || state.used_at !== null || state.expires_at <= nowSeconds) {
    return inviteNotFound();
  }
  if (state.inviter_id === userId) {
    return errorResponse(400, "ownInvite", "내가 만든 초대 링크입니다");
  }
  if (state.acceptor_household !== null) {
    return errorResponse(409, "alreadyInHousehold", "이미 함께 쓰는 목록이 있습니다");
  }
  if (state.inviter_household !== null) return householdFull();
  if (state.total > HOUSEHOLD_LISTINGS_MAX) {
    return errorResponse(
      409,
      "householdLimit",
      `합치면 ${HOUSEHOLD_LISTINGS_MAX}개를 넘어 함께 쓸 수 없습니다`,
    );
  }
  // 그 사이 상태가 바뀐 경합(예: 상대가 매물을 지움). 아무것도 바뀌지 않았으니 다시 시도하면 된다.
  throw new Error("household accept guard failed without cause");
}

/**
 * POST /api/household/invites/{token}/accept → 200 `{ household: { memberCount } }`. batch 한 번:
 * ① 초대를 쓴 것으로 표시(조건 전부 `ACCEPT_GUARD_SQL`) ② 가구 만들기(예산 A 우선, 순서 병합)
 * ③ B 매물 중 A와 id가 겹치는 행에 새 id ④ 두 사람의 미사용 초대 삭제 ⑤ 두 사람 `household_id` 설정.
 * ②는 ①이 이 사용자로 표시한 초대가 있을 때만, ③~⑤는 이 요청이 만든 가구 행(새 id)이 있을 때만 행을 바꾼다.
 * 성공은 ⑤가 바꾼 행 수(2)로 판정한다. 검사는 ①에만 있어 실패하면 아무것도 바뀌지 않는다.
 */
export async function acceptHouseholdInvite(
  token: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isInviteToken(token)) return inviteNotFound();
  const tokenHash = await sha256Hex(token);
  const invite = await db
    .prepare("SELECT inviter_id FROM household_invites WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ inviter_id: string }>();
  if (invite === null) return inviteNotFound();

  const nowDate = now();
  const nowSeconds = toUnixSeconds(nowDate);
  const householdId = createRandomId();
  const inviterId = invite.inviter_id;
  const householdExists = "EXISTS (SELECT 1 FROM households WHERE id = ?3)";

  const results = await db.batch([
    db
      .prepare(
        `UPDATE household_invites SET used_at = ?3, accepted_by = ?1 WHERE ${ACCEPT_GUARD_SQL}`,
      )
      .bind(userId, tokenHash, nowSeconds, inviterId, HOUSEHOLD_LISTINGS_MAX),
    db
      .prepare(
        `INSERT INTO households (id, budget, listing_order, created_at)
         SELECT ?5,
                COALESCE((SELECT budget FROM users WHERE id = ?4), (SELECT budget FROM users WHERE id = ?1)),
                ${MERGED_ORDER_SQL},
                ?6
         WHERE EXISTS (
                 SELECT 1 FROM household_invites
                 WHERE token_hash = ?2 AND accepted_by = ?1 AND used_at = ?3
               )
           AND (SELECT household_id FROM users WHERE id = ?1) IS NULL
           AND (SELECT household_id FROM users WHERE id = ?4) IS NULL`,
      )
      .bind(userId, tokenHash, nowSeconds, inviterId, householdId, nowDate.toISOString()),
    db
      .prepare(
        `UPDATE listings SET id = lower(hex(randomblob(16)))
         WHERE user_id = ?1 AND id IN (SELECT id FROM listings WHERE user_id = ?2) AND ${householdExists}`,
      )
      .bind(userId, inviterId, householdId),
    db
      .prepare(
        `DELETE FROM household_invites
         WHERE inviter_id IN (?1, ?2) AND used_at IS NULL AND ${householdExists}`,
      )
      .bind(userId, inviterId, householdId),
    db
      .prepare(
        `UPDATE users SET household_id = ?3
         WHERE id IN (?1, ?2) AND household_id IS NULL AND ${householdExists}`,
      )
      .bind(userId, inviterId, householdId),
  ]);

  const memberCount = results[results.length - 1].meta.changes;
  if (memberCount === 0) return describeAcceptFailure(db, userId, tokenHash, nowSeconds);
  const response: AcceptHouseholdInviteResponse = { household: { memberCount } };
  return jsonResponse(200, response, NO_STORE);
}

/**
 * POST /api/household/leave → 204, 가구가 없으면 404. 2명 가구라 나가기 = 해체(U3), batch 한 번:
 * 구성원 모두에게 가구 예산·순서 복사 → 구성원의 미사용 초대 삭제 → `household_id = NULL` → 가구 행 삭제.
 * 매물 행은 건드리지 않는다(각자 넣은 매물이 각자 목록이 된다). 모든 문장이 읽어 둔 가구 id로 한정돼
 * 두 사람이 동시에 나가도 뒤의 요청은 0행이 되어 404다.
 */
export async function leaveHousehold(db: D1Database, userId: string): Promise<Response> {
  const user = await db
    .prepare("SELECT household_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ household_id: string | null }>();
  const householdId = user?.household_id ?? null;
  const householdNotFound = () => errorResponse(404, "notFound", "함께 쓰는 목록이 없습니다");
  if (householdId === null) return householdNotFound();

  const [, , cleared] = await db.batch([
    db
      .prepare(
        `UPDATE users
         SET budget = (SELECT budget FROM households WHERE id = ?1),
             listing_order = (SELECT listing_order FROM households WHERE id = ?1)
         WHERE household_id = ?1`,
      )
      .bind(householdId),
    db
      .prepare(
        `DELETE FROM household_invites
         WHERE used_at IS NULL AND inviter_id IN (SELECT id FROM users WHERE household_id = ?1)`,
      )
      .bind(householdId),
    db.prepare("UPDATE users SET household_id = NULL WHERE household_id = ?1").bind(householdId),
    db.prepare("DELETE FROM households WHERE id = ?1").bind(householdId),
  ]);
  return cleared.meta.changes === 0 ? householdNotFound() : noContentResponse();
}
