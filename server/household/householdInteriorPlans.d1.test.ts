// 함께 쓰기 수락·나가기와 인테리어 플랜(스펙 interior-planner AC-9 서버, ADR-029 D4·조건 4). 수락하면 B의 플랜을
// 숨기고 나가면 돌려준다. 플랜은 만든 사람 것이고 항목은 플랜을 따라간다. 요청은 Worker 진입점으로, 경쟁 재현만 핸들러를 직접
// 부르고 `db`를 Proxy로 감싼다. 끝의 describe는 AC-0(f): 0006 시점 데이터에 0007을 적용한 뒤 수락·나가기가 배포 전과 같다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { leaveHousehold } from "./handleHousehold";
import {
  ALL_MIGRATIONS,
  BASELINE_MIGRATIONS,
  callApi,
  clearTables,
  countRows,
  createUser,
  insertInvite,
  insertListing,
  itemInput,
  listingInput,
  migrate,
  newInviteToken,
  planInput,
  raceBeforeFirstBatch,
  snapshotPlans,
  snapshotState,
} from "../test/harness";

import type { InteriorItem, InteriorPlanWithItems } from "../../src/lib/types/interiorPlan";
import type { TestUser } from "../test/harness";

const db = env.DB;

const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-02T00:00:00.000Z";

const storedItem = (id: string, trade: string): InteriorItem => ({
  id,
  ...itemInput({ trade }),
  createdAt: T1,
  updatedAt: T1,
});

/** 로그아웃 상태에서 만든 플랜을 옮기는 것처럼 import로 넣는다(시각 고정) */
async function importPlan(user: TestUser, id: string, items: InteriorItem[], createdAt: string) {
  const response = await callApi(db, "POST", "/api/interior-plans/import", {
    cookie: user.cookie,
    body: {
      plan: {
        id,
        ...planInput({ name: `${user.id}의 ${id}` }),
        createdAt,
        updatedAt: createdAt,
        items,
      },
    },
  });
  expect(await response.json()).toStrictEqual({ imported: 1 });
}

/** 플랜 id와 항목 `{id}:{trade}` */
const seen = async (user: TestUser) => {
  const response = await callApi(db, "GET", "/api/interior-plans", { cookie: user.cookie });
  expect(response.status).toBe(200);
  const { plans } = (await response.json()) as { plans: InteriorPlanWithItems[] };
  return plans.map(({ id, items }) => ({
    id,
    items: items.map((item) => `${item.id}:${item.trade}`),
  }));
};

