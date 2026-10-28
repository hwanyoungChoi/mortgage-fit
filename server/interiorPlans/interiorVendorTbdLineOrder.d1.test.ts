// 스펙 interior-vendor-tbd-line-order AC-0(b)(e), ADR-036 조건 2·3: 업체 미정 견적(`vendor` 키 없음)과 플랜 줄 순서
// `lineOrder`를 Worker 진입점(실제 마이그레이션 + D1)으로 본다.
// - 업체 없는 견적은 항목 POST·PUT·계획 POST·`/import` 모두 그대로 저장하고, `vendor: ""`·null은 모든 경로가 400이다.
// - PATCH `lineOrder`는 `json_patch`로 통째로 바뀌고, null과 `[]`는 같은 키 삭제다. 다른 키 PATCH는 `lineOrder`를 건드리지 않는다.
// - PATCH 본문 한도는 128KB(항목 쓰기·계획 POST는 16KB 그대로). 계획 POST는 `lineOrder`를 버리고 `/import`는 보존한다.
// 저장 키는 응답이 아니라 `SELECT data` 원문으로 본다(키가 null이 아니라 아예 없어야 한다).
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  createUser,
  insertHousehold,
  migrate,
  snapshotPlans,
} from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlan,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const time = (minute: number) => `2026-10-28T00:${String(minute).padStart(2, "0")}:00.000Z`;

const SPACES = [{ id: "sp-whole", name: "전체" }];

/** 업체 있는 견적 1개 줄 */
const namedLine = (index: number, trade: string, vendor: string): InteriorItemInput => ({
  spaceId: "sp-whole",
  trade,
  quotes: [{ id: `rq${index}`, vendor, amount: 100 * index }],
  status: "planned",
});

/** R8: 조명 · 업체 키 없음 · 거실 간접등 · 300,000원 · 확정 */
const R8: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "조명",
  quotes: [{ id: "rq8", amountWon: 300_000, memo: "거실 간접등" }],
  confirmedQuoteId: "rq8",
  status: "planned",
};

/** R9: 철거 · 견적 { id }만(업체·금액·세부내용 없음) · 미확정 */
const R9: InteriorItemInput = {
  spaceId: "sp-whole",
  trade: "철거",
  quotes: [{ id: "rq9" }],
  status: "planned",
};

const LINES: [string, InteriorItemInput][] = [
  ["r1", namedLine(1, "도배", "육문수")],
  ["r2", namedLine(2, "도배", "동네도배")],
  ["r8", R8],
  ["r9", R9],
];

const V_ORDER = ["r2:rq2", "r1:rq1", "r9:rq9", "r8:rq8"];

/** 로그아웃 상태에서 만든 계획(업체 미정 견적 + lineOrder). id·시각 그대로 옮긴다 */
const planV = (overrides: Partial<InteriorPlanWithItems> = {}): InteriorPlanWithItems => ({
  id: "plan-v",
  name: "우리 집",
  budget: 1000,
  spaces: SPACES,
  lineOrder: V_ORDER,
  createdAt: time(0),
  updatedAt: time(0),
  items: LINES.map(([id, fields], index) => ({
    id,
    ...fields,
    createdAt: time(index + 1),
    updatedAt: time(index + 1),
  })),
  ...overrides,
});

const fieldsOf = ({ id, createdAt, updatedAt, ...fields }: InteriorItem): InteriorItemInput => {
  void [id, createdAt, updatedAt];
  return fields;
};

/** 본문 JSON이 정확히 `bytes`바이트가 되도록 맨 바깥에 `pad`를 붙인다(파서는 봉투 밖 키를 읽지 않는다) */
function padBodyTo(body: Record<string, unknown>, bytes: number): Record<string, unknown> {
  const base = new TextEncoder().encode(JSON.stringify({ ...body, pad: "" })).byteLength;
  return { ...body, pad: "x".repeat(bytes - base) };
}

const byteLength = (body: unknown) => new TextEncoder().encode(JSON.stringify(body)).byteLength;

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

const patchPlan = (user: TestUser, planId: string, plan: unknown) =>
  callApi(db, "PATCH", `/api/interior-plans/${planId}`, { cookie: user.cookie, body: { plan } });

