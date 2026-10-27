// be 2-1 자가 확인(최소). 본격 테스트는 qa 2-3. 실제 마이그레이션(0007 포함) D1 + Worker 진입점으로 부른다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  countRows,
  createUser,
  insertInvite,
  migrate,
  newInviteToken,
} from "../test/harness";

import type { TestUser } from "../test/harness";

const db = env.DB;

const space = { id: "s1", name: "거실" };
const planFields = { name: "우리 집", spaces: [space] };
const itemFields = { spaceId: "s1", trade: "도배", status: "planned", budget: 300 };
const T1 = "2026-09-01T00:00:00.000Z";

const importBody = (id: string, itemIds: string[] = ["i1", "i2"]) => ({
  plan: {
    id,
    ...planFields,
    createdAt: T1,
    updatedAt: T1,
    items: itemIds.map((itemId) => ({ id: itemId, ...itemFields, createdAt: T1, updatedAt: T1 })),
  },
});

type PlanBody = { plan: { id: string; items: { id: string }[] } };

async function createPlan(user: TestUser, extra: Record<string, unknown> = {}) {
  const response = await callApi(db, "POST", "/api/interior-plans", {
    cookie: user.cookie,
    body: { plan: { ...planFields, ...extra } },
  });
  return { response, body: (await response.json()) as PlanBody };
}

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice");
  bob = await createUser(db, "bob");
});

describe("플랜", () => {
  it("POST 201 { plan } 서버 id, 알려진 키만 저장, GET에 항목 포함, no-store", async () => {
    const { response, body } = await createPlan(alice, {
      unknown: "x",
      items: [{ ...itemFields, unknown: 1 }],
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const stored = await db.prepare("SELECT data FROM interior_plans").first<{ data: string }>();
    expect(JSON.parse(stored!.data)).toStrictEqual(planFields);
    const item = await db.prepare("SELECT data FROM interior_plan_items").first<{ data: string }>();
    expect(JSON.parse(item!.data)).toStrictEqual(itemFields);

    const list = await callApi(db, "GET", "/api/interior-plans", { cookie: alice.cookie });
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect(await list.json()).toStrictEqual({ plans: [body.plan] });
  });

  it("3개면 POST 400이고 함께 보낸 항목도 넣지 않는다", async () => {
    for (let i = 0; i < 3; i += 1) await createPlan(alice);
    const { response } = await createPlan(alice, { items: [itemFields] });
    expect(response.status).toBe(400);
    expect(await countRows(db, "interior_plans")).toBe(3);
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });

  it("PATCH null은 지우고 다른 필드는 그대로, 경로 id 형식 오류·import는 400", async () => {
    const { body } = await createPlan(alice, { budget: 3000, listingId: "l1" });
    const response = await callApi(db, "PATCH", `/api/interior-plans/${body.plan.id}`, {
      cookie: alice.cookie,
      body: { plan: { budget: null, name: " 새 이름 " } },
    });
    expect(response.status).toBe(200);
    const patched = (await response.json()) as { plan: Record<string, unknown> };
    expect(patched.plan).toMatchObject({ name: "새 이름", listingId: "l1", spaces: [space] });
    expect(patched.plan).not.toHaveProperty("budget");
    const badId = await callApi(db, "PATCH", "/api/interior-plans/a.b", {
      cookie: alice.cookie,
      body: { plan: { name: "x" } },
    });
    expect(badId.status).toBe(400);
    // 플랜 id "import"는 만들 수 없다: 경로는 /import(POST만)에 맞아 405, 하위 경로·import 본문은 400
    const shadowed = await callApi(db, "PATCH", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: { plan: { name: "x" } },
    });
    expect([shadowed.status, shadowed.headers.get("Allow")]).toEqual([405, "POST"]);
    const nested = await callApi(db, "POST", "/api/interior-plans/import/items", {
      cookie: alice.cookie,
      body: { item: itemFields },
    });
    expect(nested.status).toBe(400);
    const reserved = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("import"),
    });
    expect(reserved.status).toBe(400);
  });

  it("DELETE 204 후 항목 0행(CASCADE), 다른 사람 플랜은 404", async () => {
    const { body } = await createPlan(alice, { items: [itemFields, itemFields] });
    const other = await callApi(db, "DELETE", `/api/interior-plans/${body.plan.id}`, {
      cookie: bob.cookie,
    });
    expect(other.status).toBe(404);
    const response = await callApi(db, "DELETE", `/api/interior-plans/${body.plan.id}`, {
      cookie: alice.cookie,
    });
    expect(response.status).toBe(204);
    expect(await countRows(db, "interior_plan_items")).toBe(0);
  });

  it("16KB 넘는 본문은 413", async () => {
    const { response } = await createPlan(alice, { padding: "x".repeat(17 * 1024) });
    expect(response.status).toBe(413);
  });
});

