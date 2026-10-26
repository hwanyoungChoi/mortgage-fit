// `LISTING_SCOPE_SQL`(ADR-028) 고정(스펙 interior-planner 태스크 0-4).
// 혼자 쓰면 기존 `user_id = ?1`과 결과가 같고, 가구면 구성원 매물 중 숨기지 않은 행만이다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LISTING_SCOPE_SQL } from "./householdScope";
import { clearTables, createUser, insertHousehold, insertListing, migrate } from "../test/harness";

const db = env.DB;

const scopedIds = async (userId: string, where = LISTING_SCOPE_SQL) =>
  (
    await db
      .prepare(`SELECT user_id || '/' || id AS key FROM listings WHERE ${where} ORDER BY key`)
      .bind(userId)
      .all<{ key: string }>()
  ).results.map(({ key }) => key);

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  await insertHousehold(db, "h1");
  await insertHousehold(db, "h-old");
  await createUser(db, "solo");
  await createUser(db, "other");
  await createUser(db, "a", { householdId: "h1" });
  await createUser(db, "b", { householdId: "h1" });
  await insertListing(db, "solo", "s1");
  await insertListing(db, "solo", "s2");
  await insertListing(db, "other", "s1");
  await insertListing(db, "a", "same");
  await insertListing(db, "a", "a1");
  await insertListing(db, "b", "same", undefined, { hiddenHouseholdId: "h1" });
  await insertListing(db, "b", "b-hidden", undefined, { hiddenHouseholdId: "h1" });
  await insertListing(db, "b", "b-new");
});

describe("LISTING_SCOPE_SQL", () => {
  it("혼자 쓰는 사용자는 `user_id = ?1`과 같은 결과", async () => {
    expect(await scopedIds("solo")).toEqual(["solo/s1", "solo/s2"]);
    expect(await scopedIds("solo")).toEqual(await scopedIds("solo", "user_id = ?1"));
  });

  it("가구 구성원은 둘 다 구성원 매물 중 숨기지 않은 행만 본다(같은 id라도 숨긴 B 행은 빠짐)", async () => {
    const expected = ["a/a1", "a/same", "b/b-new"];
    expect(await scopedIds("a")).toEqual(expected);
    expect(await scopedIds("b")).toEqual(expected);
  });

  it("혼자 쓰는 사용자의 행에 다른 가구 id로 숨김이 남아 있으면 그 행도 빠진다", async () => {
    await insertListing(db, "solo", "s3", undefined, { hiddenHouseholdId: "h-old" });
    expect(await scopedIds("solo")).toEqual(["solo/s1", "solo/s2"]);
  });

  it("없는 사용자는 빈 범위", async () => {
    expect(await scopedIds("ghost")).toEqual([]);
  });
});