const patchBody = (user: TestUser, planId: string, body: unknown) =>
  callApi(db, "PATCH", `/api/interior-plans/${planId}`, { cookie: user.cookie, body });

/** `interior_plans.data` 원문 */
const readPlanData = async (userId: string, id: string) => {
  const row = await db
    .prepare("SELECT data FROM interior_plans WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<{ data: string }>();
  return row === null ? null : (JSON.parse(row.data) as Record<string, unknown>);
};

/** `interior_plan_items.data` 원문 */
const readItemData = async (planId: string, id: string) => {
  const row = await db
    .prepare("SELECT data FROM interior_plan_items WHERE plan_id = ? AND id = ?")
    .bind(planId, id)
    .first<{ data: string }>();
  return row === null ? null : (JSON.parse(row.data) as InteriorItemInput);
};

const ITEM_INVALID = {
  error: "invalidParams",
  message: "요청 본문은 { item } 객체이고 항목 값이 올바라야 합니다",
};
const PLAN_INVALID = {
  error: "invalidParams",
  message: "요청 본문은 { plan } 객체이고 플랜 값이 올바라야 합니다",
};
const LINE_ORDER_INVALID = {
  error: "invalidParams",
  message: "lineOrder는 줄 key 배열(최대 500개)이거나 null이어야 합니다",
};

let alice: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
});

