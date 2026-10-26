// 함께 쓰기 수락·나가기 고정(스펙 interior-planner 태스크 0-4, AC-0(f)). 2-1이 수락·나가기 batch에 문장을 더하기 전
// 동작을 고정한다. 요청은 Worker 진입점으로, 경쟁 재현만 핸들러를 직접 부르고 `db`를 Proxy로 감싼다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { acceptHouseholdInvite, leaveHousehold } from "./handleHousehold";
import {
  callApi,
  clearTables,
  countRows,
  createUser,
  insertHousehold,
  insertInvite,
  insertListing,
  insertManyListings,
  listingInput,
  migrate,
  newInviteToken,
  raceBeforeFirstBatch,
  snapshotState,
} from "../test/harness";

import type { TestUser } from "../test/harness";

const db = env.DB;
const now = () => new Date();

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

type UserRow = { budget: number | null; listing_order: string | null; household_id: string | null };

const readUser = (id: string) =>
  db
    .prepare("SELECT budget, listing_order, household_id FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();

const listingKeys = async (cookie: string) => {
  const response = await callApi(db, "GET", "/api/listings", { cookie });
  const { listings } = (await response.json()) as { listings: { id: string; name: string }[] };
  return listings.map(({ id, name }) => `${id}:${name}`);
};

const hiddenOf = async (userId: string) =>
  (
    await db
      .prepare("SELECT id, hidden_household_id FROM listings WHERE user_id = ? ORDER BY id")
      .bind(userId)
      .all<{ id: string; hidden_household_id: string | null }>()
  ).results;

/** A가 API로 초대를 만든다(토큰 평문은 이 응답에서만 받는다) */
async function createInvite(user: TestUser): Promise<string> {
  const response = await callApi(db, "POST", "/api/household/invites", { cookie: user.cookie });
  expect(response.status).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

const accept = (user: TestUser, token: string) =>
  callApi(db, "POST", `/api/household/invites/${token}/accept`, { cookie: user.cookie });

const leave = (user: TestUser) =>
  callApi(db, "POST", "/api/household/leave", { cookie: user.cookie });

const householdIdOf = async (userId: string) => (await readUser(userId))!.household_id!;

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  alice = await createUser(db, "alice", { budget: 70000, listingOrder: ["a2", "a1"] });
  bob = await createUser(db, "bob", { budget: 50000, listingOrder: ["b1"] });
  carol = await createUser(db, "carol");
  await insertListing(db, "alice", "a1", listingInput({ name: "A 첫째" }));
  await insertListing(db, "alice", "a2", listingInput({ name: "A 둘째" }));
  await insertListing(db, "alice", "same", listingInput({ name: "A 같은 id" }));
  await insertListing(db, "bob", "b1", listingInput({ name: "B 첫째" }));
  await insertListing(db, "bob", "same", listingInput({ name: "B 같은 id" }));
});

describe("POST /api/household/invites/{token}/accept 성공", () => {
  it("가구를 만들고 A 값을 복사, B 매물 숨김, 두 사람 초대 삭제, B의 users 값은 그대로", async () => {
    const bobOpenInvite = newInviteToken();
    await insertInvite(db, "bob", bobOpenInvite);
    const token = await createInvite(alice);

    const response = await accept(bob, token);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toStrictEqual({ household: { memberCount: 2 } });

    const householdId = await householdIdOf("bob");
    expect(householdId).toMatch(/^[0-9a-f]{32}$/);
    expect(await readUser("alice")).toEqual({
      budget: 70000,
      listing_order: '["a2","a1"]',
      household_id: householdId,
    });
    expect(await readUser("bob")).toEqual({
      budget: 50000,
      listing_order: '["b1"]',
      household_id: householdId,
    });
    expect(
      await db
        .prepare("SELECT id, inviter_id, budget, listing_order FROM households")
        .all()
        .then(({ results }) => results),
    ).toEqual([
      { id: householdId, inviter_id: "alice", budget: 70000, listing_order: '["a2","a1"]' },
    ]);

    expect(await hiddenOf("bob")).toEqual([
      { id: "b1", hidden_household_id: householdId },
      { id: "same", hidden_household_id: householdId },
    ]);
    expect((await hiddenOf("alice")).every((row) => row.hidden_household_id === null)).toBe(true);
    // A의 초대는 사용됨(accepted_by = B)으로 남고, B의 미사용 초대는 지워진다.
    expect(
      (
        await db
          .prepare(
            "SELECT inviter_id, accepted_by, used_at IS NOT NULL AS used FROM household_invites",
          )
          .all()
      ).results,
    ).toEqual([{ inviter_id: "alice", accepted_by: "bob", used: 1 }]);
  });

  it("수락 뒤 두 사람 모두 A의 매물·예산·순서를 보고, 같은 id의 B 매물은 섞이지 않는다", async () => {
    await accept(bob, await createInvite(alice));

    const expected = ["a1:A 첫째", "a2:A 둘째", "same:A 같은 id"];
    for (const user of [alice, bob]) {
      expect(await listingKeys(user.cookie)).toEqual(expected);
      const me = await callApi(db, "GET", "/api/me", { cookie: user.cookie });
      expect(await me.json()).toStrictEqual({
        user: { id: user.id, household: { memberCount: 2 } },
      });
      const budget = await callApi(db, "GET", "/api/budget", { cookie: user.cookie });
      expect(await budget.json()).toStrictEqual({ budget: 70000 });
      const order = await callApi(db, "GET", "/api/listing-order", { cookie: user.cookie });
      expect(await order.json()).toStrictEqual({ ids: ["a2", "a1"] });
    }
  });

  it("A의 보이는 매물이 정확히 500개면 수락된다(상한 경계 안)", async () => {
    await insertManyListings(db, "alice", 497, "x");
    expect(await countRows(db, "listings WHERE user_id = 'alice'")).toBe(500);
    expect((await accept(bob, await createInvite(alice))).status).toBe(200);
  });
});

