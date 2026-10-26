// 라우터 경로 순서·공통 오류 고정(스펙 interior-planner 태스크 0-4). 2-1이 `/api/interior-plans/import`를
// `/:id`보다 뒤에 두면 POST import가 405가 되는 함정을 `/api/listings/import`로 먼저 고정한다.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  callApi,
  clearTables,
  countRows,
  createUser,
  listingInput,
  migrate,
} from "../test/harness";

import type { TestUser } from "../test/harness";

const db = env.DB;
let user: TestUser;

const importBody = {
  listings: [
    {
      id: "n1",
      ...listingInput(),
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
};

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
  user = await createUser(db, "u1");
});

describe("경로 순서", () => {
  it("POST /api/listings/import는 `/:id`에 가려지지 않고 import 핸들러에 닿는다", async () => {
    const response = await callApi(db, "POST", "/api/listings/import", {
      cookie: user.cookie,
      body: importBody,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ imported: 1, skipped: 0 });
  });

  it("같은 import 경로에 PUT·DELETE를 보내면 `/:id` 핸들러가 아니라 405 + Allow: POST", async () => {
    for (const method of ["PUT", "DELETE", "GET"]) {
      const response = await callApi(db, method, "/api/listings/import", {
        cookie: user.cookie,
        body: method === "GET" ? undefined : { listing: listingInput() },
      });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(await response.json()).toMatchObject({ error: "methodNotAllowed" });
    }
    expect(await countRows(db, "listings")).toBe(0);
  });

  it("/api/listings에 PATCH는 405 + Allow: GET, POST", async () => {
    const response = await callApi(db, "PATCH", "/api/listings", { cookie: user.cookie, body: {} });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, POST");
  });
});

describe("공통 오류", () => {
  it("쿠키 없이 인증 경로 → 401 unauthorized, no-store", async () => {
    const response = await callApi(db, "GET", "/api/listings");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("모양은 맞지만 없는 세션 → 401", async () => {
    const forged = `mf_session=${"a".repeat(22)}.${"b".repeat(43)}`;
    expect((await callApi(db, "GET", "/api/listings", { cookie: forged })).status).toBe(401);
  });

  it("다른 출처의 쓰기 → 403 forbidden이고 처리하지 않는다(Origin 없음도 같다)", async () => {
    for (const origin of ["https://evil.example", null]) {
      const response = await callApi(db, "POST", "/api/listings", {
        cookie: user.cookie,
        origin,
        body: { listing: listingInput() },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "forbidden" });
    }
    expect(await countRows(db, "listings")).toBe(0);
  });

  it("다른 출처라도 GET은 막지 않는다", async () => {
    const response = await callApi(db, "GET", "/api/listings", {
      cookie: user.cookie,
      origin: "https://evil.example",
    });
    expect(response.status).toBe(200);
  });

  it("표에 없는 /api 경로 → JSON 404 notFound", async () => {
    const response = await callApi(db, "GET", "/api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "notFound" });
  });
});
