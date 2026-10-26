// 하네스 자체 확인(태스크 0-3): 마이그레이션 순서 적용, 부분 적용 후 나머지 적용, 테이블 비우기, 심은 세션으로 인증.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  BASELINE_MIGRATIONS,
  callApi,
  clearTables,
  countRows,
  createUser,
  insertHousehold,
  insertListing,
  migrate,
} from "./harness";

const appliedNames = async (db: D1Database) =>
  (
    await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>()
  ).results.map(({ name }) => name);

describe("D1 하네스", () => {
  it("migrations/의 파일을 번호 순서대로 전부 읽는다(0001부터 빠짐 없이)", () => {
    const numbers = ALL_MIGRATIONS.map(({ name }) => Number(name.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(BASELINE_MIGRATIONS.map(({ name }) => name)).toEqual([
      "0001_shares.sql",
      "0002_accounts.sql",
      "0003_user_budget.sql",
      "0004_listing_order.sql",
      "0005_households.sql",
      "0006_hidden_listings.sql",
    ]);
  });

  it("일부만 적용 → 시드 → 전체 적용이면 남은 것만 적용되고 시드 행이 남는다", async () => {
    const db = env.DB_BASELINE;
    await migrate(db, ALL_MIGRATIONS.slice(0, 2));
    await db
      .prepare(
        "INSERT INTO users (id, kakao_id, created_at) VALUES ('u0', 'k0', '2026-10-01T00:00:00.000Z')",
      )
      .run();
    await migrate(db, ALL_MIGRATIONS);
    expect(await appliedNames(db)).toEqual(ALL_MIGRATIONS.map(({ name }) => name));
    const user = await db.prepare("SELECT budget, household_id FROM users WHERE id = 'u0'").first();
    expect(user).toEqual({ budget: null, household_id: null });
  });

  describe("최신 스키마", () => {
    beforeEach(async () => {
      await migrate(env.DB);
      await clearTables(env.DB);
    });

    it("심은 세션 쿠키로 /api/me가 그 사용자를 돌려준다", async () => {
      const user = await createUser(env.DB, "u1");
      const response = await callApi(env.DB, "GET", "/api/me", { cookie: user.cookie });
      expect(await response.json()).toStrictEqual({ user: { id: "u1", household: null } });
    });

    it("clearTables는 외래 키가 걸린 행(가구·구성원·매물)도 순서와 무관하게 모두 지운다", async () => {
      await insertHousehold(env.DB, "h1");
      await createUser(env.DB, "u1", { householdId: "h1" });
      await insertListing(env.DB, "u1", "l1");
      await clearTables(env.DB);
      for (const table of [
        "users",
        "sessions",
        "listings",
        "households",
        "household_invites",
        "shares",
      ]) {
        expect(await countRows(env.DB, table)).toBe(0);
      }
      expect(await appliedNames(env.DB)).toEqual(ALL_MIGRATIONS.map(({ name }) => name));
    });

    it("외래 키는 로컬 D1에서도 강제된다(없는 가구 id로 users를 바꾸면 실패)", async () => {
      await createUser(env.DB, "u1");
      await expect(
        env.DB.prepare("UPDATE users SET household_id = 'missing' WHERE id = 'u1'").run(),
      ).rejects.toThrow(/FOREIGN KEY/);
    });
  });
});
