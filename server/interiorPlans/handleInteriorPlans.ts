// 로그인 사용자의 인테리어 플랜(ADR-029 D1 C, 스펙 interior-planner "API 계약"). 플랜 행 + 항목 행, 각각 `data`에 JSON.
// 범위는 매물과 같은 규칙이다: 함께 쓰는 중이면 구성원 플랜 중 숨기지 않은 행(`PLAN_SCOPE_SQL`), 항목은 그 플랜의 항목
// (`PLAN_ITEM_SCOPE_SQL`). 다른 사람·숨긴 플랜은 404다. 플랜 행의 `user_id`는 계속 "만든 사람"이고 항목은 플랜을 따른다.
// POST·PATCH·항목 쓰기의 시각은 서버 시각, import는 넘어온 시각을 그대로 쓴다.
import {
  parseItemRequest,
  parsePlanCreateRequest,
  parsePlanImportRequest,
  parsePlanPatchRequest,
} from "./parseInteriorPlanRequests";
import {
  INTERIOR_ITEM_MAX_COUNT,
  INTERIOR_PLAN_MAX_COUNT,
} from "../../src/lib/constants/interiorPlan";
import { createRandomId } from "../../src/lib/utils/createRandomId";
import { isInteriorId, isInteriorPlanId } from "../../src/lib/utils/validateInteriorPlan";
import { PLAN_ITEM_SCOPE_SQL, PLAN_SCOPE_SQL } from "../household/householdScope";
import { readJsonBody } from "../http/readJsonBody";
import { errorResponse, jsonResponse, noContentResponse } from "../http/response";

