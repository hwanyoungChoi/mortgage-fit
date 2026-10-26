// 골든 응답(스펙 interior-planner 태스크 0-4, AC-0(a)(b)(f)). 혼자·가구·빈 계정의 `/api/me`·`/api/listings`·`/api/budget`·
// `/api/listing-order`(+ import의 COALESCE) 응답을 고정한다. 스키마마다 한 번씩 돈다:
// - 0001~0006만 적용(지금 스키마)
// - 0001~0006에서 시드한 뒤 0007 이후를 적용(배포 순서 그대로). 0007 이후 파일이 생기면 자동으로 추가된다.
// 데이터는 SQL로 심는다(수락 핸들러를 거치지 않아 새 Worker + 옛 스키마에서도 GET만으로 비교할 수 있다).
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  BASELINE_MIGRATIONS,
  callApi,
  createUser,
  insertHousehold,
  insertListing,
  listingInput,
  migrate,
  PENDING_MIGRATIONS,
} from "./harness";

const T0 = "2026-10-01T00:00:00.000Z";

const SOLO_S1 = listingInput({
  name: "혼자 첫째",
  customLtvRate: 50,
  isAreaOver85: true,
  memo: "메모",
  status: "candidate",
  extraCosts: [{ category: "interior", label: "도배", amount: 300 }],
});
const SOLO_S2 = listingInput({ name: "혼자 둘째", region: "nonCapital", borrower: "firstHome" });
const A1 = listingInput({ name: "A 매물", status: "hold" });
const B_HIDDEN = listingInput({ name: "B 숨긴 매물" });
const B_NEW = listingInput({ name: "B 함께 쓰는 중에 넣음" });

/** 세션 쿠키는 행마다 랜덤이라 시드 때 받아 둔다 */
type Cookies = Record<"solo" | "a" | "b" | "empty", string>;

async function seed(db: D1Database): Promise<Cookies> {
  await insertHousehold(db, "h1", { budget: 70000, listingOrder: ["a1", "b-new"] });
  const solo = await createUser(db, "solo", { budget: 80000, listingOrder: ["s2", "s1"] });
  const a = await createUser(db, "a", { budget: 1, householdId: "h1" });
  const b = await createUser(db, "b", { budget: 50000, listingOrder: ["b1"], householdId: "h1" });
  const empty = await createUser(db, "empty");
  await db.prepare("UPDATE households SET inviter_id = 'a' WHERE id = 'h1'").run();
  await insertListing(db, "solo", "s1", SOLO_S1);
  await insertListing(db, "solo", "s2", SOLO_S2, { createdAt: "2026-10-03T00:00:00.000Z" });
  await insertListing(db, "a", "a1", A1);
  await insertListing(db, "b", "b1", B_HIDDEN, { hiddenHouseholdId: "h1" });
  await insertListing(db, "b", "b-new", B_NEW, { createdAt: "2026-10-04T00:00:00.000Z" });
  return { solo: solo.cookie, a: a.cookie, b: b.cookie, empty: empty.cookie };
}

/** AC-0(a)의 덤프 쿼리(세션 제외) */
async function dump(db: D1Database) {
  const all = (sql: string) =>
    db
      .prepare(sql)
      .all()
      .then(({ results }) => results);
  return {
    counts: await all(
      `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM sessions) AS sessions,
              (SELECT COUNT(*) FROM listings) AS listings, (SELECT COUNT(*) FROM shares) AS shares,
              (SELECT COUNT(*) FROM households) AS households,
              (SELECT COUNT(*) FROM household_invites) AS household_invites`,
    ),
    users: await all(
      "SELECT id, kakao_id, budget, listing_order, household_id, created_at FROM users ORDER BY id",
    ),
    listings: await all(
      "SELECT user_id, id, data, hidden_household_id, created_at, updated_at FROM listings ORDER BY user_id, id",
    ),
    shares: await all("SELECT token, kind, expires_at FROM shares ORDER BY token"),
    households: await all(
      "SELECT id, inviter_id, budget, listing_order FROM households ORDER BY id",
    ),
  };
}

const asListing = (id: string, input: object, createdAt = T0) => ({
  id,
  ...input,
  createdAt,
  updatedAt: createdAt,
});

const HOUSEHOLD_VIEW = {
  me: (id: string) => ({ user: { id, household: { memberCount: 2 } } }),
  listings: {
    listings: [asListing("a1", A1), asListing("b-new", B_NEW, "2026-10-04T00:00:00.000Z")],
  },
  budget: { budget: 70000 },
  order: { ids: ["a1", "b-new"] },
};

/** 계정별 기대 응답. 배포 전 동작을 손으로 적은 값이다(실행 결과를 복사하지 않음). */
const EXPECTED: Record<
  keyof Cookies,
  { me: object; listings: object; budget: object; order: object }
