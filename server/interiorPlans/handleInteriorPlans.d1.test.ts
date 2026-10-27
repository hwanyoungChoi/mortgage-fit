// /api/interior-plans 고정(스펙 interior-planner 태스크 2-3, AC-5 서버·AC-7·AC-8 서버, ADR-029 조건 1~3·5).
// 실제 마이그레이션(0007 포함)을 적용한 D1 + Worker 진입점으로 부른다. 숨긴 플랜·가구는 SQL로 직접 심는다
// (수락·나가기 흐름은 server/household/householdInteriorPlans.d1.test.ts).
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  countRows,
  createUser,
  insertHousehold,
  insertManyItems,
  insertPlan,
  itemInput,
  migrate,
  planInput,
  snapshotPlans,
} from "../test/harness";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-02T00:00:00.000Z";
const T3 = "2026-09-03T00:00:00.000Z";
/** `insertManyItems`·`insertPlan` 기본 시각 */
const SEEDED_AT = "2026-10-01T00:00:00.000Z";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SERVER_ID = /^[0-9a-f]{32}$/;

const quote = (id: string, amount = 280) => ({ id, vendor: "A 업체", amount });
const payment = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  label: "계약금",
  amount: 30,
  isPaid: false,
  ...overrides,
});

/** 저장된 항목(id·시각 포함) */
const storedItem = (
  id: string,
  fields: InteriorItemInput = itemInput(),
  createdAt = T1,
  updatedAt = createdAt,
): InteriorItem => ({ id, ...fields, createdAt, updatedAt });

/** import 본문. 기본은 항목 i1·i2 */
const importBody = (
  id: string,
  items: InteriorItem[] = [storedItem("i1"), storedItem("i2", itemInput({ trade: "타일" }))],
  { createdAt = T1, updatedAt = T2 } = {},
) => ({ plan: { id, ...planInput(), createdAt, updatedAt, items } });

/** UTF-8 바이트 수가 정확히 `bytes`가 되도록 알 수 없는 키 `pad`를 채운다(서버는 읽지 않는 키) */
function padBodyTo(body: Record<string, unknown>, bytes: number): Record<string, unknown> {
  const base = new TextEncoder().encode(JSON.stringify({ ...body, pad: "" })).byteLength;
  return { ...body, pad: "x".repeat(bytes - base) };
}

const json = async <T>(response: Response) => (await response.json()) as T;

const readPlanData = async (userId: string, id: string) => {
  const row = await db
    .prepare("SELECT data FROM interior_plans WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<{ data: string }>();
  return row === null ? null : (JSON.parse(row.data) as unknown);
};

const readItemRow = async (planUserId: string, planId: string, id: string) => {
  const row = await db
    .prepare(
      `SELECT data, created_at, updated_at FROM interior_plan_items
       WHERE plan_user_id = ? AND plan_id = ? AND id = ?`,
    )
    .bind(planUserId, planId, id)
    .first<{ data: string; created_at: string; updated_at: string }>();
  return row === null ? null : { ...row, data: JSON.parse(row.data) as unknown };
};

let alice: TestUser;
let bob: TestUser;

const list = async (user: TestUser) => {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  return (await json<{ plans: InteriorPlanWithItems[] }>(response)).plans;
};

const importPlan = (user: TestUser, body: unknown) =>
  callApi(db, "POST", "/api/interior-plans/import", { cookie: user.cookie, body });

const createPlan = (user: TestUser, plan: Record<string, unknown> = planInput()) =>
  callApi(db, "POST", "/api/interior-plans", { cookie: user.cookie, body: { plan } });

/** 가구 h1(구성원 ha·hb)과 hb의 숨긴 플랜 "p"(항목 hidden-i1)를 SQL로 심는다. ha에도 같은 id "p"(항목 i1) */
async function seedHouseholdWithHiddenPlan(): Promise<{ ha: TestUser; hb: TestUser }> {
  await insertHousehold(db, "h1");
  const ha = await createUser(db, "ha", { householdId: "h1" });
  const hb = await createUser(db, "hb", { householdId: "h1" });
  await insertPlan(db, "ha", "p", planInput({ name: "A 집" }), { createdAt: T1 });
  await insertPlan(db, "hb", "p", planInput({ name: "B 숨긴 집" }), {
    createdAt: T1,
    hiddenHouseholdId: "h1",
  });
  await insertManyItems(db, "ha", "p", 1, "i");
  await insertManyItems(db, "hb", "p", 1, "hidden-i");
  return { ha, hb };
}

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
  bob = await createUser(db, "bob");
});