describe("업체 미정 견적: 모든 쓰기 경로가 vendor 키 없이 그대로 저장한다", () => {
  it("/import(업체 미정 견적 + lineOrder) → 200 imported 1, GET이 보낸 계획과 같고 lineOrder를 보존한다", async () => {
    const response = await importPlan(alice, planV());
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1 });
    expect(await getPlans(alice)).toStrictEqual([planV()]);
    expect(await readPlanData("alice", "plan-v")).toStrictEqual({
      name: "우리 집",
      budget: 1000,
      spaces: SPACES,
      lineOrder: V_ORDER,
    });
    const r8 = await readItemData("plan-v", "r8");
    expect(r8).toStrictEqual(R8);
    expect(Object.hasOwn(r8!.quotes![0], "vendor")).toBe(false);
    expect((await readItemData("plan-v", "r9"))?.quotes).toStrictEqual([{ id: "rq9" }]);
  });

  it("계획 POST(items에 업체 미정 견적) → 201, 응답·GET이 보낸 항목과 같다", async () => {
    const response = await createPlan(alice, { name: "우리 집", spaces: SPACES, items: [R8, R9] });
    expect(response.status).toBe(201);
    const { plan } = (await response.json()) as { plan: InteriorPlanWithItems };
    expect(plan.items.map(fieldsOf)).toStrictEqual([R8, R9]);
    expect(await getPlans(alice)).toStrictEqual([plan]);
  });

  it("항목 POST(R8·R9) 201 → 업체 채우기 PUT 200 → 다시 비우기 PUT 200, GET·SELECT data가 매번 보낸 값과 같다", async () => {
    expect((await importPlan(alice, planV({ items: [] }))).status).toBe(200);
    const ids: string[] = [];
    for (const line of [R8, R9]) {
      const posted = await postItem(alice, "plan-v", line);
      expect(posted.status).toBe(201);
      const { item } = (await posted.json()) as { item: InteriorItem };
      expect(fieldsOf(item)).toStrictEqual(line);
      ids.push(item.id);
    }
    expect((await getPlans(alice))[0].items.map(fieldsOf)).toStrictEqual([R8, R9]);

    const filled: InteriorItemInput = {
      ...R8,
      quotes: [{ id: "rq8", vendor: "빛나라조명", amountWon: 300_000, memo: "거실 간접등" }],
    };
    const put = await putItem(alice, "plan-v", ids[0], filled);
    expect(put.status).toBe(200);
    expect(fieldsOf(((await put.json()) as { item: InteriorItem }).item)).toStrictEqual(filled);
    expect(await readItemData("plan-v", ids[0])).toStrictEqual(filled);

    const cleared = await putItem(alice, "plan-v", ids[0], R8);
    expect(cleared.status).toBe(200);
    expect(await readItemData("plan-v", ids[0])).toStrictEqual(R8);
    expect((await getPlans(alice))[0].items.map(fieldsOf)).toStrictEqual([R8, R9]);
  });

  for (const [label, vendor] of [
    ['""', ""],
    ["공백", "   "],
    ["null", null],
    ["31자", "가".repeat(31)],
  ] as const) {
    it(`vendor ${label} → 항목 POST·PUT·계획 POST·/import 모두 400, 행 무변경`, async () => {
      expect((await importPlan(alice, planV())).status).toBe(200);
      const before = await snapshotPlans(db);
      const bad = { ...R9, quotes: [{ id: "rq9", vendor }] };
      const results = [
        [await postItem(alice, "plan-v", bad), ITEM_INVALID],
        [await putItem(alice, "plan-v", "r9", bad), ITEM_INVALID],
        [
          await createPlan(alice, { name: "우리 집", spaces: SPACES, items: [bad] }),
          {
            error: "invalidParams",
            message: "1번째 항목의 값이 올바르지 않습니다",
          },
        ],
        [
          await importPlan(alice, {
            ...planV({ id: "plan-w" }),
            items: [{ ...planV().items[3], ...bad }],
          }),
          { error: "invalidParams", message: "1번째 항목의 값이 올바르지 않습니다" },
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

describe("PATCH lineOrder: 통째로 바뀌고, 다른 키 PATCH는 건드리지 않는다", () => {
  beforeEach(async () => {
    expect((await importPlan(alice, planV({ lineOrder: undefined }))).status).toBe(200);
  });

  it("lineOrder만 보내도 200, 응답·GET·SELECT data가 보낸 배열과 같다(항목은 그대로)", async () => {
    const response = await patchPlan(alice, "plan-v", { lineOrder: V_ORDER });
    expect(response.status).toBe(200);
    const { plan } = (await response.json()) as { plan: InteriorPlan };
    expect(plan.lineOrder).toStrictEqual(V_ORDER);
    expect(Object.hasOwn(plan, "items")).toBe(false);
    const [got] = await getPlans(alice);
    expect(got.lineOrder).toStrictEqual(V_ORDER);
    expect(got.items).toStrictEqual(planV().items);
    expect((await readPlanData("alice", "plan-v"))?.lineOrder).toStrictEqual(V_ORDER);

    const moved = ["r1:rq1", "r2:rq2", "r8:", "r9:rq9"];
    expect((await patchPlan(alice, "plan-v", { lineOrder: moved })).status).toBe(200);
    expect((await readPlanData("alice", "plan-v"))?.lineOrder).toStrictEqual(moved);
  });

  for (const [label, patch] of [
    ["이름", { name: "새 이름" }],
    ["예산", { budgetWon: 12_000_000 }],
    ["예산 지움", { budget: null }],
    ["매물 연결", { listingId: "listing-1" }],
    ["공간", { spaces: [{ id: "sp-whole", name: "집 전체" }] }],
  ] as const) {
    it(`${label} PATCH 뒤에도 lineOrder 그대로`, async () => {
      expect((await patchPlan(alice, "plan-v", { lineOrder: V_ORDER })).status).toBe(200);
      const response = await patchPlan(alice, "plan-v", patch);
      expect(response.status).toBe(200);
      expect(((await response.json()) as { plan: InteriorPlan }).plan.lineOrder).toStrictEqual(
        V_ORDER,
      );
      expect((await readPlanData("alice", "plan-v"))?.lineOrder).toStrictEqual(V_ORDER);
    });
  }

  it("이름과 lineOrder를 함께 보내면 둘 다 바뀐다", async () => {
    expect((await patchPlan(alice, "plan-v", { name: "새 이름", lineOrder: V_ORDER })).status).toBe(
      200,
    );
    expect(await readPlanData("alice", "plan-v")).toStrictEqual({
      name: "새 이름",
      budget: 1000,
      spaces: SPACES,
      lineOrder: V_ORDER,
    });
  });

  for (const [label, lineOrder] of [
    ["null", null],
    ["[]", []],
  ] as const) {
    it(`lineOrder: ${label} → 200, SELECT data에 lineOrder 키가 아예 없다(400 아님)`, async () => {
      expect((await patchPlan(alice, "plan-v", { lineOrder: V_ORDER })).status).toBe(200);
      const response = await patchPlan(alice, "plan-v", { lineOrder });
      expect(response.status).toBe(200);
      const { plan } = (await response.json()) as { plan: InteriorPlan };
      expect(Object.hasOwn(plan, "lineOrder")).toBe(false);
      const data = await readPlanData("alice", "plan-v");
      expect(data).toStrictEqual({ name: "우리 집", budget: 1000, spaces: SPACES });
      expect(Object.hasOwn(data!, "lineOrder")).toBe(false);
      expect(Object.hasOwn((await getPlans(alice))[0], "lineOrder")).toBe(false);
    });
  }

  for (const [label, lineOrder] of [
    ["문자열(배열 아님)", "r1:rq1"],
    ["객체", { 0: "r1:rq1" }],
    ["숫자", 1],
    ['"a"', ["a"]],
    ['"a:b:c"', ["a:b:c"]],
    ['":q"', [":q"]],
    ["65자 id", [`${"a".repeat(65)}:q1`]],
    ["숫자 원소", ["r1:rq1", 1]],
    ["중복", ["r1:rq1", "r2:rq2", "r1:rq1"]],
    ["501개", Array.from({ length: 501 }, (_, i) => `r${i}:q`)],
  ] as const) {
    it(`거부 ${label} → 400(문구 고정), 행 무변경`, async () => {
      expect((await patchPlan(alice, "plan-v", { lineOrder: V_ORDER })).status).toBe(200);
      const before = await snapshotPlans(db);
      const response = await patchPlan(alice, "plan-v", { name: "새 이름", lineOrder });
      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual(LINE_ORDER_INVALID);
      expect(await snapshotPlans(db)).toStrictEqual(before);
    });
  }

  it("알려진 키가 하나도 없으면 400이고 문구의 키 목록에 lineOrder가 있다", async () => {
    const response = await patchPlan(alice, "plan-v", { order: V_ORDER });
    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "invalidParams",
      message:
        "요청 본문은 { plan } 객체이고 name, budget, budgetWon, listingId, spaces, lineOrder 중 하나 이상이 있어야 합니다",
    });
  });
});

describe("본문 크기: PATCH만 128KB, 항목 쓰기·계획 POST는 16KB 그대로 (ADR-036 D2 A)", () => {
  const ID_A = "a".repeat(60);
  const ID_B = "b".repeat(60);
  /** 64자 id 두 개로 만든 서로 다른 key 500개(key 129자) */
  const worstOrder = Array.from(
    { length: 500 },
    (_, i) => `${ID_A}${String(i).padStart(4, "0")}:${ID_B}${String(i).padStart(4, "0")}`,
  );

  beforeEach(async () => {
    expect((await importPlan(alice, planV({ lineOrder: undefined }))).status).toBe(200);
  });

  it("최악 key 500개(16KB 초과) PATCH → 200, GET이 입력과 같다", async () => {
    expect(worstOrder.every((key) => key.length === 129)).toBe(true);
    expect(new Set(worstOrder).size).toBe(500);
    expect(byteLength({ plan: { lineOrder: worstOrder } })).toBeGreaterThan(16 * 1024);

    const response = await patchPlan(alice, "plan-v", { lineOrder: worstOrder });
    expect(response.status).toBe(200);
    expect((await getPlans(alice))[0].lineOrder).toStrictEqual(worstOrder);
    expect((await readPlanData("alice", "plan-v"))?.lineOrder).toStrictEqual(worstOrder);
  });

  it("본문 정확히 128KB(131,072바이트) → 200, +1바이트 → 413 payloadTooLarge이고 행이 안 바뀐다(이름·예산 함께)", async () => {
    const body = { plan: { name: "새 이름", budgetWon: 12_000_000, lineOrder: worstOrder } };
    const exact = await patchBody(alice, "plan-v", padBodyTo(body, 128 * 1024));
    expect(exact.status).toBe(200);
    expect(await readPlanData("alice", "plan-v")).toStrictEqual({
      name: "새 이름",
      budgetWon: 12_000_000,
      spaces: SPACES,
      lineOrder: worstOrder,
    });

    const before = await snapshotPlans(db);
    const over = await patchBody(
      alice,
      "plan-v",
      padBodyTo({ plan: { name: "다른 이름", lineOrder: null } }, 128 * 1024 + 1),
    );
    expect(over.status).toBe(413);
    expect(await over.json()).toStrictEqual({
      error: "payloadTooLarge",
      message: "요청 본문은 128KB 이하여야 합니다",
    });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("항목 PUT은 16KB 200, 16KB+1 413이고 행이 안 바뀐다", async () => {
    const path = "/api/interior-plans/plan-v/items/r9";
    const exact = await callApi(db, "PUT", path, {
      cookie: alice.cookie,
      body: padBodyTo({ item: R9 }, 16 * 1024),
    });
    expect(exact.status).toBe(200);
    const before = await snapshotPlans(db);
    const over = await callApi(db, "PUT", path, {
      cookie: alice.cookie,
      body: padBodyTo({ item: R8 }, 16 * 1024 + 1),
    });
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ error: "payloadTooLarge" });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("계획 POST는 16KB 201, 16KB+1 413이고 넣지 않는다", async () => {
    const body = { plan: { name: "새 계획", spaces: SPACES } };
    const exact = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024),
    });
    expect(exact.status).toBe(201);
    const before = await snapshotPlans(db);
    const over = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024 + 1),
    });
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ error: "payloadTooLarge" });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });
});