> = {
  solo: {
    me: { user: { id: "solo", household: null } },
    listings: {
      listings: [asListing("s1", SOLO_S1), asListing("s2", SOLO_S2, "2026-10-03T00:00:00.000Z")],
    },
    budget: { budget: 80000 },
    order: { ids: ["s2", "s1"] },
  },
  a: { ...HOUSEHOLD_VIEW, me: HOUSEHOLD_VIEW.me("a") },
  b: { ...HOUSEHOLD_VIEW, me: HOUSEHOLD_VIEW.me("b") },
  empty: {
    me: { user: { id: "empty", household: null } },
    listings: { listings: [] },
    budget: { budget: null },
    order: { ids: null },
  },
};

type Schema = {
  label: string;
  db: D1Database;
  /** 새 마이그레이션을 시드 뒤에 적용하는 경우 */
  isUpgrade: boolean;
};

const SCHEMAS: Schema[] = [
  { label: "0001~0006", db: env.DB_BASELINE, isUpgrade: false },
  ...(PENDING_MIGRATIONS.length > 0
    ? [
        {
          label: `0001~0006 시드 → ${PENDING_MIGRATIONS.map(({ name }) => name).join(", ")} 적용`,
          db: env.DB,
          isUpgrade: true,
        },
      ]
    : []),
];

for (const { label, db, isUpgrade } of SCHEMAS) {
  describe(`골든 응답: ${label}`, () => {
    let cookies: Cookies;
    let dumpBefore: Awaited<ReturnType<typeof dump>>;
    let dumpAfter: Awaited<ReturnType<typeof dump>>;

    beforeAll(async () => {
      await migrate(db, BASELINE_MIGRATIONS);
      cookies = await seed(db);
      dumpBefore = await dump(db);
      if (isUpgrade) await migrate(db, ALL_MIGRATIONS);
      dumpAfter = await dump(db);
    });

    it("마이그레이션 적용 전후 기존 테이블 덤프가 같다", () => {
      expect(dumpAfter).toStrictEqual(dumpBefore);
    });

    for (const account of Object.keys(EXPECTED) as (keyof Cookies)[]) {
      it(`${account}: /api/me·listings·budget·listing-order`, async () => {
        const expected = EXPECTED[account];
        const cookie = cookies[account];
        for (const [path, body] of [
          ["/api/me", expected.me],
          ["/api/listings", expected.listings],
          ["/api/budget", expected.budget],
          ["/api/listing-order", expected.order],
        ] as const) {
          const response = await callApi(db, "GET", path, { cookie });
          expect(response.status, path).toBe(200);
          expect(response.headers.get("Cache-Control"), path).toBe("no-store");
          expect(response.headers.get("Content-Type"), path).toBe(
            "application/json; charset=utf-8",
          );
          expect(await response.json(), path).toStrictEqual(body);
        }
      });
    }

    it("비로그인 /api/me는 { user: null }", async () => {
      const response = await callApi(db, "GET", "/api/me");
      expect(await response.json()).toStrictEqual({ user: null });
    });

    it("값이 있는 계정·가구의 import는 COALESCE로 기존 값을 돌려주고 바꾸지 않는다", async () => {
      for (const account of ["solo", "b"] as const) {
        const budget = await callApi(db, "POST", "/api/budget/import", {
          cookie: cookies[account],
          body: { budget: 1234 },
        });
        expect(await budget.json()).toStrictEqual(EXPECTED[account].budget);
        const order = await callApi(db, "POST", "/api/listing-order/import", {
          cookie: cookies[account],
          body: { ids: ["zz"] },
        });
        expect(await order.json()).toStrictEqual(EXPECTED[account].order);
      }
      expect(await dump(db)).toStrictEqual(dumpBefore);
    });

    if (isUpgrade) {
      it("0006 시점에 만든 가구에서 B가 나가면 매물·예산·순서가 배포 전 규칙대로 돌아온다", async () => {
        expect(
          (await callApi(db, "POST", "/api/household/leave", { cookie: cookies.b })).status,
        ).toBe(204);
        const listings = await callApi(db, "GET", "/api/listings", { cookie: cookies.b });
        expect(await listings.json()).toStrictEqual({
          listings: [
            asListing("b-new", B_NEW, "2026-10-04T00:00:00.000Z"),
            asListing("b1", B_HIDDEN),
          ],
        });
        const budgetA = await callApi(db, "GET", "/api/budget", { cookie: cookies.a });
        expect(await budgetA.json()).toStrictEqual({ budget: 70000 });
        const budgetB = await callApi(db, "GET", "/api/budget", { cookie: cookies.b });
        expect(await budgetB.json()).toStrictEqual({ budget: 50000 });
        const orderB = await callApi(db, "GET", "/api/listing-order", { cookie: cookies.b });
        expect(await orderB.json()).toStrictEqual({ ids: ["b1"] });
      });
    }
  });
}