describe("GET /api/interior-plans", () => {
  it("내 플랜만 created_at, id 순서로, 항목도 created_at, id 순서로 그 플랜에 붙여 돌려준다", async () => {
    await insertPlan(db, "alice", "p-b", planInput({ name: "둘째" }), { createdAt: T1 });
    await insertPlan(db, "alice", "p-a", planInput({ name: "첫째" }), { createdAt: T1 });
    await insertPlan(db, "alice", "p-0", planInput({ name: "셋째" }), { createdAt: T2 });
    // 같은 id의 다른 사람 플랜·항목은 섞이지 않는다
    await insertPlan(db, "bob", "p-a", planInput({ name: "남의 집" }), { createdAt: T1 });
    await insertManyItems(db, "bob", "p-a", 1, "bob-");
    const insertItem = (id: string, createdAt: string) =>
      db
        .prepare(`INSERT INTO interior_plan_items VALUES ('alice', 'p-a', ?1, ?2, ?3, ?3)`)
        .bind(id, JSON.stringify(itemInput({ trade: id })), createdAt)
        .run();
    await insertItem("z", T1);
    await insertItem("y", T2);
    await insertItem("a", T2);

    const response = await callApi(db, "GET", "/api/interior-plans", { cookie: alice.cookie });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const plan = (id: string, name: string, createdAt: string, items: InteriorItem[] = []) => ({
      id,
      ...planInput({ name }),
      createdAt,
      updatedAt: createdAt,
      items,
    });
    expect(await response.json()).toStrictEqual({
      plans: [
        plan("p-a", "첫째", T1, [
          storedItem("z", itemInput({ trade: "z" }), T1),
          storedItem("a", itemInput({ trade: "a" }), T2),
          storedItem("y", itemInput({ trade: "y" }), T2),
        ]),
        plan("p-b", "둘째", T1),
        plan("p-0", "셋째", T2),
      ],
    });
  });

  it("플랜이 없으면 { plans: [] }", async () => {
    expect(await list(alice)).toStrictEqual([]);
  });

  it("가구 구성원은 둘 다 숨긴 플랜(같은 id라도)과 그 항목을 보지 않는다", async () => {
    const { ha, hb } = await seedHouseholdWithHiddenPlan();
    for (const user of [ha, hb]) {
      expect(await list(user)).toStrictEqual([
        {
          id: "p",
          ...planInput({ name: "A 집" }),
          createdAt: T1,
          updatedAt: T1,
          items: [storedItem("i1", itemInput(), SEEDED_AT)],
        },
      ]);
    }
  });

  it("혼자 쓰는 사용자의 행에 다른 가구 id 숨김이 남아 있으면 그 플랜도 빠진다", async () => {
    await insertPlan(db, "alice", "stale", planInput(), { hiddenHouseholdId: "gone" });
    await insertPlan(db, "alice", "ok", planInput());
    expect((await list(alice)).map(({ id }) => id)).toEqual(["ok"]);
  });
});

describe("POST /api/interior-plans", () => {
  it("201 { plan }: 서버 id·시각, 항목 포함, D1에 플랜 1행·항목 n행이고 알 수 없는 키는 어디에도 저장되지 않는다", async () => {
    const response = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: {
        extra: 1,
        plan: {
          ...planInput({ budget: 3000, listingId: "l1" }),
          id: "client-id",
          createdAt: T1,
          extra: "x",
          spaces: [
            { id: "s1", name: "거실", color: "red" },
            { id: "s2", name: "욕실1" },
          ],
          items: [
            {
              ...itemInput({ budget: 300 }),
              id: "client-item",
              extra: true,
              quotes: [{ ...quote("q1"), extra: 1 }],
              confirmedQuoteId: "q1",
              payments: [{ ...payment("pay1"), extra: 1 }],
            },
            itemInput({ trade: "타일", spaceId: "s2" }),
          ],
        },
      },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { plan } = await json<{ plan: InteriorPlanWithItems }>(response);
    expect(plan.id).toMatch(SERVER_ID);
    expect(plan.id).not.toBe("client-id");
    expect(plan.createdAt).toMatch(ISO);
    expect(plan.createdAt).not.toBe(T1);
    expect(plan.updatedAt).toBe(plan.createdAt);
    const firstItem = {
      ...itemInput({ budget: 300 }),
      quotes: [quote("q1")],
      confirmedQuoteId: "q1",
      payments: [payment("pay1")],
    };
    const secondItem = itemInput({ trade: "타일", spaceId: "s2" });
    expect(plan).toStrictEqual({
      id: plan.id,
      ...planInput({ budget: 3000, listingId: "l1" }),
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
      items: [
        {
          id: plan.items[0].id,
          ...firstItem,
          createdAt: plan.items[0].createdAt,
          updatedAt: plan.items[0].createdAt,
        },
        {
          id: plan.items[1].id,
          ...secondItem,
          createdAt: plan.items[1].createdAt,
          updatedAt: plan.items[1].createdAt,
        },
      ],
    });
    expect(plan.items.map(({ id }) => id)).not.toContain("client-item");
    for (const item of plan.items) expect(item.id).toMatch(SERVER_ID);
    expect(new Set(plan.items.map(({ id }) => id)).size).toBe(2);

    expect(await countRows(db, "interior_plans")).toBe(1);
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'alice'")).toBe(2);
    expect(await readPlanData("alice", plan.id)).toStrictEqual(
      planInput({ budget: 3000, listingId: "l1" }),
    );
    expect((await readItemRow("alice", plan.id, plan.items[0].id))?.data).toStrictEqual(firstItem);
    expect((await readItemRow("alice", plan.id, plan.items[1].id))?.data).toStrictEqual(secondItem);
    expect(await list(alice)).toStrictEqual([plan]);
  });

  it("범위에 3개면 400 invalidParams이고 함께 보낸 항목도 0행(개수 확인과 넣기가 한 문장, 항목 가드)", async () => {
    for (const id of ["p1", "p2"]) await insertPlan(db, "alice", id);
    const third = await createPlan(alice, { ...planInput(), items: [itemInput()] });
    expect(third.status).toBe(201);
    const before = await snapshotPlans(db);

    const response = await createPlan(alice, {
      ...planInput(),
      items: [itemInput(), itemInput({ trade: "타일" })],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalidParams" });
    expect(await snapshotPlans(db)).toStrictEqual(before);
    expect(await countRows(db, "interior_plans")).toBe(3);
    expect(await countRows(db, "interior_plan_items")).toBe(1);
  });

  it("다른 사람의 플랜·숨긴 플랜은 내 상한에 세지 않는다", async () => {
    for (const id of ["b1", "b2", "b3"]) await insertPlan(db, "bob", id);
    await insertPlan(db, "alice", "stale1", planInput(), { hiddenHouseholdId: "gone" });
    await insertPlan(db, "alice", "stale2", planInput(), { hiddenHouseholdId: "gone" });
    for (let i = 0; i < 3; i += 1) expect((await createPlan(alice)).status).toBe(201);
    expect((await createPlan(alice)).status).toBe(400);
  });

  it("가구면 구성원의 보이는 플랜 합계로 상한을 본다(숨긴 플랜은 세지 않음)", async () => {
    const { ha, hb } = await seedHouseholdWithHiddenPlan();
    await insertPlan(db, "ha", "p2");
    expect((await createPlan(hb)).status).toBe(201);
    expect((await createPlan(hb)).status).toBe(400);
    expect((await createPlan(ha)).status).toBe(400);
    expect(await countRows(db, "interior_plans WHERE hidden_household_id IS NULL")).toBe(3);
  });

  it("items 30개는 201, 31개는 400이고 아무것도 넣지 않는다", async () => {
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) => itemInput({ trade: `공종${index}` }));
    const ok = await createPlan(alice, { ...planInput(), items: items(30) });
    expect(ok.status).toBe(201);
    expect((await json<{ plan: InteriorPlanWithItems }>(ok)).plan.items).toHaveLength(30);
    await clearTables(db);
    alice = await createUser(db, "alice");

    const over = await createPlan(alice, { ...planInput(), items: items(31) });

    expect(over.status).toBe(400);
    expect(await countRows(db, "interior_plans")).toBe(0);
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });

  for (const [label, plan] of [
    [
      "중복 spaces[].id",
      planInput({
        spaces: [
          { id: "s1", name: "거실" },
          { id: "s1", name: "방1" },
        ],
      }),
    ],
    ["이름 공백만", planInput({ name: "   " })],
    ["이름 41자", planInput({ name: "가".repeat(41) })],
    ["공간 0개", planInput({ spaces: [] })],
    ["예산 0", { ...planInput(), budget: 0 }],
    ["예산 소수", { ...planInput(), budget: 1500.5 }],
    ["예산 1,000,000,000", { ...planInput(), budget: 1_000_000_000 }],
    ["items가 배열이 아님", { ...planInput(), items: {} }],
    [
      "items 안 항목이 틀림(견적 6개)",
      {
        ...planInput(),
        items: [itemInput({ quotes: [1, 2, 3, 4, 5, 6].map((n) => quote(`q${n}`)) })],
      },
    ],
  ] as const) {
    it(`검증 400: ${label}`, async () => {
      const response = await createPlan(alice, plan as Record<string, unknown>);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
      expect(await countRows(db, "interior_plans")).toBe(0);
    });
  }

  it("본문 16KB(16,384바이트)는 받고, 1바이트 넘으면 413이고 넣지 않는다", async () => {
    const body = { plan: planInput() };
    const exact = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024),
    });
    expect(exact.status).toBe(201);
    const over = await callApi(db, "POST", "/api/interior-plans", {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024 + 1),
    });
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ error: "payloadTooLarge" });
    expect(await countRows(db, "interior_plans")).toBe(1);
  });
});

