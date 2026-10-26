// /api/listings 동작 고정(스펙 interior-planner 태스크 0-4). 실제 마이그레이션을 적용한 D1 + Worker 진입점으로 부른다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  countRows,
  createUser,
  insertHousehold,
  insertListing,
  insertManyListings,
  listingInput,
  migrate,
} from "../test/harness";

import type { TestUser } from "../test/harness";

const db = env.DB;

const readData = async (userId: string, id: string) => {
  const row = await db
    .prepare("SELECT data, created_at, updated_at FROM listings WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<{ data: string; created_at: string; updated_at: string }>();
  return row === null ? null : { ...row, data: JSON.parse(row.data) as Record<string, unknown> };
};

const importBody = (ids: string[]) => ({
  listings: ids.map((id) => ({
    id,
    ...listingInput({ name: `옮긴 ${id}` }),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  })),
});

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

describe("GET /api/listings", () => {
  it("내 매물만 id 순서로, 시각은 행 값으로, no-store로 돌려준다", async () => {
    await insertListing(db, "alice", "b2", listingInput({ name: "둘째" }));
    await insertListing(db, "alice", "a1", listingInput({ name: "첫째", memo: "메모" }));
    await insertListing(db, "bob", "a0", listingInput({ name: "남의 것" }));

    const response = await callApi(db, "GET", "/api/listings", { cookie: alice.cookie });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { listings: { id: string; name: string }[] };
    expect(body.listings.map(({ id, name }) => [id, name])).toEqual([
      ["a1", "첫째"],
      ["b2", "둘째"],
    ]);
    expect(body.listings[0]).toStrictEqual({
      id: "a1",
      ...listingInput({ name: "첫째", memo: "메모" }),
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
  });
});

describe("POST /api/listings", () => {
  it("서버가 id·시각을 만들고 201 { listing }, 알려진 키만 저장한다", async () => {
    const response = await callApi(db, "POST", "/api/listings", {
      cookie: alice.cookie,
      body: { listing: { ...listingInput(), unknownKey: "x", memo: "" } },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { listing } = (await response.json()) as { listing: Record<string, unknown> };
    expect(listing.id).toMatch(/^[0-9a-f]{32}$/);
    expect(listing.createdAt).toBe(listing.updatedAt);
    const stored = await readData("alice", listing.id as string);
    expect(stored?.data).toStrictEqual(listingInput());
  });

  it("499개면 넣고, 500개면 400 invalidParams로 넣지 않는다(개수 확인과 넣기가 한 문장)", async () => {
    await insertManyListings(db, "alice", 499, "x");
    const first = await callApi(db, "POST", "/api/listings", {
      cookie: alice.cookie,
      body: { listing: listingInput() },
    });
    expect(first.status).toBe(201);

    const second = await callApi(db, "POST", "/api/listings", {
      cookie: alice.cookie,
      body: { listing: listingInput() },
    });
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ error: "invalidParams" });
    expect(await countRows(db, "listings WHERE user_id = 'alice'")).toBe(500);
  });

  it("499개에서 두 요청이 동시에 와도 하나만 들어간다", async () => {
    await insertManyListings(db, "alice", 499, "x");
    const send = () =>
      callApi(db, "POST", "/api/listings", {
        cookie: alice.cookie,
        body: { listing: listingInput() },
      });
    const statuses = (await Promise.all([send(), send()])).map(({ status }) => status).sort();
    expect(statuses).toEqual([201, 400]);
    expect(await countRows(db, "listings WHERE user_id = 'alice'")).toBe(500);
  });

  it("가구면 구성원 합계로 상한을 본다(숨긴 행은 세지 않음)", async () => {
    await clearTables(db);
    await insertHousehold(db, "h1");
    const inviter = await createUser(db, "alice", { householdId: "h1" });
    await createUser(db, "bob", { householdId: "h1" });
    await insertManyListings(db, "alice", 300, "a");
    await insertManyListings(db, "bob", 199, "b");
    await insertManyListings(db, "bob", 50, "hidden", { hiddenHouseholdId: "h1" });

    const ok = await callApi(db, "POST", "/api/listings", {
      cookie: inviter.cookie,
      body: { listing: listingInput() },
    });
    expect(ok.status).toBe(201);
    const over = await callApi(db, "POST", "/api/listings", {
      cookie: inviter.cookie,
      body: { listing: listingInput() },
    });
    expect(over.status).toBe(400);
  });

  it("검증에 어긋난 본문은 400, 512KB 넘는 본문은 413이고 넣지 않는다", async () => {
    const invalid = await callApi(db, "POST", "/api/listings", {
      cookie: alice.cookie,
      body: { listing: listingInput({ salePrice: 0 }) },
    });
    expect(invalid.status).toBe(400);
    const tooLarge = await callApi(db, "POST", "/api/listings", {
      cookie: alice.cookie,
      body: { listing: listingInput({ memo: "가".repeat(180_000) }) },
    });
    expect(tooLarge.status).toBe(413);
    expect(await countRows(db, "listings")).toBe(0);
  });
});

describe("PUT /api/listings/{id}", () => {
  it("본문의 memo·status는 무시하고 기존 값을 둔다, 나머지 필드는 바꾼다", async () => {
    await insertListing(db, "alice", "l1", listingInput({ memo: "원래 메모", status: "hold" }));

    const response = await callApi(db, "PUT", "/api/listings/l1", {
      cookie: alice.cookie,
      body: {
        listing: listingInput({
          name: "새 이름",
          salePrice: 130000,
          memo: "x",
          status: "rejected",
        }),
      },
    });

    expect(response.status).toBe(200);
    const { listing } = (await response.json()) as { listing: Record<string, unknown> };
    expect(listing).toMatchObject({ name: "새 이름", salePrice: 130000, memo: "원래 메모" });
    expect(listing.status).toBe("hold");
    const stored = await readData("alice", "l1");
    expect(stored?.data).toStrictEqual(
      listingInput({ name: "새 이름", salePrice: 130000, memo: "원래 메모", status: "hold" }),
    );
    expect(stored?.updated_at).not.toBe("2026-10-01T00:00:00.000Z");
    expect(stored?.created_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("기존 메모·상태가 없으면 PUT 뒤에도 키가 생기지 않는다", async () => {
    await insertListing(db, "alice", "l1");
    await callApi(db, "PUT", "/api/listings/l1", {
      cookie: alice.cookie,
      body: { listing: listingInput({ memo: "x", status: "candidate" }) },
    });
    const stored = await readData("alice", "l1");
    expect(stored?.data).toStrictEqual(listingInput());
  });

  it("다른 사람의 매물·없는 id는 404, 형식이 틀린 id는 400", async () => {
    await insertListing(db, "bob", "l1");
    const other = await callApi(db, "PUT", "/api/listings/l1", {
      cookie: alice.cookie,
      body: { listing: listingInput({ name: "덮어쓰기" }) },
    });
    expect(other.status).toBe(404);
    expect((await readData("bob", "l1"))?.data).toStrictEqual(listingInput());

    const invalidId = await callApi(db, "PUT", "/api/listings/bad.id", {
      cookie: alice.cookie,
      body: { listing: listingInput() },
    });
    expect(invalidId.status).toBe(400);
  });
});

describe("PATCH /api/listings/{id}", () => {
  it("보낸 키만 바꾸고 다른 필드는 그대로 둔다", async () => {
    const original = listingInput({
      memo: "메모",
      status: "hold",
      extraCosts: [{ category: "interior", label: "도배", amount: 300 }],
    });
    await insertListing(db, "alice", "l1", original);

    const memo = await callApi(db, "PATCH", "/api/listings/l1", {
      cookie: alice.cookie,
      body: { memo: "새 메모" },
    });
    expect(memo.status).toBe(200);
    expect((await readData("alice", "l1"))?.data).toStrictEqual({ ...original, memo: "새 메모" });

    await callApi(db, "PATCH", "/api/listings/l1", {
      cookie: alice.cookie,
      body: { status: null, name: "  이름 바꿈 " },
    });
    const extraCosts = original.extraCosts;
    expect((await readData("alice", "l1"))?.data).toStrictEqual(
      listingInput({ name: "이름 바꿈", memo: "새 메모", extraCosts }),
    );

    await callApi(db, "PATCH", "/api/listings/l1", { cookie: alice.cookie, body: { memo: "" } });
    expect((await readData("alice", "l1"))?.data).toStrictEqual(
      listingInput({ name: "이름 바꿈", extraCosts }),
    );
  });

  it("빈 본문·알 수 없는 상태는 400, 다른 사람의 매물은 404이고 바뀌지 않는다", async () => {
    await insertListing(db, "bob", "l1", listingInput({ memo: "밥 메모" }));
    expect(
      (await callApi(db, "PATCH", "/api/listings/l1", { cookie: bob.cookie, body: {} })).status,
    ).toBe(400);
    expect(
      (
        await callApi(db, "PATCH", "/api/listings/l1", {
          cookie: bob.cookie,
          body: { status: "done" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await callApi(db, "PATCH", "/api/listings/l1", {
          cookie: alice.cookie,
          body: { memo: "x" },
        })
      ).status,
    ).toBe(404);
    expect((await readData("bob", "l1"))?.data).toStrictEqual(listingInput({ memo: "밥 메모" }));
  });
});

describe("DELETE /api/listings/{id}", () => {
  it("내 매물은 204로 지우고, 다시 지우면 404", async () => {
    await insertListing(db, "alice", "l1");
    const deleted = await callApi(db, "DELETE", "/api/listings/l1", { cookie: alice.cookie });
    expect(deleted.status).toBe(204);
    expect(deleted.headers.get("Cache-Control")).toBe("no-store");
    expect(await readData("alice", "l1")).toBeNull();
    expect((await callApi(db, "DELETE", "/api/listings/l1", { cookie: alice.cookie })).status).toBe(
      404,
    );
  });

  it("다른 사람의 같은 id는 지우지 않는다(404)", async () => {
    await insertListing(db, "bob", "l1");
    expect((await callApi(db, "DELETE", "/api/listings/l1", { cookie: alice.cookie })).status).toBe(
      404,
    );
    expect(await readData("bob", "l1")).not.toBeNull();
  });
});

describe("POST /api/listings/import", () => {
  it("id·시각을 그대로 넣고, 이미 있는 id와 요청 안의 중복 id는 건너뛴다", async () => {
    await insertListing(db, "alice", "dup", listingInput({ name: "기존" }));

    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body: importBody(["n1", "dup", "n2", "n1"]),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 2, skipped: 2 });
    expect(await readData("alice", "n1")).toStrictEqual({
      data: listingInput({ name: "옮긴 n1" }),
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    });
    expect((await readData("alice", "dup"))?.data.name).toBe("기존");
  });

  it("같은 본문을 다시 보내면 { imported: 0 }이고 중복이 생기지 않는다", async () => {
    const send = () =>
      callApi(db, "POST", "/api/listings/import", {
        cookie: alice.cookie,
        body: importBody(["n1", "n2"]),
      });
    expect(await (await send()).json()).toStrictEqual({ imported: 2, skipped: 0 });
    expect(await (await send()).json()).toStrictEqual({ imported: 0, skipped: 2 });
    expect(await countRows(db, "listings WHERE user_id = 'alice'")).toBe(2);
  });

  it("새 id를 더해 500개를 넘으면 400이고 하나도 넣지 않는다", async () => {
    await insertManyListings(db, "alice", 499, "x");
    const over = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body: importBody(["n1", "n2"]),
    });
    expect(over.status).toBe(400);
    expect(await countRows(db, "listings WHERE user_id = 'alice'")).toBe(499);

    const exact = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body: importBody(["n1"]),
    });
    expect(await exact.json()).toStrictEqual({ imported: 1, skipped: 0 });
  });

  it("500개가 찬 뒤에도 이미 옮긴 id의 재시도는 400이 아니라 { imported: 0 }", async () => {
    await insertManyListings(db, "alice", 500, "x");
    const retry = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body: importBody(["x1", "x2"]),
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toStrictEqual({ imported: 0, skipped: 2 });
  });

  it("다른 사람의 같은 id는 내 범위가 아니므로 넣는다", async () => {
    await insertListing(db, "bob", "n1");
    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body: importBody(["n1"]),
    });
    expect(await response.json()).toStrictEqual({ imported: 1, skipped: 0 });
  });

  it("함께 쓰는 B가 숨긴 자기 매물과 같은 id를 보내면 건너뛰고 숨긴 행은 그대로", async () => {
    await clearTables(db);
    await insertHousehold(db, "h1");
    await createUser(db, "alice", { householdId: "h1" });
    const member = await createUser(db, "bob", { householdId: "h1" });
    await insertListing(db, "bob", "mine", listingInput({ name: "숨긴 것" }), {
      hiddenHouseholdId: "h1",
    });

    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: member.cookie,
      body: importBody(["mine"]),
    });
    expect(await response.json()).toStrictEqual({ imported: 0, skipped: 1 });
    const row = await db
      .prepare(
        "SELECT data, hidden_household_id FROM listings WHERE user_id = 'bob' AND id = 'mine'",
      )
      .first<{ data: string; hidden_household_id: string }>();
    expect(row?.hidden_household_id).toBe("h1");
    expect(JSON.parse(row!.data)).toStrictEqual(listingInput({ name: "숨긴 것" }));
  });

  it("함께 쓰는 중이면 상대(A)에게 이미 있는 id도 건너뛴다(가구 안에 같은 id가 둘 생기지 않음)", async () => {
    await clearTables(db);
    await insertHousehold(db, "h1");
    await createUser(db, "alice", { householdId: "h1" });
    const member = await createUser(db, "bob", { householdId: "h1" });
    await insertListing(db, "alice", "shared", listingInput({ name: "A 것" }));

    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: member.cookie,
      body: importBody(["shared", "fresh"]),
    });
    expect(await response.json()).toStrictEqual({ imported: 1, skipped: 1 });
    expect(await countRows(db, "listings WHERE id = 'shared'")).toBe(1);
    expect(await readData("bob", "fresh")).not.toBeNull();
  });

  it("형식이 틀린 id·시각이면 400이고 넣지 않는다", async () => {
    const body = importBody(["ok", "bad"]);
    body.listings[1].createdAt = "2026-02-30T00:00:00.000Z";
    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: alice.cookie,
      body,
    });
    expect(response.status).toBe(400);
    expect(await countRows(db, "listings")).toBe(0);
  });
});