describe("항목", () => {
  it("POST 201, 플랜 없으면 404, 100개면 400", async () => {
    const { body } = await createPlan(alice);
    const path = `/api/interior-plans/${body.plan.id}/items`;
    const created = await callApi(db, "POST", path, {
      cookie: alice.cookie,
      body: { item: itemFields },
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("no-store");

    const missing = await callApi(db, "POST", "/api/interior-plans/nope/items", {
      cookie: alice.cookie,
      body: { item: itemFields },
    });
    expect(missing.status).toBe(404);

    await db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 2 UNION ALL SELECT i + 1 FROM n WHERE i < 100)
         INSERT INTO interior_plan_items SELECT 'alice', ?1, 'x' || i, '{}', ?2, ?2 FROM n`,
      )
      .bind(body.plan.id, T1)
      .run();
    const full = await callApi(db, "POST", path, {
      cookie: alice.cookie,
      body: { item: itemFields },
    });
    expect(full.status).toBe(400);
    expect(await countRows(db, "interior_plan_items")).toBe(100);
  });

  it("PUT·DELETE는 다른 사람·숨긴 플랜에서 404(같은 id라도)", async () => {
    await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: bob.cookie,
      body: importBody("p1"),
    });
    await db
      .prepare("UPDATE interior_plans SET hidden_household_id = 'h' WHERE user_id = 'bob'")
      .run();
    await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p2"),
    });
    const put = await callApi(db, "PUT", "/api/interior-plans/p2/items/i1", {
      cookie: bob.cookie,
      body: { item: itemFields },
    });
    expect(put.status).toBe(404);
    const hidden = await callApi(db, "DELETE", "/api/interior-plans/p1/items/i1", {
      cookie: bob.cookie,
    });
    expect(hidden.status).toBe(404);
    const own = await callApi(db, "PUT", "/api/interior-plans/p2/items/i1", {
      cookie: alice.cookie,
      body: { item: { ...itemFields, trade: "타일" } },
    });
    expect(own.status).toBe(200);
    expect(((await own.json()) as { item: { trade: string } }).item.trade).toBe("타일");
    expect(await countRows(db, "interior_plan_items WHERE plan_user_id = 'bob'")).toBe(2);
  });
});

describe("import", () => {
  it("/import 경로가 /:id에 가려지지 않고, 재시도는 imported 0이며 지운 항목이 되살아나지 않는다", async () => {
    const first = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p1"),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toStrictEqual({ imported: 1 });
    await callApi(db, "DELETE", "/api/interior-plans/p1/items/i1", { cookie: alice.cookie });

    const retry = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p1"),
    });
    expect(await retry.json()).toStrictEqual({ imported: 0 });
    expect(await countRows(db, "interior_plan_items")).toBe(1);
  });

  it("플랜 3개 상태에서 같은 id는 imported 0, 다른 id는 400", async () => {
    for (const id of ["p1", "p2", "p3"]) {
      await callApi(db, "POST", "/api/interior-plans/import", {
        cookie: alice.cookie,
        body: importBody(id),
      });
    }
    const same = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p3"),
    });
    expect(same.status).toBe(200);
    expect(await same.json()).toStrictEqual({ imported: 0 });
    const other = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p4"),
    });
    expect(other.status).toBe(400);
  });

  it("항목 id가 겹치면 400, 가구 구성원이면 409 inHousehold", async () => {
    const duplicate = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("p1", ["i1", "i1"]),
    });
    expect(duplicate.status).toBe(400);

    const token = newInviteToken();
    await insertInvite(db, "alice", token);
    await callApi(db, "POST", `/api/household/invites/${token}/accept`, { cookie: bob.cookie });
    const response = await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: bob.cookie,
      body: importBody("p9"),
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe("inHousehold");
    expect(await countRows(db, "interior_plans")).toBe(0);
  });
});

describe("함께 쓰기", () => {
  it("수락하면 B 플랜을 숨기고 나가면 돌려준다, B가 A 플랜에 넣은 항목은 A 플랜에 남는다", async () => {
    await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: alice.cookie,
      body: importBody("pa"),
    });
    await callApi(db, "POST", "/api/interior-plans/import", {
      cookie: bob.cookie,
      body: importBody("pb"),
    });
    const token = newInviteToken();
    await insertInvite(db, "alice", token);
    const accepted = await callApi(db, "POST", `/api/household/invites/${token}/accept`, {
      cookie: bob.cookie,
    });
    expect(accepted.status).toBe(200);
    const { household_id: householdId } = (await db
      .prepare("SELECT household_id FROM users WHERE id = 'bob'")
      .first<{ household_id: string }>())!;
    expect(await countRows(db, "interior_plans WHERE hidden_household_id = ?", householdId)).toBe(
      1,
    );

    const seen = async (user: TestUser) =>
      (
        (await (
          await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie })
        ).json()) as {
          plans: { id: string }[];
        }
      ).plans.map(({ id }) => id);
    expect(await seen(bob)).toEqual(["pa"]);
    expect(await seen(alice)).toEqual(["pa"]);

    const added = await callApi(db, "POST", "/api/interior-plans/pa/items", {
      cookie: bob.cookie,
      body: { item: itemFields },
    });
    expect(added.status).toBe(201);

    const left = await callApi(db, "POST", "/api/household/leave", { cookie: bob.cookie });
    expect(left.status).toBe(204);
    expect(await countRows(db, "interior_plans WHERE hidden_household_id IS NOT NULL")).toBe(0);
    expect(await seen(bob)).toEqual(["pb"]);
    expect(await seen(alice)).toEqual(["pa"]);
    expect(await countRows(db, "interior_plan_items WHERE plan_id = 'pa'")).toBe(3);
  });
});