import type {
  CreateInteriorPlanResponse,
  ImportInteriorPlanResponse,
  InteriorItem,
  InteriorItemInput,
  InteriorItemResponse,
  InteriorPlan,
  InteriorPlanInput,
  InteriorPlanListResponse,
  InteriorPlanResponse,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";

/** 플랜·항목 쓰기 본문 한도. 항목 최악 ~7KB(짝 없는 서로게이트 2배 ~14KB), 플랜 + 가져올 항목 30개도 이 안이다 */
const WRITE_MAX_BYTES = 16 * 1024;
/**
 * 플랜 PATCH 본문 한도(ADR-036 D2 A). `lineOrder` 최악은 줄 key 129자(64자 id 두 개 + `:`) → JSON 원소 132바이트 × 500개
 * ≈ 66KB이고, 함께 보낼 수 있는 다른 키(공간 30개 등 수 KB) 여유를 더해 128KB. key는 ASCII뿐이라 이스케이프로 부풀지 않는다.
 * 항목 쓰기·계획 POST는 `WRITE_MAX_BYTES` 그대로다
 */
const PLAN_PATCH_MAX_BYTES = 128 * 1024;
/** import는 플랜 1개씩. 본문을 통째로 바인딩하므로 D1 바인딩 한도(2MB) 안 */
const IMPORT_MAX_BYTES = 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

type PlanRow = {
  user_id: string;
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
};
type ItemRow = {
  plan_user_id: string;
  plan_id: string;
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
};

const toPlan = (row: PlanRow): InteriorPlan => ({
  id: row.id,
  ...(JSON.parse(row.data) as InteriorPlanInput),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toItem = (row: Omit<ItemRow, "plan_user_id" | "plan_id">): InteriorItem => ({
  id: row.id,
  ...(JSON.parse(row.data) as InteriorItemInput),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const invalidParams = (message: string) => errorResponse(400, "invalidParams", message);
const invalidPlanId = () => invalidParams("인테리어 계획 id 형식이 올바르지 않습니다");
const invalidItemId = () => invalidParams("항목 id 형식이 올바르지 않습니다");
const planLimitExceeded = () =>
  invalidParams(`인테리어 계획은 ${INTERIOR_PLAN_MAX_COUNT}개까지 만들 수 있습니다`);
const itemLimitExceeded = () =>
  invalidParams(`계획 하나에 항목은 ${INTERIOR_ITEM_MAX_COUNT}개까지 넣을 수 있습니다`);
const planNotFound = () =>
  errorResponse(404, "notFound", "없거나 다른 기기에서 삭제된 인테리어 계획입니다");
const itemNotFound = () => errorResponse(404, "notFound", "없거나 다른 기기에서 삭제된 항목입니다");

/**
 * 항목 넣기 가드(ADR-029 조건 1). 같은 batch에서 바로 앞 문장(플랜 INSERT)이 1행을 넣었을 때만 참이다.
 * `changes()`는 직전에 끝난 INSERT·UPDATE·DELETE의 행 수이고, 지금 도는 INSERT … SELECT 동안에는 바뀌지 않는다
 * (SQLite는 문장이 끝날 때 값을 갱신한다). D1 batch는 한 연결·한 트랜잭션에서 문장을 순서대로 돌린다(하네스로 확인).
 * 그래서 import 재시도(플랜이 이미 있어 0행)에 사용자가 지운 항목이 되살아나지 않고, POST가 상한으로 플랜을 못 넣으면
 * 항목도 0행이다. 이 가드를 쓰는 문장은 반드시 플랜 INSERT 바로 뒤에 둔다.
 */
const AFTER_PLAN_INSERTED_SQL = "changes() = 1";

/**
 * GET /api/interior-plans. 플랜·항목 두 쿼리를 한 batch(한 스냅샷)로 읽어, 그 사이 지운 플랜의 항목이 섞이지 않는다.
 * 순서는 둘 다 `ORDER BY created_at, id`(시각은 `toISOString` 고정 형식이라 문자열 비교가 시각 비교다).
 */
export async function listInteriorPlans(db: D1Database, userId: string): Promise<Response> {
  const [planResult, itemResult] = await db.batch([
    db
      .prepare(
        `SELECT user_id, id, data, created_at, updated_at FROM interior_plans
         WHERE ${PLAN_SCOPE_SQL}
         ORDER BY created_at, id`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT plan_user_id, plan_id, id, data, created_at, updated_at FROM interior_plan_items
         WHERE ${PLAN_ITEM_SCOPE_SQL}
         ORDER BY created_at, id`,
      )
      .bind(userId),
  ]);
  const planKey = (userIdOfPlan: string, planId: string) => JSON.stringify([userIdOfPlan, planId]);
  const itemsByPlan = new Map<string, InteriorItem[]>();
  for (const row of itemResult.results as ItemRow[]) {
    const key = planKey(row.plan_user_id, row.plan_id);
    itemsByPlan.set(key, [...(itemsByPlan.get(key) ?? []), toItem(row)]);
  }
  const plans: InteriorPlanWithItems[] = (planResult.results as PlanRow[]).map((row) => ({
    ...toPlan(row),
    items: itemsByPlan.get(planKey(row.user_id, row.id)) ?? [],
  }));
  const body: InteriorPlanListResponse = { plans };
  return jsonResponse(200, body, NO_STORE);
}

/**
 * POST /api/interior-plans → 201 `{ plan }`(항목 포함). 플랜·항목 id와 시각은 서버가 만든다.
 * 범위(가구면 구성원 합계)에 이미 3개면 플랜도 항목도 넣지 않고 400. 개수 확인과 넣기는 한 문장이다.
 */
export async function createInteriorPlan(
  request: Request,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  const body = await readJsonBody(request, WRITE_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parsePlanCreateRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const base = now();
  const createdAt = base.toISOString();
  const planId = createRandomId();
  // 같은 시각이면 GET 순서(`created_at, id`)가 무작위 id 순이 되므로, 항목 i는 기준 시각 + i ms로 둬 입력 순서를 지킨다.
  const items: InteriorItem[] = parsed.value.items.map((fields, index) => {
    const itemCreatedAt = new Date(base.getTime() + index).toISOString();
    return { id: createRandomId(), ...fields, createdAt: itemCreatedAt, updatedAt: itemCreatedAt };
  });
  const itemsJson = JSON.stringify(
    items.map((item, index) => ({
      id: item.id,
      data: parsed.value.items[index],
      createdAt: item.createdAt,
    })),
  );
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO interior_plans (user_id, id, data, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?4
         WHERE (SELECT COUNT(*) FROM interior_plans WHERE ${PLAN_SCOPE_SQL}) < ?5`,
      )
      .bind(userId, planId, JSON.stringify(parsed.value.plan), createdAt, INTERIOR_PLAN_MAX_COUNT),
    db
      .prepare(
        `INSERT INTO interior_plan_items (plan_user_id, plan_id, id, data, created_at, updated_at)
         SELECT ?1, ?2, json_extract(value, '$.id'), json_extract(value, '$.data'),
                json_extract(value, '$.createdAt'), json_extract(value, '$.createdAt')
         FROM json_each(?3)
         WHERE ${AFTER_PLAN_INSERTED_SQL}
         ORDER BY key`,
      )
      .bind(userId, planId, itemsJson),
  ]);
  if (inserted.meta.changes === 0) return planLimitExceeded();

  const plan: InteriorPlanWithItems = {
    id: planId,
    ...parsed.value.plan,
    createdAt,
    updatedAt: createdAt,
    items,
  };
  const response: CreateInteriorPlanResponse = { plan };
  return jsonResponse(201, response, NO_STORE);
}

/**
 * 바인딩 ?1 요청자, ?2 플랜 id, ?3 상한. 범위 합계에 "범위에 아직 없는 이 id"를 더하면 상한을 넘는가.
 * `importListings`의 `IMPORT_OVER_LIMIT_SQL`과 같은 식이다(요청이 1개라 새 id 수가 1 − 이미 있음).
 */
const IMPORT_OVER_LIMIT_SQL = `
  (SELECT COUNT(*) FROM interior_plans WHERE ${PLAN_SCOPE_SQL})
  + 1 - EXISTS (SELECT 1 FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?2)
  > ?3`;

/**
 * POST /api/interior-plans/import → 200 `{ imported: 0 | 1 }`. 로그아웃 상태에서 만든 플랜 1개를 id·시각 그대로 옮긴다.
 * batch 한 번: ① 플랜 INSERT(혼자 쓰는 중 · 범위에 같은 id 없음 · 상한 안일 때만) ② 항목 INSERT(①이 1행일 때만)
 * ③ 0행이었던 이유를 같은 트랜잭션에서 읽는다.
 * 판정 순서: 함께 쓰는 중이면 409 `inHousehold`(서버가 최종 판단, ADR-029 조건 5) → 범위에 같은 id가 있으면
 * `imported: 0`(상한에 걸린 상태여도, 재시도 안전) → 상한이면 400.
 */
export async function importInteriorPlan(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, IMPORT_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parsePlanImportRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const { plan, items } = parsed.value;
  const { id: planId, createdAt, updatedAt, ...planFields } = plan;
  const itemsJson = JSON.stringify(
    items.map(({ id, createdAt: itemCreatedAt, updatedAt: itemUpdatedAt, ...data }) => ({
      id,
      data,
      createdAt: itemCreatedAt,
      updatedAt: itemUpdatedAt,
    })),
  );
  // WHERE … : INSERT … SELECT 뒤에 ON CONFLICT를 쓸 때는 WHERE가 있어야 SQLite 구문이 모호하지 않다.
  const [inserted, , check] = await db.batch<{
    isInHousehold: number;
    isPlanInScope: number;
    isOverLimit: number;
  }>([
    db
      .prepare(
        `INSERT INTO interior_plans (user_id, id, data, created_at, updated_at)
         SELECT ?1, ?2, ?4, ?5, ?6
         WHERE (SELECT household_id FROM users WHERE id = ?1) IS NULL
           AND NOT EXISTS (SELECT 1 FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?2)
           AND NOT (${IMPORT_OVER_LIMIT_SQL})
         ON CONFLICT (user_id, id) DO NOTHING`,
      )
      .bind(
        userId,
        planId,
        INTERIOR_PLAN_MAX_COUNT,
        JSON.stringify(planFields),
        createdAt,
        updatedAt,
      ),
    db
      .prepare(
        `INSERT INTO interior_plan_items (plan_user_id, plan_id, id, data, created_at, updated_at)
         SELECT ?1, ?2, json_extract(value, '$.id'), json_extract(value, '$.data'),
                json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
         FROM json_each(?3)
         WHERE ${AFTER_PLAN_INSERTED_SQL}
         ORDER BY key`,
      )
      .bind(userId, planId, itemsJson),
    db
      .prepare(
        `SELECT (SELECT household_id FROM users WHERE id = ?1) IS NOT NULL AS isInHousehold,
                EXISTS (SELECT 1 FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?2) AS isPlanInScope,
                (${IMPORT_OVER_LIMIT_SQL}) AS isOverLimit`,
      )
      .bind(userId, planId, INTERIOR_PLAN_MAX_COUNT),
  ]);
  if (inserted.meta.changes === 0) {
    const reason = check.results[0];
    if (reason?.isInHousehold === 1) {
      return errorResponse(
        409,
        "inHousehold",
        "함께 쓰는 중에는 이 기기의 인테리어 계획을 계정으로 옮기지 않습니다",
      );
    }
    if (reason?.isPlanInScope !== 1 && reason?.isOverLimit === 1) return planLimitExceeded();
  }
  const response: ImportInteriorPlanResponse = { imported: inserted.meta.changes === 1 ? 1 : 0 };
  return jsonResponse(200, response, NO_STORE);
}

/**
 * PATCH /api/interior-plans/{id} `{ plan: { name?, budget?, listingId?, spaces?, lineOrder? } }` → 200 `{ plan }`(항목 없음).
 * merge patch 한 문장이라 다른 기기가 바꾼 다른 필드를 되돌리지 않는다. `spaces`·`lineOrder`는 배열이라 통째로 바뀐다.
 */
export async function updateInteriorPlan(
  request: Request,
  id: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isInteriorPlanId(id)) return invalidPlanId();
  const body = await readJsonBody(request, PLAN_PATCH_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parsePlanPatchRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const row = await db
    .prepare(
      `UPDATE interior_plans
       SET data = json_patch(data, ?3),
           updated_at = ?4
       WHERE ${PLAN_SCOPE_SQL} AND id = ?2
       RETURNING user_id, id, data, created_at, updated_at`,
    )
    .bind(userId, id, JSON.stringify(parsed.value), now().toISOString())
    .first<PlanRow>();
  if (row === null) return planNotFound();
  const response: InteriorPlanResponse = { plan: toPlan(row) };
  return jsonResponse(200, response, NO_STORE);
}

/** DELETE /api/interior-plans/{id} → 204, 없으면 404. 항목은 FK `ON DELETE CASCADE`로 같이 지워진다 */
export async function deleteInteriorPlan(
  id: string,
  db: D1Database,
  userId: string,
): Promise<Response> {
  if (!isInteriorPlanId(id)) return invalidPlanId();
  const deleted = await db
    .prepare(`DELETE FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?2`)
    .bind(userId, id)
    .run();
  return deleted.meta.changes === 0 ? planNotFound() : noContentResponse();
}

const itemResponse = (status: number, item: InteriorItem) => {
  const body: InteriorItemResponse = { item };
  return jsonResponse(status, body, NO_STORE);
};

/**
 * POST /api/interior-plans/{id}/items `{ item }` → 201 `{ item }`. id·시각은 서버가 만든다. 항목은 플랜을 만든 사람의
 * 행(`plan_user_id`)으로 들어간다. 플랜 범위·개수 확인과 넣기는 한 문장이고, 0행이면 같은 batch의 두 번째 문장이 읽은
 * 플랜 존재로 404(플랜 없음)와 400(100개)을 가른다.
 */
export async function createInteriorItem(
  request: Request,
  planId: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isInteriorPlanId(planId)) return invalidPlanId();
  const body = await readJsonBody(request, WRITE_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseItemRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const createdAt = now().toISOString();
  const item: InteriorItem = {
    id: createRandomId(),
    ...parsed.value,
    createdAt,
    updatedAt: createdAt,
  };
  const [inserted, check] = await db.batch<{ isPlanInScope: number }>([
    db
      .prepare(
        `INSERT INTO interior_plan_items (plan_user_id, plan_id, id, data, created_at, updated_at)
         SELECT user_id, id, ?3, ?4, ?5, ?5 FROM interior_plans
         WHERE ${PLAN_SCOPE_SQL} AND id = ?2
           AND (SELECT COUNT(*) FROM interior_plan_items
                 WHERE ${PLAN_ITEM_SCOPE_SQL} AND plan_id = ?2) < ?6`,
      )
      .bind(
        userId,
        planId,
        item.id,
        JSON.stringify(parsed.value),
        createdAt,
        INTERIOR_ITEM_MAX_COUNT,
      ),
    db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?2)
           AS isPlanInScope`,
      )
      .bind(userId, planId),
  ]);
  if (inserted.meta.changes === 0) {
    return check.results[0]?.isPlanInScope === 1 ? itemLimitExceeded() : planNotFound();
  }
  return itemResponse(201, item);
}

/**
 * PUT /api/interior-plans/{id}/items/{itemId} `{ item }` → 200 `{ item }`. 항목 전체를 바꾼다(항목 단위 마지막 저장 우선).
 * 한 문장 UPDATE라 다른 항목에는 영향이 없다.
 */
export async function replaceInteriorItem(
  request: Request,
  planId: string,
  itemId: string,
  db: D1Database,
  userId: string,
  now: () => Date,
): Promise<Response> {
  if (!isInteriorPlanId(planId)) return invalidPlanId();
  if (!isInteriorId(itemId)) return invalidItemId();
  const body = await readJsonBody(request, WRITE_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = parseItemRequest(body.value);
  if (!parsed.ok) return invalidParams(parsed.message);

  const row = await db
    .prepare(
      `UPDATE interior_plan_items
       SET data = ?4,
           updated_at = ?5
       WHERE ${PLAN_ITEM_SCOPE_SQL} AND plan_id = ?2 AND id = ?3
       RETURNING id, data, created_at, updated_at`,
    )
    .bind(userId, planId, itemId, JSON.stringify(parsed.value), now().toISOString())
    .first<Omit<ItemRow, "plan_user_id" | "plan_id">>();
  return row === null ? itemNotFound() : itemResponse(200, toItem(row));
}

/** DELETE /api/interior-plans/{id}/items/{itemId} → 204, 없으면 404 */
export async function deleteInteriorItem(
  planId: string,
  itemId: string,
  db: D1Database,
  userId: string,
): Promise<Response> {
  if (!isInteriorPlanId(planId)) return invalidPlanId();
  if (!isInteriorId(itemId)) return invalidItemId();
  const deleted = await db
    .prepare(
      `DELETE FROM interior_plan_items
       WHERE ${PLAN_ITEM_SCOPE_SQL} AND plan_id = ?2 AND id = ?3`,
    )
    .bind(userId, planId, itemId)
    .run();
  return deleted.meta.changes === 0 ? itemNotFound() : noContentResponse();
}