describe("PATCH /api/interior-plans/{id}", () => {
  beforeEach(async () => {
    await insertPlan(db, "alice", "p1", planInput({ budget: 3000, listingId: "l1" }), {
      createdAt: T1,
    });
    await insertManyItems(db, "alice", "p1", 2, "i");
  });

  const patch = (user: TestUser, id: string, plan: unknown) =>
    callApi(db, "PATCH", `/api/interior-plans/${id}`, { cookie: user.cookie, body: { plan } });

  it("200 { plan }(items 없음): 보낸 키만 바꾸고, budget·listingId의 null은 지운다", async () => {
    const response = await patch(alice, "p1", { budget: null, name: " 새 이름 " });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { plan } = await json<{ plan: Record<string, unknown> }>(response);
    expect(plan.updatedAt).toMatch(ISO);
    expect(plan.updatedAt).not.toBe(T1);
    expect(plan).toStrictEqual({
      id: "p1",
      name: "새 이름",
      listingId: "l1",
      spaces: planInput().spaces,
      createdAt: T1,
      updatedAt: plan.updatedAt,
    });
    expect(await readPlanData("alice", "p1")).toStrictEqual({
      name: "새 이름",
      listingId: "l1",
      spaces: planInput().spaces,
    });

    const unlink = await patch(alice, "p1", { listingId: null });
    expect(await json<{ plan: object }>(unlink)).not.toHaveProperty("plan.listingId");
    expect(await readPlanData("alice", "p1")).toStrictEqual({
      name: "새 이름",
      spaces: planInput().spaces,
    });
    // 항목은 그대로
    expect(await countRows(db, "interior_plan_items WHERE plan_id = 'p1'")).toBe(2);
  });

  it("spaces는 통째로 바뀌고 알 수 없는 키(최상위·공간 안)는 저장되지 않는다", async () => {
    const spaces = [{ id: "s9", name: "베란다" }];
    const response = await patch(alice, "p1", {
      spaces: [{ ...spaces[0], color: "red" }],
      extra: 1,
      items: [itemInput()],
    });
    expect(response.status).toBe(200);
    expect(await readPlanData("alice", "p1")).toStrictEqual({
      name: "우리 집",
      budget: 3000,
      listingId: "l1",
      spaces,
    });
    expect(await countRows(db, "interior_plan_items WHERE plan_id = 'p1'")).toBe(2);
  });

  for (const [label, plan] of [
    ["빈 객체", {}],
    ["알 수 없는 키만", { extra: 1 }],
    ["예산 0", { budget: 0 }],
    ["예산 소수", { budget: 12.5 }],
    ["예산 1,000,000,000", { budget: 1_000_000_000 }],
    ["이름 null", { name: null }],
    ["이름 공백만", { name: "  " }],
    ["spaces null", { spaces: null }],
    [
      "중복 spaces[].id",
      {
        spaces: [
          { id: "s1", name: "a" },
          { id: "s1", name: "b" },
        ],
      },
    ],
    ["listingId 형식 오류", { listingId: "a.b" }],
  ] as const) {
    it(`검증 400이고 바뀌지 않는다: ${label}`, async () => {
      const before = await snapshotPlans(db);
      const response = await patch(alice, "p1", plan);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
      expect(await snapshotPlans(db)).toStrictEqual(before);
    });
  }

  it("다른 사람의 플랜·없는 id는 404이고 바뀌지 않는다", async () => {
    const before = await snapshotPlans(db);
    for (const [user, id] of [
      [bob, "p1"],
      [alice, "nope"],
    ] as const) {
      const response = await patch(user, id, { name: "가로채기" });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: "notFound" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("숨긴 플랜은 그 주인이 보내도 404이고 같은 id의 보이는 플랜만 바뀐다", async () => {
    const { hb } = await seedHouseholdWithHiddenPlan();
    const response = await patch(hb, "p", { name: "B가 고침" });
    expect(response.status).toBe(200);
    expect(await readPlanData("ha", "p")).toMatchObject({ name: "B가 고침" });
    expect(await readPlanData("hb", "p")).toMatchObject({ name: "B 숨긴 집" });

    await db.prepare("DELETE FROM interior_plans WHERE user_id = 'ha'").run();
    expect((await patch(hb, "p", { name: "다시" })).status).toBe(404);
    expect(await readPlanData("hb", "p")).toMatchObject({ name: "B 숨긴 집" });
  });

  it("경로 id 형식 오류는 400(본문 검증보다 먼저), 64자는 형식 통과(404), import는 /import 경로라 405 + Allow: POST", async () => {
    for (const id of ["a.b", "x".repeat(65), "%ED%95%9C"]) {
      const response = await patch(alice, id, { name: "x" });
      expect(response.status, id).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
    }
    expect((await patch(alice, "x".repeat(64), { name: "x" })).status).toBe(404);
    const shadowed = await patch(alice, "import", { name: "x" });
    expect([shadowed.status, shadowed.headers.get("Allow")]).toEqual([405, "POST"]);
  });
});

describe("DELETE /api/interior-plans/{id}", () => {
  it("204이고 그 플랜의 항목만 0행(CASCADE), 같은 id의 다른 사람 플랜·다른 플랜 항목은 남는다", async () => {
    await insertPlan(db, "alice", "p1");
    await insertPlan(db, "alice", "p2");
    await insertPlan(db, "bob", "p1");
    await insertManyItems(db, "alice", "p1", 3, "i");
    await insertManyItems(db, "alice", "p2", 2, "i");
    await insertManyItems(db, "bob", "p1", 2, "i");

    const response = await callApi(db, "DELETE", "/api/interior-plans/p1", {
      cookie: alice.cookie,
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(
      await countRows(db, "interior_plan_items WHERE plan_user_id = 'alice' AND plan_id = 'p1'"),
    ).toBe(0);
    expect(
      await countRows(db, "interior_plan_items WHERE plan_user_id = 'alice' AND plan_id = 'p2'"),
    ).toBe(2);
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'bob'")).toBe(2);
    expect(await countRows(db, "interior_plans WHERE user_id = 'bob'")).toBe(1);
    const again = await callApi(db, "DELETE", "/api/interior-plans/p1", { cookie: alice.cookie });
    expect(again.status).toBe(404);
  });

  it("다른 사람의 플랜·숨긴 플랜은 404이고 지우지 않는다, 경로 id 형식 오류는 400", async () => {
    const { hb } = await seedHouseholdWithHiddenPlan();
    await db.prepare("DELETE FROM interior_plans WHERE user_id = 'ha'").run();
    await insertPlan(db, "bob", "pb");
    const before = await snapshotPlans(db);

    expect(
      (await callApi(db, "DELETE", "/api/interior-plans/pb", { cookie: alice.cookie })).status,
    ).toBe(404);
    expect(
      (await callApi(db, "DELETE", "/api/interior-plans/p", { cookie: hb.cookie })).status,
    ).toBe(404);
    expect(
      (await callApi(db, "DELETE", "/api/interior-plans/a.b", { cookie: alice.cookie })).status,
    ).toBe(400);
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });
});

describe("POST /api/interior-plans/{id}/items", () => {
  const postItem = (user: TestUser, planId: string, item: unknown) =>
    callApi(db, "POST", `/api/interior-plans/${planId}/items`, {
      cookie: user.cookie,
      body: { item },
    });

  beforeEach(async () => {
    await insertPlan(db, "alice", "p1");
  });

  it("201 { item }: 서버 id·시각, 알 수 없는 키(항목·견적·지급 안)는 저장되지 않는다", async () => {
    const response = await postItem(alice, "p1", {
      ...itemInput({ budget: 600 }),
      id: "client-id",
      createdAt: T1,
      extra: 1,
      quotes: [{ ...quote("q1"), extra: 1 }],
      payments: [{ ...payment("pay1", { dueDate: "2026-11-01" }), extra: 1 }],
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { item } = await json<{ item: InteriorItem }>(response);
    const fields = {
      ...itemInput({ budget: 600 }),
      quotes: [quote("q1")],
      payments: [payment("pay1", { dueDate: "2026-11-01" })],
    };
    expect(item.id).toMatch(SERVER_ID);
    expect(item.createdAt).toMatch(ISO);
    expect(item).toStrictEqual({
      id: item.id,
      ...fields,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    });
    expect(await readItemRow("alice", "p1", item.id)).toStrictEqual({
      data: fields,
      created_at: item.createdAt,
      updated_at: item.createdAt,
    });
    expect((await list(alice))[0].items).toStrictEqual([item]);
  });

  it("99개면 넣어 100개가 되고, 100개면 400 invalidParams로 넣지 않는다", async () => {
    await insertManyItems(db, "alice", "p1", 99, "x");
    expect((await postItem(alice, "p1", itemInput())).status).toBe(201);
    expect(await countRows(db, "interior_plan_items")).toBe(100);

    const response = await postItem(alice, "p1", itemInput());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalidParams" });
    expect(await countRows(db, "interior_plan_items")).toBe(100);
  });

  it("플랜이 없으면 404(100개 400과 구분), 다른 사람의 플랜도 404이고 넣지 않는다", async () => {
    await insertManyItems(db, "alice", "p1", 100, "x");
    await insertPlan(db, "bob", "pb");
    for (const [user, planId] of [
      [alice, "nope"],
      [alice, "pb"],
      [bob, "p1"],
    ] as const) {
      const response = await postItem(user, planId, itemInput());
      expect(response.status, `${user.id} ${planId}`).toBe(404);
      expect(await response.json()).toMatchObject({ error: "notFound" });
    }
    expect(await countRows(db, "interior_plan_items")).toBe(100);
  });

  it("숨긴 플랜에는 넣지 못하고(404), 숨긴 같은 id 플랜의 항목 수는 보이는 플랜의 상한에 세지 않는다", async () => {
    const { ha, hb } = await seedHouseholdWithHiddenPlan();
    await insertManyItems(db, "hb", "p", 99, "more-");
    const added = await postItem(ha, "p", itemInput());
    expect(added.status).toBe(201);
    const { item } = await json<{ item: InteriorItem }>(added);
    expect(await readItemRow("ha", "p", item.id)).not.toBeNull();
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'hb'")).toBe(100);

    await db.prepare("DELETE FROM interior_plans WHERE user_id = 'ha'").run();
    expect((await postItem(hb, "p", itemInput())).status).toBe(404);
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'hb'")).toBe(100);
  });

  const fiveQuotes = [1, 2, 3, 4, 5].map((n) => quote(`q${n}`));
  for (const [label, item] of [
    ["quotes 6개", itemInput({ quotes: [...fiveQuotes, quote("q6")] })],
    [
      "confirmedQuoteId가 견적에 없음",
      itemInput({ quotes: [quote("q1")], confirmedQuoteId: "q2" }),
    ],
    ["견적 없이 confirmedQuoteId", itemInput({ confirmedQuoteId: "q1" })],
    ["dueDate 2026-13-01", itemInput({ payments: [payment("p1", { dueDate: "2026-13-01" })] })],
    ["dueDate 2026-02-30", itemInput({ payments: [payment("p1", { dueDate: "2026-02-30" })] })],
    ["중복 quotes[].id", itemInput({ quotes: [quote("q1"), quote("q1", 320)] })],
    ["중복 payments[].id", itemInput({ payments: [payment("p1"), payment("p1")] })],
    ["지급 금액 0", itemInput({ payments: [payment("p1", { amount: 0 })] })],
    ["지급 금액 소수", itemInput({ payments: [payment("p1", { amount: 123.5 })] })],
    [
      "지급 금액 1,000,000,000",
      itemInput({ payments: [payment("p1", { amount: 1_000_000_000 })] }),
    ],
    ["견적 금액 -1", itemInput({ quotes: [quote("q1", -1)] })],
    ["지급 6개", itemInput({ payments: [1, 2, 3, 4, 5, 6].map((n) => payment(`p${n}`)) })],
    ["공종 31자", itemInput({ trade: "가".repeat(31) })],
    ["끝 < 시작", itemInput({ startDate: "2026-11-02", endDate: "2026-11-01" })],
    ["알 수 없는 상태", { ...itemInput(), status: "cancelled" }],
    ["예산 소수", itemInput({ budget: 300.5 })],
  ] as const) {
    it(`검증 400이고 넣지 않는다: ${label}`, async () => {
      const response = await postItem(alice, "p1", item);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
      expect(await countRows(db, "interior_plan_items")).toBe(0);
    });
  }

  it("경계 안쪽은 201: 견적 5개, 지급 1·999,999,999, 공종 30자, 시작 = 끝", async () => {
    const item = itemInput({
      trade: "가".repeat(30),
      quotes: fiveQuotes,
      confirmedQuoteId: "q5",
      payments: [payment("p1", { amount: 1 }), payment("p2", { amount: 999_999_999 })],
      startDate: "2026-11-01",
      endDate: "2026-11-01",
    });
    const response = await postItem(alice, "p1", item);
    expect(response.status).toBe(201);
    expect((await json<{ item: InteriorItem }>(response)).item).toMatchObject(item);
  });

  it("봉투 없이 항목만 보내면 400", async () => {
    const response = await callApi(db, "POST", "/api/interior-plans/p1/items", {
      cookie: alice.cookie,
      body: itemInput(),
    });
    expect(response.status).toBe(400);
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });

  it("본문 16KB(16,384바이트)는 받고, 1바이트 넘으면 413이고 넣지 않는다", async () => {
    const body = { item: itemInput() };
    const path = "/api/interior-plans/p1/items";
    const exact = await callApi(db, "POST", path, {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024),
    });
    expect(exact.status).toBe(201);
    const over = await callApi(db, "POST", path, {
      cookie: alice.cookie,
      body: { item: { ...itemInput(), pad: "가".repeat(6000) } },
    });
    expect(over.status).toBe(413);
    const overByOne = await callApi(db, "POST", path, {
      cookie: alice.cookie,
      body: padBodyTo(body, 16 * 1024 + 1),
    });
    expect(overByOne.status).toBe(413);
    expect(await countRows(db, "interior_plan_items")).toBe(1);
  });

  it("경로 id 형식 오류는 400, 플랜 id import도 400", async () => {
    for (const planId of ["a.b", "x".repeat(65), "import"]) {
      const response = await postItem(alice, planId, itemInput());
      expect(response.status, planId).toBe(400);
    }
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });
});

describe("PUT·DELETE /api/interior-plans/{id}/items/{itemId}", () => {
  beforeEach(async () => {
    await insertPlan(db, "alice", "p1");
    await insertPlan(db, "alice", "p2");
    await insertManyItems(db, "alice", "p1", 2, "i");
    await insertManyItems(db, "alice", "p2", 1, "j");
  });

  const putItem = (user: TestUser, path: string, item: unknown) =>
    callApi(db, "PUT", `/api/interior-plans/${path}`, { cookie: user.cookie, body: { item } });
  const deleteItem = (user: TestUser, path: string) =>
    callApi(db, "DELETE", `/api/interior-plans/${path}`, { cookie: user.cookie });

  it("PUT 200 { item }: 항목 전체를 바꾸고 createdAt은 그대로, 다른 항목은 그대로, 알 수 없는 키는 저장되지 않는다", async () => {
    const fields = itemInput({ trade: "타일", quotes: [quote("q1")], confirmedQuoteId: "q1" });
    const otherBefore = await readItemRow("alice", "p1", "i2");

    const response = await putItem(alice, "p1/items/i1", {
      ...fields,
      id: "other",
      createdAt: T3,
      extra: 1,
      quotes: [{ ...quote("q1"), extra: 1 }],
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { item } = await json<{ item: InteriorItem }>(response);
    expect(item.updatedAt).toMatch(ISO);
    expect(item.updatedAt).not.toBe(SEEDED_AT);
    expect(item).toStrictEqual({
      id: "i1",
      ...fields,
      createdAt: SEEDED_AT,
      updatedAt: item.updatedAt,
    });
    expect((await readItemRow("alice", "p1", "i1"))?.data).toStrictEqual(fields);
    expect(await readItemRow("alice", "p1", "i2")).toStrictEqual(otherBefore);
    // 전체 교체: 이전에 있던 선택 키가 본문에 없으면 사라진다
    const cleared = await putItem(alice, "p1/items/i1", itemInput());
    expect((await json<{ item: object }>(cleared)).item).not.toHaveProperty("quotes");
    expect((await readItemRow("alice", "p1", "i1"))?.data).toStrictEqual(itemInput());
  });

  it("다른 플랜의 항목 id·없는 항목·다른 사람의 플랜은 PUT·DELETE 404이고 바뀌지 않는다", async () => {
    await insertPlan(db, "bob", "p1");
    await insertManyItems(db, "bob", "p1", 1, "i");
    const before = await snapshotPlans(db);
    for (const [user, path] of [
      [alice, "p1/items/j1"],
      [alice, "p2/items/i1"],
      [alice, "p1/items/nope"],
      [bob, "p2/items/j1"],
      [alice, "nope/items/i1"],
    ] as const) {
      const put = await putItem(user, path, itemInput({ trade: "가로채기" }));
      expect(put.status, `PUT ${user.id} ${path}`).toBe(404);
      expect(await put.json()).toMatchObject({ error: "notFound" });
      expect((await deleteItem(user, path)).status, `DELETE ${user.id} ${path}`).toBe(404);
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
    // bob은 자기 p1의 i1만 고친다(alice의 같은 id 항목은 그대로)
    expect((await putItem(bob, "p1/items/i1", itemInput({ trade: "B" }))).status).toBe(200);
    expect((await readItemRow("alice", "p1", "i1"))?.data).toStrictEqual(itemInput());
  });

  it("숨긴 플랜의 항목은 PUT·DELETE 404(같은 id 보이는 플랜이 있어도 그 플랜의 항목만 찾는다)", async () => {
    const { ha, hb } = await seedHouseholdWithHiddenPlan();
    // hb가 함께 쓰는 중에 만든 보이는 플랜(같은 사용자 행이 범위에 있어도 숨긴 행은 빠져야 한다)
    await insertPlan(db, "hb", "pc");
    const before = await snapshotPlans(db);
    for (const user of [ha, hb]) {
      const put = await putItem(user, "p/items/hidden-i1", itemInput({ trade: "가로채기" }));
      expect(put.status).toBe(404);
      expect((await deleteItem(user, "p/items/hidden-i1")).status).toBe(404);
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
    // 보이는 플랜(ha의 p)의 항목은 hb도 고치고 지울 수 있다
    expect((await putItem(hb, "p/items/i1", itemInput({ trade: "B가 고침" }))).status).toBe(200);
    expect((await readItemRow("ha", "p", "i1"))?.data).toMatchObject({ trade: "B가 고침" });
    expect((await deleteItem(hb, "p/items/i1")).status).toBe(204);
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'hb'")).toBe(1);
  });

  it("DELETE 204, 다시 지우면 404, 다른 항목은 남는다", async () => {
    const response = await deleteItem(alice, "p1/items/i1");
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await readItemRow("alice", "p1", "i1")).toBeNull();
    expect(await readItemRow("alice", "p1", "i2")).not.toBeNull();
    expect((await deleteItem(alice, "p1/items/i1")).status).toBe(404);
  });

  it("PUT 검증 400이면 바뀌지 않는다(견적 6개·confirmedQuoteId 없음·dueDate 2026-13-01)", async () => {
    const before = await snapshotPlans(db);
    for (const item of [
      itemInput({ quotes: [1, 2, 3, 4, 5, 6].map((n) => quote(`q${n}`)) }),
      itemInput({ quotes: [quote("q1")], confirmedQuoteId: "q9" }),
      itemInput({ payments: [payment("p1", { dueDate: "2026-13-01" })] }),
    ]) {
      expect((await putItem(alice, "p1/items/i1", item)).status).toBe(400);
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("경로 id 형식 오류는 400(플랜·항목 모두, 플랜 id import 포함)", async () => {
    const before = await snapshotPlans(db);
    for (const path of [
      "a.b/items/i1",
      "p1/items/a.b",
      `p1/items/${"x".repeat(65)}`,
      "import/items/i1",
    ]) {
      const put = await putItem(alice, path, itemInput());
      expect(put.status, `PUT ${path}`).toBe(400);
      expect(await put.json()).toMatchObject({ error: "invalidParams" });
      expect((await deleteItem(alice, path)).status, `DELETE ${path}`).toBe(400);
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });
});

describe("POST /api/interior-plans/import", () => {
  it("/:id에 가려지지 않고 200 { imported: 1 }, 플랜·항목을 id·시각 그대로 넣는다", async () => {
    const items = [
      storedItem("i2", itemInput({ trade: "타일" }), T2, T3),
      storedItem("i1", itemInput({ quotes: [quote("q1")], confirmedQuoteId: "q1" }), T1, T3),
    ];
    const body = importBody("local-1", items, { createdAt: T1, updatedAt: T3 });

    const response = await importPlan(alice, body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toStrictEqual({ imported: 1 });
    expect(await list(alice)).toStrictEqual([{ ...body.plan, items: [items[1], items[0]] }]);
    expect(await readItemRow("alice", "local-1", "i2")).toStrictEqual({
      data: itemInput({ trade: "타일" }),
      created_at: T2,
      updated_at: T3,
    });
  });

  it("알 수 없는 키(플랜·공간·항목·견적·지급)는 저장되지 않는다", async () => {
    const body = {
      plan: {
        id: "p1",
        ...planInput(),
        extra: 1,
        spaces: [{ id: "s1", name: "거실", extra: 1 }],
        createdAt: T1,
        updatedAt: T1,
        items: [
          {
            ...storedItem("i1"),
            extra: 1,
            quotes: [{ ...quote("q1"), extra: 1 }],
            payments: [{ ...payment("pay1"), extra: 1 }],
          },
        ],
      },
    };
    expect(await json(await importPlan(alice, body))).toStrictEqual({ imported: 1 });
    expect(await readPlanData("alice", "p1")).toStrictEqual({
      name: "우리 집",
      spaces: [{ id: "s1", name: "거실" }],
    });
    expect((await readItemRow("alice", "p1", "i1"))?.data).toStrictEqual({
      ...itemInput(),
      quotes: [quote("q1")],
      payments: [payment("pay1")],
    });
  });

  it("같은 본문을 두 번 보내면 두 번째는 { imported: 0 }이고 중복·변경이 없다", async () => {
    expect(await json(await importPlan(alice, importBody("p1")))).toStrictEqual({ imported: 1 });
    const before = await snapshotPlans(db);
    const retry = await importPlan(alice, importBody("p1"));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toStrictEqual({ imported: 0 });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("첫 import 뒤 항목을 모두 지우고 같은 본문을 다시 보내도 항목이 되살아나지 않는다(항목 가드)", async () => {
    await importPlan(alice, importBody("p1"));
    for (const id of ["i1", "i2"]) {
      expect(
        (
          await callApi(db, "DELETE", `/api/interior-plans/p1/items/${id}`, {
            cookie: alice.cookie,
          })
        ).status,
      ).toBe(204);
    }

    const retry = await importPlan(alice, importBody("p1"));

    expect(retry.status).toBe(200);
    expect(await retry.json()).toStrictEqual({ imported: 0 });
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });

  it("항목 하나만 지운 뒤 재시도해도 지운 항목은 돌아오지 않는다", async () => {
    await importPlan(alice, importBody("p1"));
    await callApi(db, "DELETE", "/api/interior-plans/p1/items/i1", { cookie: alice.cookie });
    const retry = await importPlan(alice, importBody("p1"));
    expect(await retry.json()).toStrictEqual({ imported: 0 });
    expect((await list(alice))[0].items.map(({ id }) => id)).toEqual(["i2"]);
  });

  it("범위에 3개면 같은 id는 400이 아니라 { imported: 0 }, 다른 id는 400이고 아무것도 넣지 않는다", async () => {
    for (const id of ["p1", "p2", "p3"]) {
      expect(await json(await importPlan(alice, importBody(id)))).toStrictEqual({ imported: 1 });
    }
    const before = await snapshotPlans(db);

    const same = await importPlan(alice, importBody("p3", [storedItem("new-item")]));
    expect(same.status).toBe(200);
    expect(await same.json()).toStrictEqual({ imported: 0 });

    const other = await importPlan(alice, importBody("p4"));
    expect(other.status).toBe(400);
    expect(await other.json()).toMatchObject({ error: "invalidParams" });
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("다른 사람에게 같은 id가 있어도 내 범위가 아니므로 넣는다", async () => {
    await importPlan(bob, importBody("p1"));
    expect(await json(await importPlan(alice, importBody("p1")))).toStrictEqual({ imported: 1 });
    expect(await countRows(db, "interior_plan_items WHERE plan_id = 'p1'")).toBe(4);
  });

  it("가구 구성원(초대자·수락자 모두)이면 409 inHousehold이고 아무것도 넣지 않는다(범위에 같은 id가 있어도)", async () => {
    const { ha, hb } = await seedHouseholdWithHiddenPlan();
    const before = await snapshotPlans(db);
    for (const [user, id] of [
      [ha, "new-plan"],
      [hb, "new-plan"],
      [ha, "p"],
    ] as const) {
      const response = await importPlan(user, importBody(id));
      expect(response.status, `${user.id} ${id}`).toBe(409);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ error: "inHousehold" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  for (const [label, body] of [
    [
      "항목 id 중복",
      importBody("p1", [storedItem("i1"), storedItem("i1", itemInput({ trade: "타일" }))]),
    ],
    ["플랜 시각 +09:00", importBody("p1", [], { createdAt: "2026-09-01T09:00:00.000+09:00" })],
    ["플랜 시각 밀리초 없음", importBody("p1", [], { createdAt: "2026-09-01T00:00:00Z" })],
    [
      "항목 시각 +09:00",
      importBody("p1", [storedItem("i1", itemInput(), "2026-09-01T09:00:00.000+09:00")]),
    ],
    ["플랜 id import", importBody("import")],
    ["플랜 id 형식 오류", importBody("a.b")],
    ["items 없음", { plan: { id: "p1", ...planInput(), createdAt: T1, updatedAt: T1 } }],
    [
      "items 101개",
      importBody(
        "p1",
        Array.from({ length: 101 }, (_, i) => storedItem(`i${i}`)),
      ),
    ],
    [
      "항목 견적 6개",
      importBody("p1", [
        storedItem("i1", itemInput({ quotes: [1, 2, 3, 4, 5, 6].map((n) => quote(`q${n}`)) })),
      ]),
    ],
    [
      "중복 spaces[].id",
      {
        plan: {
          ...importBody("p1").plan,
          spaces: [
            { id: "s1", name: "a" },
            { id: "s1", name: "b" },
          ],
        },
      },
    ],
  ] as const) {
    it(`검증 400이고 넣지 않는다: ${label}`, async () => {
      const response = await importPlan(alice, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalidParams" });
      expect(await countRows(db, "interior_plans")).toBe(0);
      expect(await countRows(db, "interior_plan_items")).toBe(0);
    });
  }

  it("items 100개는 넣는다", async () => {
    const items = Array.from({ length: 100 }, (_, i) => storedItem(`i${i}`));
    expect(await json(await importPlan(alice, importBody("p1", items)))).toStrictEqual({
      imported: 1,
    });
    expect(await countRows(db, "interior_plan_items")).toBe(100);
  });

  it("본문 1MB(1,048,576바이트)는 받고, 1바이트 넘으면 413이고 넣지 않는다", async () => {
    const exact = await importPlan(alice, padBodyTo(importBody("p1"), 1024 * 1024));
    expect(await json(exact)).toStrictEqual({ imported: 1 });
    const over = await importPlan(alice, padBodyTo(importBody("p2"), 1024 * 1024 + 1));
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ error: "payloadTooLarge" });
    expect(await countRows(db, "interior_plans")).toBe(1);
  });
});

describe("공통 계약: 401·403·405·경로", () => {
  /** [메서드, 경로, 본문]. p1·i1은 alice의 플랜·항목 */
  const ENDPOINTS: [string, string, unknown][] = [
    ["GET", "/api/interior-plans", undefined],
    ["POST", "/api/interior-plans", { plan: planInput() }],
    ["POST", "/api/interior-plans/import", importBody("p9")],
    ["PATCH", "/api/interior-plans/p1", { plan: { name: "x" } }],
    ["DELETE", "/api/interior-plans/p1", undefined],
    ["POST", "/api/interior-plans/p1/items", { item: itemInput() }],
    ["PUT", "/api/interior-plans/p1/items/i1", { item: itemInput({ trade: "x" }) }],
    ["DELETE", "/api/interior-plans/p1/items/i1", undefined],
  ];

  beforeEach(async () => {
    await insertPlan(db, "alice", "p1");
    await insertManyItems(db, "alice", "p1", 1, "i");
  });

  it("8개 경로 모두 쿠키 없이 401 unauthorized, no-store이고 바뀌지 않는다", async () => {
    const before = await snapshotPlans(db);
    for (const [method, path, body] of ENDPOINTS) {
      const response = await callApi(db, method, path, { body });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ error: "unauthorized" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("쓰기 7개 경로는 다른 출처·Origin 없음이면 403 forbidden이고 바뀌지 않는다, GET은 막지 않는다", async () => {
    const before = await snapshotPlans(db);
    for (const [method, path, body] of ENDPOINTS.filter(([method]) => method !== "GET")) {
      for (const origin of ["https://evil.example", null]) {
        const response = await callApi(db, method, path, { cookie: alice.cookie, body, origin });
        expect(response.status, `${method} ${path} ${origin}`).toBe(403);
        expect(await response.json()).toMatchObject({ error: "forbidden" });
      }
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
    const get = await callApi(db, "GET", "/api/interior-plans", {
      cookie: alice.cookie,
      origin: "https://evil.example",
    });
    expect(get.status).toBe(200);
  });

  it("8개 경로 모두 성공 응답에 Cache-Control: no-store", async () => {
    // 플랜 DELETE를 맨 뒤로(먼저 지우면 뒤의 PATCH·항목 요청이 404)
    const [get, post, imported, patch, deletePlan, ...itemEndpoints] = ENDPOINTS;
    for (const [method, path, body] of [get, post, imported, patch, ...itemEndpoints, deletePlan]) {
      const response = await callApi(db, method, path, { cookie: alice.cookie, body });
      expect(response.status, `${method} ${path}`).toBeLessThan(300);
      expect(response.headers.get("Cache-Control"), `${method} ${path}`).toBe("no-store");
    }
  });

  it("메서드가 없으면 405 + Allow(import 경로는 /:id 핸들러에 닿지 않는다)", async () => {
    const before = await snapshotPlans(db);
    for (const [method, path, allow] of [
      ["PUT", "/api/interior-plans", "GET, POST"],
      ["GET", "/api/interior-plans/import", "POST"],
      ["PATCH", "/api/interior-plans/import", "POST"],
      ["DELETE", "/api/interior-plans/import", "POST"],
      ["GET", "/api/interior-plans/p1", "PATCH, DELETE"],
      ["PUT", "/api/interior-plans/p1", "PATCH, DELETE"],
      ["GET", "/api/interior-plans/p1/items", "POST"],
      ["PATCH", "/api/interior-plans/p1/items/i1", "PUT, DELETE"],
    ] as const) {
      const response = await callApi(db, method, path, {
        cookie: alice.cookie,
        body: method === "GET" ? undefined : { plan: { name: "x" } },
      });
      expect(response.status, `${method} ${path}`).toBe(405);
      expect(response.headers.get("Allow"), `${method} ${path}`).toBe(allow);
      expect(await response.json()).toMatchObject({ error: "methodNotAllowed" });
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);
  });

  it("표에 없는 하위 경로는 JSON 404", async () => {
    const response = await callApi(db, "GET", "/api/interior-plans/p1/items/i1/x", {
      cookie: alice.cookie,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "notFound" });
  });
});
