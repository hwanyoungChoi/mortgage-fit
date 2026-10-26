// 로그인 사용자의 저장 목록(ADR-023 D3·D4). 행마다 `data`에 ListingInput JSON을 둔다.
// POST·PUT·PATCH의 updatedAt은 서버 시각, import는 넘어온 시각을 그대로 쓴다.
// 함께 쓰는 중이면 구성원 매물 중 숨기지 않은 행이 범위다(ADR-028, `LISTING_SCOPE_SQL`). 행의 `user_id`는 계속 "넣은 사람"이다.
import {
  parseImportRequest,
  parseListingPatchRequest,
  parseListingRequest,
} from "./parseListingRequests";
import { createRandomId } from "../../src/lib/utils/createRandomId";
import { isListingId } from "../../src/lib/utils/validateListingFields";
import { HOUSEHOLD_LISTINGS_MAX, LISTING_SCOPE_SQL } from "../household/householdScope";
import { readJsonBody } from "../http/readJsonBody";
import { errorResponse, jsonResponse, noContentResponse } from "../http/response";

import type {
  ImportListingsResponse,
  ListingListResponse,
  ListingResponse,
} from "../../src/lib/types/account";
import type { Listing, ListingInput } from "../../src/lib/types/listing";

const LISTING_MAX_BYTES = 512 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

type ListingRow = { id: string; data: string; created_at: string; updated_at: string };