describe("수락 실패 분기: 응답과 '아무것도 바뀌지 않음'", () => {
  type FailureCase = {
    name: string;
    arrange: () => Promise<{ token: string; user: TestUser }>;
    status: number;
    error: string;
  };

  const cases: FailureCase[] = [
    {
      name: "없는 토큰",
      arrange: async () => ({ token: newInviteToken(), user: bob }),
      status: 404,
      error: "notFound",
    },
    {
      name: "형식이 틀린 토큰",
      arrange: async () => ({ token: "not-a-token", user: bob }),
      status: 404,
      error: "notFound",
    },
    {
      name: "만료된 토큰",
      arrange: async () => {
        const token = newInviteToken();
        await insertInvite(db, "alice", token, { expiresAt: Math.floor(Date.now() / 1000) - 1 });
        return { token, user: bob };
      },
      status: 404,
      error: "notFound",
    },
    {
      name: "이미 사용된 토큰",
      arrange: async () => {
        const token = newInviteToken();
        await insertInvite(db, "alice", token, {
          usedAt: Math.floor(Date.now() / 1000) - 10,
          acceptedBy: "carol",
        });
        return { token, user: bob };
      },
      status: 404,
      error: "notFound",
    },
    {
      name: "내가 만든 초대",
      arrange: async () => ({ token: await createInvite(alice), user: alice }),
      status: 400,
      error: "ownInvite",
    },
    {
      name: "수락자가 이미 가구에 있음",
      arrange: async () => {
        const token = await createInvite(alice);
        await insertHousehold(db, "h-other");
        await db.batch([
          db.prepare("UPDATE users SET household_id = 'h-other' WHERE id IN ('bob', 'carol')"),
          db.prepare("UPDATE listings SET hidden_household_id = 'h-other' WHERE user_id = 'bob'"),
        ]);
        return { token, user: bob };
      },
      status: 409,
      error: "alreadyInHousehold",
    },
    {
      name: "초대자가 이미 가구에 있음",
      arrange: async () => {
        const token = await createInvite(alice);
        await insertHousehold(db, "h-other");
        await db
          .prepare("UPDATE users SET household_id = 'h-other' WHERE id IN ('alice', 'carol')")
          .run();
        return { token, user: bob };
      },
      status: 409,
      error: "householdFull",
    },
    {
      name: "A의 보이는 매물 501개",
      arrange: async () => {
        await insertManyListings(db, "alice", 498, "x");
        return { token: await createInvite(alice), user: bob };
      },
      status: 409,
      error: "householdLimit",
    },
  ];

  it.each(cases)("$name → $status $error", async ({ arrange, status, error }) => {
    // B의 미사용 초대: 실패 시 ④(초대 삭제)가 돌지 않았는지 보려고 둔다.
    await insertInvite(db, "bob", newInviteToken());
    const { token, user } = await arrange();
    const before = await snapshotState(db);

    const response = await accept(user, token);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
    expect(await snapshotState(db)).toStrictEqual(before);
  });
});

describe("동시 수락(Proxy로 '초대 읽은 뒤, batch 전'에 끼워 넣기)", () => {
  it("다른 두 사람이 같은 초대를 수락하면 먼저 끝난 쪽만 200, 진 쪽은 404이고 진 쪽 매물은 숨지 않는다", async () => {
    const token = await createInvite(alice);
    let carolResponse: Response | undefined;
    const racingDb = raceBeforeFirstBatch(db, async () => {
      carolResponse = await acceptHouseholdInvite(token, db, "carol", now);
    });

    const bobResponse = await acceptHouseholdInvite(token, racingDb, "bob", now);

    expect(carolResponse?.status).toBe(200);
    expect(bobResponse.status).toBe(404);
    expect(await countRows(db, "households")).toBe(1);
    expect((await readUser("bob"))?.household_id).toBeNull();
    expect((await hiddenOf("bob")).every((row) => row.hidden_household_id === null)).toBe(true);
    expect(await householdIdOf("carol")).toBe(await householdIdOf("alice"));
  });

  it("같은 사람이 두 번 동시에 수락해도 가구는 하나이고 뒤의 요청은 404", async () => {
    const token = await createInvite(alice);
    let firstResponse: Response | undefined;
    const racingDb = raceBeforeFirstBatch(db, async () => {
      firstResponse = await acceptHouseholdInvite(token, db, "bob", now);
    });

    const secondResponse = await acceptHouseholdInvite(token, racingDb, "bob", now);

    expect(firstResponse?.status).toBe(200);
    expect(secondResponse.status).toBe(404);
    expect(await countRows(db, "households")).toBe(1);
    const householdId = await householdIdOf("bob");
    expect((await hiddenOf("bob")).map((row) => row.hidden_household_id)).toEqual([
      householdId,
      householdId,
    ]);
  });
});

