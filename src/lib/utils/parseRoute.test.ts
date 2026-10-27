import { describe, expect, it } from "vitest";

import { PATHS } from "@/lib/constants/paths";

import { parseRoute, toRoutePath } from "./parseRoute";

import type { Route } from "@/lib/types/route";

describe("parseRoute 라우트 규칙표 (AC-8c)", () => {
  const cases: [string, Route][] = [
    ["", { name: "hub" }],
    ["#", { name: "hub" }],
    ["#/", { name: "hub" }],
    ["#/listings", { name: "listings" }],
    // 옛 정렬·보기 주소는 쿼리를 버린다
    ["#/listings?sort=recent", { name: "listings" }],
    ["#/listings?sort=ownFunds&order=asc&view=card", { name: "listings" }],
    ["#/listings?sort=custom&view=compact", { name: "listings" }],
    ["#/listings?other=1", { name: "listings" }],
    // 알 수 없는 해시
    ["#/listing/abc", { name: "hub" }],
    ["#/x", { name: "hub" }],
    ["#listings", { name: "hub" }],
    ["#/calculator", { name: "calculator" }],
  ];

  it.each(cases)("%j → %j", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});

describe("toRoutePath 정규 경로", () => {
  it("라우트별 정규 경로는 PATHS와 같다", () => {
    expect(toRoutePath({ name: "calculator" })).toBe("#/calculator");
    expect(toRoutePath({ name: "listings" })).toBe("#/listings");
    expect(PATHS.calculator).toBe("#/calculator");
    expect(PATHS.listings()).toBe("#/listings");
  });

  // useHashRoute는 현재 해시와 이 값이 다르면 replace한다.
  it.each([
    ["#/listing/abc", "#/"],
    ["#/x", "#/"],
    ["", "#/"],
    ["#/listings?sort=recent&order=desc&view=card", "#/listings"],
  ])("알 수 없는 해시 %j의 정규 경로는 %j다", (hash, canonical) => {
    expect(toRoutePath(parseRoute(hash))).toBe(canonical);
  });

  it.each(["#/", "#/listings"])(
    "정규 경로 %j는 다시 파싱해도 같은 경로다(replace 루프 없음)",
    (hash) => {
      expect(toRoutePath(parseRoute(hash))).toBe(hash);
    },
  );
});