const toListing = (row: ListingRow): Listing => ({
  id: row.id,
  ...(JSON.parse(row.data) as ListingInput),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const invalidParams = (message: string) => errorResponse(400, "invalidParams", message);
const invalidId = () => invalidParams("매물 id 형식이 올바르지 않습니다");
const limitExceeded = () =>
  invalidParams(`계정에는 매물을 ${HOUSEHOLD_LISTINGS_MAX}개까지 저장할 수 있습니다`);
const listingNotFound = () =>
  errorResponse(404, "notFound", "없거나 다른 기기에서 삭제된 매물입니다");

const listingResponse = (status: number, listing: Listing) => {
  const body: ListingResponse = { listing };
  return jsonResponse(status, body, NO_STORE);
};

/**
 * GET /api/listings. 화면 정렬은 클라이언트가 한다.
 * 응답 순서는 `ORDER BY user_id, id`로 고정한다(혼자 쓰면 PK 순서 그대로라 배포 전과 같다).
 */
export async function listListings(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT id, data, created_at, updated_at FROM listings
       WHERE ${LISTING_SCOPE_SQL}
       ORDER BY user_id, id`,
    )
    .bind(userId)
    .all<ListingRow>();
  const body: ListingListResponse = { listings: results.map(toListing) };
  return jsonResponse(200, body, NO_STORE);
}

/** POST /api/listings. id·시각은 서버가 만든다. 이미 500개(가구는 합계)면 넣지 않고 400 */
export async function createListing(
  request: Request,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  const body = await readJsonBody(request, LISTING_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseListingRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const createdAt = now().toISOString();
  const listing: Listing = {
    id: createRandomId(),
    ...parsed.value,
    createdAt,
    updatedAt: createdAt,
  };
  // 개수 확인과 넣기를 한 문장으로 해서 500개를 넘겨 넣지 않는다.
  const inserted = await db
    .prepare(
      `INSERT INTO listings (user_id, id, data, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?4
       WHERE (SELECT COUNT(*) FROM listings WHERE ${LISTING_SCOPE_SQL}) < ?5`,
    )
    .bind(userId, listing.id, JSON.stringify(parsed.value), createdAt, HOUSEHOLD_LISTINGS_MAX)
    .run();
  if (inserted.meta.changes === 0) return limitExceeded();
  return listingResponse(201, listing);
}

/**
 * PUT /api/listings/{id}. 본문의 `memo`·`status`는 읽지 않고 기존 값을 그대로 둔다(ADR-027).
 * SELECT 후 UPDATE를 하지 않고 한 문장으로 해서, 다른 기기가 그 사이 쓴 메모·상태를 지우지 않는다.
 * 기존 값이 없으면 `json_extract`가 NULL이라 merge patch가 그 키를 쓰지 않는다(빈 키를 만들지 않음).
 */
export async function replaceListing(
  request: Request,
  id: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isListingId(id)) return invalidId();
  const body = await readJsonBody(request, LISTING_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseListingRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const fields: ListingInput = { ...parsed.value };
  delete fields.memo;
  delete fields.status;
  const row = await db
    .prepare(
      `UPDATE listings
       SET data = json_patch(
             ?3,
             json_object(
               'memo', json_extract(data, '$.memo'),
               'status', json_extract(data, '$.status')
             )
           ),
           updated_at = ?4
       WHERE ${LISTING_SCOPE_SQL} AND id = ?2
       RETURNING id, data, created_at, updated_at`,
    )
    .bind(userId, id, JSON.stringify(fields), now().toISOString())
    .first<ListingRow>();
  return row === null ? listingNotFound() : listingResponse(200, toListing(row));
}

/**
 * PATCH /api/listings/{id} `{ memo?, status?, name? }`. 보낸 키만 바꾸거나 지운다(빈 메모·null 상태는 지움).
 * merge patch 한 문장 UPDATE라 다른 기기가 바꾼 가격 등 다른 필드를 되돌리지 않는다.
 */
export async function updateListingFields(
  request: Request,
  id: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isListingId(id)) return invalidId();
  const body = await readJsonBody(request, LISTING_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseListingPatchRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const row = await db
    .prepare(
      `UPDATE listings
       SET data = json_patch(data, ?3),
           updated_at = ?4
       WHERE ${LISTING_SCOPE_SQL} AND id = ?2
       RETURNING id, data, created_at, updated_at`,
    )
    .bind(userId, id, JSON.stringify(parsed.value), now().toISOString())
    .first<ListingRow>();
  return row === null ? listingNotFound() : listingResponse(200, toListing(row));
}

/** DELETE /api/listings/{id} → 204, 없으면 404 */
export async function deleteListing(id: string, db: D1Database, userId: string): Promise<Response> {
  if (!isListingId(id)) return invalidId();
  const deleted = await db
    .prepare(`DELETE FROM listings WHERE ${LISTING_SCOPE_SQL} AND id = ?2`)
    .bind(userId, id)
    .run();
  return deleted.meta.changes === 0 ? listingNotFound() : noContentResponse();
}

/** import 본문(`?2`, JSON 배열) 중 범위에 아직 없는 서로 다른 id를 더한 범위 합계가 상한(`?3`)을 넘는가 */
const IMPORT_OVER_LIMIT_SQL = `
  (SELECT COUNT(*) FROM listings WHERE ${LISTING_SCOPE_SQL})
  + (SELECT COUNT(DISTINCT json_extract(value, '$.id')) FROM json_each(?2))
  - (SELECT COUNT(*) FROM listings
      WHERE ${LISTING_SCOPE_SQL}
        AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?2)))
  > ?3`;

/**
 * POST /api/listings/import. 범위(가구면 구성원 전체)에 이미 있는 id(같은 요청 안의 뒤쪽 중복 포함)는 건너뛰어
 * 다시 보내도 중복이 없다. 상한은 "요청 중 아직 없는 id 수"만 더해 본다(이미 옮긴 id의 재시도는 막지 않음).
 * 넘으면 아무것도 넣지 않고 400.
 * 함께 쓰는 B가 숨긴 자기 매물과 같은 id를 보내면 PK(user_id, id) 충돌로 건너뛴다(`skipped`). 숨긴 행이 나가기 때 돌아온다.
 * 상한·없는 id 검사와 넣기를 한 문장으로 해서 두 구성원이 동시에 넣어도 상한을 넘거나 가구 안에 같은 id가
 * 생기지 않는다(ADR-028 조건 2). SQLite는 넣는 테이블을 읽는 INSERT … SELECT의 결과를 먼저 다 구한 뒤 넣는다.
 * 0개가 들어갔을 때 상한 때문인지는 같은 batch(한 트랜잭션)의 다음 문장으로 같은 식을 다시 본다.
 * 넣기는 `json_each` 한 문장이라 바인딩 3개·쿼리 2개다(D1 쿼리당 바인딩 100개, 호출당 쿼리 50개 한도 안).
 */
export async function importListings(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, LISTING_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseImportRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const listings = parsed.value;
  const listingsJson = JSON.stringify(listings);
  // WHERE … : INSERT … SELECT 뒤에 ON CONFLICT를 쓸 때는 WHERE가 있어야 SQLite 구문이 모호하지 않다.
  const [inserted, check] = await db.batch<{ isOverLimit: number }>([
    db
      .prepare(
        `INSERT INTO listings (user_id, id, data, created_at, updated_at)
         SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.data'),
                json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
         FROM json_each(?2)
         WHERE NOT EXISTS (
                 SELECT 1 FROM listings
                 WHERE ${LISTING_SCOPE_SQL} AND id = json_extract(value, '$.id')
               )
           AND NOT (${IMPORT_OVER_LIMIT_SQL})
         ORDER BY key
         ON CONFLICT (user_id, id) DO NOTHING`,
      )
      .bind(userId, listingsJson, HOUSEHOLD_LISTINGS_MAX),
    db
      .prepare(`SELECT (${IMPORT_OVER_LIMIT_SQL}) AS isOverLimit`)
      .bind(userId, listingsJson, HOUSEHOLD_LISTINGS_MAX),
  ]);
  const imported = inserted.meta.changes;
  if (imported === 0 && check.results[0]?.isOverLimit === 1) return limitExceeded();
  const response: ImportListingsResponse = { imported, skipped: listings.length - imported };
  return jsonResponse(200, response, NO_STORE);
}