describe("POST /api/household/leave", () => {
  /** 수락 → 함께 쓰는 동안 B가 예산·순서·매물을 바꾸고 A가 a2를 지운다 → 미사용 초대 하나 */
  async function formHouseholdAndEdit(): Promise<{ bobNewId: string; householdId: string }> {
    expect((await accept(bob, await createInvite(alice))).status).toBe(200);
    await callApi(db, "PUT", "/api/budget", { cookie: bob.cookie, body: { budget: 90000 } });
    await callApi(db, "PUT", "/api/listing-order", { cookie: bob.cookie, body: { ids: ["same"] } });
    const created = await callApi(db, "POST", "/api/listings", {
      cookie: bob.cookie,
      body: { listing: listingInput({ name: "B가 함께 쓰는 중에 넣음" }) },
    });
    const bobNewId = ((await created.json()) as { listing: { id: string } }).listing.id;
    expect((await callApi(db, "DELETE", "/api/listings/a2", { cookie: alice.cookie })).status).toBe(
      204,
    );
    const householdId = await householdIdOf("alice");
    await insertInvite(db, "alice", newInviteToken());
    return { bobNewId, householdId };
  }

  async function expectRestored(bobNewId: string) {
    // A는 누가 나가든 가구 값을, B는 수락 전 users 값을 가진다.
    expect(await readUser("alice")).toEqual({
      budget: 90000,
      listing_order: '["same"]',
      household_id: null,
    });
    expect(await readUser("bob")).toEqual({
      budget: 50000,
      listing_order: '["b1"]',
      household_id: null,
    });
    expect(await countRows(db, "households")).toBe(0);
    expect(await countRows(db, "household_invites WHERE used_at IS NULL")).toBe(0);
    expect(await countRows(db, "listings WHERE hidden_household_id IS NOT NULL")).toBe(0);

    expect(await listingKeys(alice.cookie)).toEqual(["a1:A 첫째", "same:A 같은 id"]);
    expect(await listingKeys(bob.cookie)).toEqual(
      [`${bobNewId}:B가 함께 쓰는 중에 넣음`, "b1:B 첫째", "same:B 같은 id"].sort(),
    );
    for (const user of [alice, bob]) {
      const me = await callApi(db, "GET", "/api/me", { cookie: user.cookie });
      expect(await me.json()).toStrictEqual({ user: { id: user.id, household: null } });
    }
    const bobBudget = await callApi(db, "GET", "/api/budget", { cookie: bob.cookie });
    expect(await bobBudget.json()).toStrictEqual({ budget: 50000 });
    const aliceOrder = await callApi(db, "GET", "/api/listing-order", { cookie: alice.cookie });
    expect(await aliceOrder.json()).toStrictEqual({ ids: ["same"] });
  }

  it("B가 나가면 204: 숨김 해제, B가 넣은 매물은 B 것, A가 지운 매물은 돌아오지 않음", async () => {
    const { bobNewId } = await formHouseholdAndEdit();

    const response = await leave(bob);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expectRestored(bobNewId);
    expect((await leave(bob)).status).toBe(404);
    expect((await leave(alice)).status).toBe(404);
  });

  it("A가 나가도 결과는 같다", async () => {
    const { bobNewId } = await formHouseholdAndEdit();
    expect((await leave(alice)).status).toBe(204);
    await expectRestored(bobNewId);
    expect((await leave(bob)).status).toBe(404);
  });

  it("B에게 숨긴 매물이 없어도(매물 0개) 나가기는 204", async () => {
    await db.prepare("DELETE FROM listings WHERE user_id = 'bob'").run();
    await accept(bob, await createInvite(alice));
    expect((await leave(bob)).status).toBe(204);
    expect((await readUser("bob"))?.household_id).toBeNull();
  });

  it("가구가 없으면 404 notFound", async () => {
    const response = await leave(carol);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "notFound" });
  });

  it("동시 나가기(Proxy): 가구를 읽은 뒤 상대가 먼저 나가면 뒤의 요청은 404이고 결과는 한 번 나간 것과 같다", async () => {
    const { bobNewId } = await formHouseholdAndEdit();
    let bobResponse: Response | undefined;
    const racingDb = raceBeforeFirstBatch(db, async () => {
      bobResponse = await leaveHousehold(db, "bob");
    });

    const aliceResponse = await leaveHousehold(racingDb, "alice");

    expect(bobResponse?.status).toBe(204);
    expect(aliceResponse.status).toBe(404);
    await expectRestored(bobNewId);
  });
});