describe("계획 POST는 lineOrder를 버린다(항목 id를 서버가 만든다, ADR-036 조건 3)", () => {
  for (const [label, lineOrder] of [
    ["올바른 배열", ["r1:rq1", "r2:"]],
    ["틀린 값", ["a:b:c"]],
  ] as const) {
    it(`${label} → 201, 응답·GET·SELECT data에 lineOrder 키가 없다`, async () => {
      const response = await createPlan(alice, {
        name: "우리 집",
        spaces: SPACES,
        lineOrder,
        items: [R8],
      });
      expect(response.status).toBe(201);
      const { plan } = (await response.json()) as { plan: InteriorPlanWithItems };
      expect(Object.hasOwn(plan, "lineOrder")).toBe(false);
      expect(Object.hasOwn((await getPlans(alice))[0], "lineOrder")).toBe(false);
      expect(await readPlanData("alice", plan.id)).toStrictEqual({
        name: "우리 집",
        spaces: SPACES,
      });
    });
  }

  it("/import는 lineOrder가 틀리면 400이고 넣지 않는다(보존하는 경로라 검증한다)", async () => {
    const response = await importPlan(alice, planV({ lineOrder: ["r1:rq1", "r1:rq1"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual(PLAN_INVALID);
    expect(await snapshotPlans(db)).toStrictEqual({ plans: [], items: [] });
  });
});

describe("가구 모드: 구성원 누구의 순서 저장도 둘 다 같은 값으로 본다 (AC-0(e))", () => {
  it("ha 계획에 hb가 업체 미정 줄 POST·lineOrder PATCH, ha 이름 PATCH 뒤에도 둘 다 같은 lineOrder", async () => {
    await insertHousehold(db, "h1");
    const ha = await createUser(db, "ha", { householdId: "h1" });
    const hb = await createUser(db, "hb", { householdId: "h1" });

    const created = await createPlan(ha, { name: "우리 집", spaces: SPACES, items: [R9] });
    expect(created.status).toBe(201);
    const { plan } = (await created.json()) as { plan: InteriorPlanWithItems };

    const posted = await postItem(hb, plan.id, R8);
    expect(posted.status).toBe(201);
    const r8Id = ((await posted.json()) as { item: InteriorItem }).item.id;
    const lineOrder = [`${r8Id}:rq8`, `${plan.items[0].id}:rq9`];

    expect((await patchPlan(hb, plan.id, { lineOrder })).status).toBe(200);
    expect((await patchPlan(ha, plan.id, { name: "새 이름" })).status).toBe(200);
    for (const user of [ha, hb]) {
      const [got] = await getPlans(user);
      expect(got.name).toBe("새 이름");
      expect(got.lineOrder).toStrictEqual(lineOrder);
      expect(got.items.map(fieldsOf)).toStrictEqual([R9, R8]);
    }
    expect((await readPlanData("ha", plan.id))?.lineOrder).toStrictEqual(lineOrder);

    expect((await patchPlan(ha, plan.id, { lineOrder: [] })).status).toBe(200);
    for (const user of [ha, hb]) {
      expect(Object.hasOwn((await getPlans(user))[0], "lineOrder")).toBe(false);
    }
  });
});
