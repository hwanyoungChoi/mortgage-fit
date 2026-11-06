// 스펙 interior-budget-exclude AC-2(D1 하네스), ADR-038: 항목 `isOffBudget?: true`를 Worker 진입점(실제 마이그레이션 + D1)으로 본다.
// - 항목 POST·PUT·계획 POST·`/import`로 `true`를 넣으면 GET이 그대로 돌려준다.
// - `false`로 PUT하면 저장 원문(`SELECT data`)에 키가 아예 없다. `null`·`"true"`·`1`은 모든 경로가 400이고 행이 바뀌지 않는다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callApi, clearTables, createUser, migrate, snapshotPlans } from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-11-06T00:${String(minute).padStart(2, "0")}:00.000Z`;

const SPACES = [{ id: "sp-whole", name: "전체" }];

/** R5: 욕실 · 하루바스 · 타일 덧방 (2) · 2,500,000원 · 확정 · 완료 · 예산 외 */
const R5_OFF: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "욕실",
  quotes: [{ id: "rq5", vendor: "하루바스", amountWon: 2_500_000, memo: "타일 덧방 (2)" }],
  confirmedQuoteId: "rq5",
  status: "done",
  isOffBudget: true,
};

/** R5에서 예산 외만 뺀 것(반영) */
const { isOffBudget: _onBudget, ...R5_ON } = R5_OFF;
void _onBudget;

/** 로그아웃 상태에서 만든 계획(예산 외 줄 하나). id·시각 그대로 옮긴다 */
const planE = (): InteriorPlanWithItems => ({
  id: "plan-e",
  name: "우리 집",
  budgetWon: 10_000_000,
  spaces: SPACES,
  createdAt: time(0),
  updatedAt: time(0),
  items: [{ id: "r5", ...R5_OFF, createdAt: time(5), updatedAt: time(5) }],
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

async function getPlans(user: TestUser) {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plans: InteriorPlanWithItems[] }).plans;
}

const importPlan = (user: TestUser, plan: unknown) =>
  callApi(db, "POST", "/api/interior-plans/import", { cookie: user.cookie, body: { plan } });

const createPlan = (user: TestUser, plan: unknown) =>
  callApi(db, "POST", "/api/interior-plans", { cookie: user.cookie, body: { plan } });

const postItem = (user: TestUser, planId: string, item: unknown) =>
  callApi(db, "POST", `/api/interior-plans/${planId}/items`, {
    cookie: user.cookie,
    body: { item },
  });

const putItem = (user: TestUser, planId: string, itemId: string, item: unknown) =>
  callApi(db, "PUT", `/api/interior-plans/${planId}/items/${itemId}`, {
    cookie: user.cookie,
    body: { item },
  });

/** `interior_plan_items.data` 원문 */
const readItemData = async (planId: string, id: string) => {
  const row = await db
    .prepare("SELECT data FROM interior_plan_items WHERE plan_id = ? AND id = ?")
    .bind(planId, id)
    .first<{ data: string }>();
  return row === null ? null : (JSON.parse(row.data) as Record<string, unknown>);
};

const ITEM_INVALID = {
  error: "invalidParams",
  message: "요청 본문은 { item } 객체이고 항목 값이 올바라야 합니다",
};
const NTH_ITEM_INVALID = {
  error: "invalidParams",
  message: "1번째 항목의 값이 올바르지 않습니다",
};

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("isOffBudget: true는 모든 쓰기 경로에서 보존된다", () => {
  it("/import → GET이 보낸 계획과 같고 SELECT data에 isOffBudget: true", async () => {
    const response = await importPlan(alice, planE());
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1 });
    expect(await getPlans(alice)).toStrictEqual([planE()]);
    expect(await readItemData("plan-e", "r5")).toStrictEqual(R5_OFF);
  });

  it("계획 POST(items에 예산 외 줄) → 201, 응답·GET이 보낸 항목과 같다", async () => {
    const response = await createPlan(alice, { name: "우리 집", spaces: SPACES, items: [R5_OFF] });
    expect(response.status).toBe(201);
    const { plan } = (await response.json()) as { plan: InteriorPlanWithItems };
    expect(plan.items.map(fieldsOf)).toStrictEqual([R5_OFF]);
    expect(await getPlans(alice)).toStrictEqual([plan]);
  });

  it("항목 POST(true) 201 → PUT(false) 200이면 SELECT data에 키가 없다 → PUT(true) 200이면 다시 있다", async () => {
    expect((await importPlan(alice, { ...planE(), items: [] })).status).toBe(200);
    const posted = await postItem(alice, "plan-e", R5_OFF);
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: InteriorItem };
    expect(fieldsOf(item)).toStrictEqual(R5_OFF);
    expect((await getPlans(alice))[0].items.map(fieldsOf)).toStrictEqual([R5_OFF]);

    const off = await putItem(alice, "plan-e", item.id, { ...R5_ON, isOffBudget: false });
    expect(off.status).toBe(200);
    const offItem = ((await off.json()) as { item: InteriorItem }).item;
    expect(Object.hasOwn(offItem, "isOffBudget")).toBe(false);
    const data = await readItemData("plan-e", item.id);
    expect(data).toStrictEqual(R5_ON);
    expect(Object.hasOwn(data!, "isOffBudget")).toBe(false);

    const on = await putItem(alice, "plan-e", item.id, R5_OFF);
    expect(on.status).toBe(200);
    expect(await readItemData("plan-e", item.id)).toStrictEqual(R5_OFF);
    expect((await getPlans(alice))[0].items.map(fieldsOf)).toStrictEqual([R5_OFF]);
  });
});

describe("isOffBudget이 true·false·없음 밖이면 모든 경로가 400이고 행이 안 바뀐다", () => {
  for (const [label, isOffBudget] of [
    ["null", null],
    ['"true"', "true"],
    ["1", 1],
  ] as const) {
    it(`${label} → 항목 POST·PUT·계획 POST·/import 400`, async () => {
      expect((await importPlan(alice, planE())).status).toBe(200);
      const before = await snapshotPlans(db);
      const bad = { ...R5_ON, isOffBudget };
      const results = [
        [await postItem(alice, "plan-e", bad), ITEM_INVALID],
        [await putItem(alice, "plan-e", "r5", bad), ITEM_INVALID],
        [
          await createPlan(alice, { name: "우리 집", spaces: SPACES, items: [bad] }),
          NTH_ITEM_INVALID,
        ],
        [
          await importPlan(alice, {
            ...planE(),
            id: "plan-x",
            items: [{ ...planE().items[0], isOffBudget }],
          }),
          NTH_ITEM_INVALID,
        ],
      ] as const;
      for (const [response, body] of results) {
        expect(response.status).toBe(400);
        expect(await response.json()).toStrictEqual(body);
      }
      expect(await snapshotPlans(db)).toStrictEqual(before);
    });
  }
});