async function createInvite(user: TestUser): Promise<string> {
  const response = await callApi(db, "POST", "/api/household/invites", { cookie: user.cookie });
  expect(response.status).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

const accept = (user: TestUser, token: string) =>
  callApi(db, "POST", `/api/household/invites/${token}/accept`, { cookie: user.cookie });

const leave = (user: TestUser) =>
  callApi(db, "POST", "/api/household/leave", { cookie: user.cookie });

const householdIdOf = async (userId: string) =>
  (await db
    .prepare("SELECT household_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ household_id: string | null }>())!.household_id;

const hiddenPlans = () =>
  db
    .prepare(
      "SELECT user_id, id, hidden_household_id FROM interior_plans WHERE hidden_household_id IS NOT NULL ORDER BY user_id, id",
    )
    .all()
    .then(({ results }) => results);

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice", { budget: 70000, listingOrder: ["a1"] });
  bob = await createUser(db, "bob", { budget: 50000, listingOrder: ["b1"] });
  await insertListing(db, "alice", "a1", listingInput({ name: "A 매물" }));
  await insertListing(db, "bob", "b1", listingInput({ name: "B 매물" }));
});

describe("수락·나가기와 플랜 (AC-9)", () => {
  /**
   * A(PA, 항목 a-i1)·B(PB, 항목 b-i1) → B 수락 → B가 PA에 항목 추가·A 항목 수정 → B가 PC를 만들고 A가 PC에 항목 추가.
   * 돌려주는 값: 가구 id, B가 PA에 넣은 항목 id, PC id
   */
  async function formHouseholdAndEdit() {
    await importPlan(alice, "pa", [storedItem("a-i1", "도배")], T1);
    await importPlan(bob, "pb", [storedItem("b-i1", "타일")], T2);

    const accepted = await accept(bob, await createInvite(alice));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toStrictEqual({ household: { memberCount: 2 } });
    const householdId = (await householdIdOf("bob"))!;
    expect(await householdIdOf("alice")).toBe(householdId);

    // 수락 직후: B의 플랜만 이 가구 id로 숨김(AC-9 D1 확인 쿼리)
    expect(await countRows(db, "interior_plans WHERE hidden_household_id = ?", householdId)).toBe(
      1,
    );
    expect(await hiddenPlans()).toStrictEqual([
      { user_id: "bob", id: "pb", hidden_household_id: householdId },
    ]);
    for (const user of [alice, bob]) {
      expect(await seen(user)).toStrictEqual([{ id: "pa", items: ["a-i1:도배"] }]);
    }

    // B가 PA에 항목을 넣고 A의 항목을 고친다. 항목 행은 플랜을 만든 A의 행이다
    const added = await callApi(db, "POST", "/api/interior-plans/pa/items", {
      cookie: bob.cookie,
      body: { item: itemInput({ trade: "샷시" }) },
    });
    expect(added.status).toBe(201);
    const bobItemId = ((await added.json()) as { item: InteriorItem }).item.id;
    expect(
      await countRows(
        db,
        "interior_plan_items WHERE plan_user_id = 'alice' AND plan_id = 'pa' AND id = ?",
        bobItemId,
      ),
    ).toBe(1);
    const edited = await callApi(db, "PUT", "/api/interior-plans/pa/items/a-i1", {
      cookie: bob.cookie,
      body: { item: itemInput({ trade: "도배 B가 고침" }) },
    });
    expect(edited.status).toBe(200);

    // 함께 쓰는 동안 B가 만든 PC는 둘 다 보고, A도 항목을 넣을 수 있다
    const created = await callApi(db, "POST", "/api/interior-plans", {
      cookie: bob.cookie,
      body: { plan: planInput({ name: "B가 함께 쓰는 중에 만듦" }) },
    });
    expect(created.status).toBe(201);
    const pcId = ((await created.json()) as { plan: { id: string } }).plan.id;
    const aliceOnPc = await callApi(db, "POST", `/api/interior-plans/${pcId}/items`, {
      cookie: alice.cookie,
      body: { item: itemInput({ trade: "A가 PC에" }) },
    });
    expect(aliceOnPc.status).toBe(201);
    const aliceItemId = ((await aliceOnPc.json()) as { item: InteriorItem }).item.id;

    const together = [
      { id: "pa", items: ["a-i1:도배 B가 고침", `${bobItemId}:샷시`] },
      { id: pcId, items: [`${aliceItemId}:A가 PC에`] },
    ];
    expect(await seen(alice)).toStrictEqual(together);
    expect(await seen(bob)).toStrictEqual(together);

    // 숨긴 PB는 B 자신도 고치거나 지울 수 없다
    const before = await snapshotPlans(db);
    for (const [method, path, body] of [
      ["PATCH", "/api/interior-plans/pb", { plan: { name: "x" } }],
      ["DELETE", "/api/interior-plans/pb", undefined],
      ["POST", "/api/interior-plans/pb/items", { item: itemInput() }],
      ["PUT", "/api/interior-plans/pb/items/b-i1", { item: itemInput() }],
      ["DELETE", "/api/interior-plans/pb/items/b-i1", undefined],
    ] as const) {
      for (const user of [alice, bob]) {
        const response = await callApi(db, method, path, { cookie: user.cookie, body });
        expect(response.status, `${user.id} ${method} ${path}`).toBe(404);
      }
    }
    expect(await snapshotPlans(db)).toStrictEqual(before);

    return { householdId, bobItemId, pcId, aliceItemId };
  }

  async function expectRestored({
    bobItemId,
    pcId,
    aliceItemId,
  }: Awaited<ReturnType<typeof formHouseholdAndEdit>>) {
    expect(await hiddenPlans()).toStrictEqual([]);
    expect(await countRows(db, "interior_plans WHERE hidden_household_id IS NOT NULL")).toBe(0);
    // A는 PA만(B가 PA에 넣은 항목은 PA에 남는다), B는 PB·PC(PC에 A가 넣은 항목은 PC를 따라 B에게 간다)
    expect(await seen(alice)).toStrictEqual([
      { id: "pa", items: ["a-i1:도배 B가 고침", `${bobItemId}:샷시`] },
    ]);
    expect(await seen(bob)).toStrictEqual([
      { id: "pb", items: ["b-i1:타일"] },
      { id: pcId, items: [`${aliceItemId}:A가 PC에`] },
    ]);
    // 매물·예산·순서는 0-4에서 고정한 규칙 그대로
    const listings = async (user: TestUser) =>
      (
        (await (await callApi(db, "GET", "/api/listings", { cookie: user.cookie })).json()) as {
          listings: { id: string }[];
        }
      ).listings.map(({ id }) => id);
    expect(await listings(alice)).toEqual(["a1"]);
    expect(await listings(bob)).toEqual(["b1"]);
    const budget = async (user: TestUser) =>
      (await callApi(db, "GET", "/api/budget", { cookie: user.cookie })).json();
    expect(await budget(alice)).toStrictEqual({ budget: 70000 });
    expect(await budget(bob)).toStrictEqual({ budget: 50000 });
    expect(await countRows(db, "households")).toBe(0);
  }

  it("B가 나가면 204: B는 PB·PC, A는 PA, B가 PA에 넣은 항목은 PA에 남고 숨김 0", async () => {
    const state = await formHouseholdAndEdit();
    const response = await leave(bob);
    expect(response.status).toBe(204);
    await expectRestored(state);
    expect((await leave(bob)).status).toBe(404);
  });

  it("A가 나가도 결과는 같다", async () => {
    const state = await formHouseholdAndEdit();
    expect((await leave(alice)).status).toBe(204);
    await expectRestored(state);
  });

  it("동시 나가기(Proxy): 상대가 먼저 나가면 뒤의 요청은 404이고 플랜은 한 번 돌려준 것과 같다", async () => {
    const state = await formHouseholdAndEdit();
    let bobResponse: Response | undefined;
    const racingDb = raceBeforeFirstBatch(db, async () => {
      bobResponse = await leaveHousehold(db, "bob");
    });

    const aliceResponse = await leaveHousehold(racingDb, "alice");

    expect(bobResponse?.status).toBe(204);
    expect(aliceResponse.status).toBe(404);
    await expectRestored(state);
  });

  it("B에게 플랜이 없으면 수락은 200(memberCount 2)·나가기는 204이고 A 플랜은 숨지 않는다", async () => {
    await importPlan(alice, "pa", [], T1);
    const accepted = await accept(bob, await createInvite(alice));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toStrictEqual({ household: { memberCount: 2 } });
    expect(await hiddenPlans()).toStrictEqual([]);
    expect(await seen(bob)).toStrictEqual([{ id: "pa", items: [] }]);

    expect((await leave(bob)).status).toBe(204);
    expect(await householdIdOf("bob")).toBeNull();
    expect(await seen(bob)).toStrictEqual([]);
    expect(await seen(alice)).toStrictEqual([{ id: "pa", items: [] }]);
  });

  it("두 사람 모두 플랜이 없어도 나가기는 204", async () => {
    expect((await accept(bob, await createInvite(alice))).status).toBe(200);
    expect((await leave(bob)).status).toBe(204);
    expect(await householdIdOf("alice")).toBeNull();
  });

  it("함께 쓰는 동안 상한은 보이는 플랜 합계: A 2개면 B는 1개만 더 만들고, 나가면 B는 숨겼던 것까지 돌려받는다", async () => {
    await importPlan(alice, "pa1", [], T1);
    await importPlan(alice, "pa2", [], T1);
    await importPlan(bob, "pb", [], T2);
    expect((await accept(bob, await createInvite(alice))).status).toBe(200);
    const create = (user: TestUser) =>
      callApi(db, "POST", "/api/interior-plans", {
        cookie: user.cookie,
        body: { plan: planInput() },
      });
    expect((await create(bob)).status).toBe(201);
    expect((await create(bob)).status).toBe(400);
    expect((await create(alice)).status).toBe(400);

    expect((await leave(bob)).status).toBe(204);
    expect((await seen(bob)).map(({ id }) => id)).toHaveLength(2);
    expect((await seen(alice)).map(({ id }) => id)).toEqual(["pa1", "pa2"]);
  });

  it("수락이 실패하면(만료된 초대·자기 초대) 플랜도 매물도 바뀌지 않는다", async () => {
    await importPlan(alice, "pa", [storedItem("a-i1", "도배")], T1);
    await importPlan(bob, "pb", [storedItem("b-i1", "타일")], T2);
    const expired = newInviteToken();
    await insertInvite(db, "alice", expired, { expiresAt: Math.floor(Date.now() / 1000) - 1 });
    const own = newInviteToken();
    await insertInvite(db, "bob", own);
    const state = await snapshotState(db);
    const plans = await snapshotPlans(db);

    expect((await accept(bob, expired)).status).toBe(404);
    expect((await accept(bob, own)).status).toBe(400);

    expect(await snapshotState(db)).toStrictEqual(state);
    expect(await snapshotPlans(db)).toStrictEqual(plans);
    expect(await seen(bob)).toStrictEqual([{ id: "pb", items: ["b-i1:타일"] }]);
  });

  it("A·B가 같은 플랜 id를 가져도 수락 뒤에는 A 것만, 나간 뒤에는 각자 것", async () => {
    await importPlan(alice, "same", [storedItem("x", "A 항목")], T1);
    await importPlan(bob, "same", [storedItem("x", "B 항목")], T1);
    expect((await accept(bob, await createInvite(alice))).status).toBe(200);
    for (const user of [alice, bob]) {
      expect(await seen(user)).toStrictEqual([{ id: "same", items: ["x:A 항목"] }]);
    }
    const put = await callApi(db, "PUT", "/api/interior-plans/same/items/x", {
      cookie: bob.cookie,
      body: { item: itemInput({ trade: "B가 고침" }) },
    });
    expect(put.status).toBe(200);
    expect((await leave(alice)).status).toBe(204);
    expect(await seen(alice)).toStrictEqual([{ id: "same", items: ["x:B가 고침"] }]);
    expect(await seen(bob)).toStrictEqual([{ id: "same", items: ["x:B 항목"] }]);
  });
});

describe("AC-0(f): 0001~0006에서 시드 → 0007 적용 → 수락·나가기", () => {
  const upgraded = env.DB_BASELINE;
  let carol: TestUser;
  let dave: TestUser;

  beforeAll(async () => {
    await migrate(upgraded, BASELINE_MIGRATIONS);
    carol = await createUser(upgraded, "carol", { budget: 80000, listingOrder: ["c2", "c1"] });
    dave = await createUser(upgraded, "dave", { budget: 30000, listingOrder: ["d1"] });
    await insertListing(upgraded, "carol", "c1", listingInput({ name: "C 첫째" }));
    await insertListing(upgraded, "carol", "c2", listingInput({ name: "C 둘째" }));
    await insertListing(upgraded, "dave", "d1", listingInput({ name: "D 첫째" }));
    await insertListing(upgraded, "dave", "c1", listingInput({ name: "D 같은 id" }));
    await migrate(upgraded, ALL_MIGRATIONS);
  });

  const get = async (user: TestUser, path: string) => {
    const response = await callApi(upgraded, "GET", path, { cookie: user.cookie });
    expect(response.status, path).toBe(200);
    return response.json();
  };
  const listingNames = async (user: TestUser) =>
    (
      (await get(user, "/api/listings")) as { listings: { id: string; name: string }[] }
    ).listings.map(({ id, name }) => `${id}:${name}`);

  it("새 테이블은 0행이고 기존 사용자의 플랜 목록은 비어 있다", async () => {
    expect(await countRows(upgraded, "interior_plans")).toBe(0);
    expect(await countRows(upgraded, "interior_plan_items")).toBe(0);
    for (const user of [carol, dave]) {
      expect(await get(user, "/api/interior-plans")).toStrictEqual({ plans: [] });
    }
  });

  it("수락하면 D 매물 숨김·가구 값 = C 값, 나가면 숨김 해제·C는 가구 값·D는 원래 값(배포 전 규칙 그대로)", async () => {
    const created = await callApi(upgraded, "POST", "/api/household/invites", {
      cookie: carol.cookie,
    });
    const { token } = (await created.json()) as { token: string };
    const accepted = await callApi(upgraded, "POST", `/api/household/invites/${token}/accept`, {
      cookie: dave.cookie,
    });
    expect(accepted.status).toBe(200);
    for (const user of [carol, dave]) {
      expect(await listingNames(user)).toEqual(["c1:C 첫째", "c2:C 둘째"]);
      expect(await get(user, "/api/budget")).toStrictEqual({ budget: 80000 });
      expect(await get(user, "/api/listing-order")).toStrictEqual({ ids: ["c2", "c1"] });
    }
    await callApi(upgraded, "PUT", "/api/budget", { cookie: dave.cookie, body: { budget: 90000 } });

    expect(
      (await callApi(upgraded, "POST", "/api/household/leave", { cookie: dave.cookie })).status,
    ).toBe(204);

    expect(await listingNames(carol)).toEqual(["c1:C 첫째", "c2:C 둘째"]);
    expect(await listingNames(dave)).toEqual(["c1:D 같은 id", "d1:D 첫째"]);
    expect(await get(carol, "/api/budget")).toStrictEqual({ budget: 90000 });
    expect(await get(dave, "/api/budget")).toStrictEqual({ budget: 30000 });
    expect(await get(dave, "/api/listing-order")).toStrictEqual({ ids: ["d1"] });
    expect(await countRows(upgraded, "listings WHERE hidden_household_id IS NOT NULL")).toBe(0);
    expect(await countRows(upgraded, "households")).toBe(0);
  });
});
