import { describe, expect, it } from "vitest";

import { PATHS } from "@/lib/constants/paths";

import { parseRoute, toRoutePath } from "./parseRoute";

import type { Route } from "@/lib/types/route";

type HomeRoute = Extract<Route, { name: "home" }>;

const LONG_ID = "a".repeat(64);
const TOO_LONG_ID = "a".repeat(65);

describe("parseRoute 우리 집 (스펙 interior-planner 화면 · AC-1·AC-3)", () => {
  const cases: [string, Route][] = [
    ["#/home", { name: "home" }],
    ["#/home/", { name: "home" }],
    ["#/home/plan-1", { name: "home", planId: "plan-1" }],
    ["#/home/Ab_9-z", { name: "home", planId: "Ab_9-z" }],
    [`#/home/${LONG_ID}`, { name: "home", planId: LONG_ID }],
    // 형식 밖 planId는 버린다(#/home)
    [`#/home/${TOO_LONG_ID}`, { name: "home" }],
    ["#/home/import", { name: "home" }],
    ["#/home/a.b", { name: "home" }],
    ["#/home/a/b", { name: "home" }],
    ["#/home/%20", { name: "home" }],
    // 보기: trade·table만 남긴다(태스크 5, ADR-030)
    ["#/home?view=trade", { name: "home", view: "trade" }],
    ["#/home/plan-1?view=trade", { name: "home", planId: "plan-1", view: "trade" }],
    ["#/home?view=table", { name: "home", view: "table" }],
    ["#/home/plan-1?view=table", { name: "home", planId: "plan-1", view: "table" }],
    [
      "#/home/plan-1?listing=listing-1&view=table",
      { name: "home", planId: "plan-1", listingId: "listing-1", view: "table" },
    ],
    ["#/home?view=space", { name: "home" }],
    ["#/home?view=TRADE", { name: "home" }],
    ["#/home?view=TABLE", { name: "home" }],
    ["#/home?view=table%20", { name: "home" }],
    ["#/home?view=tables", { name: "home" }],
    ["#/home?view=list", { name: "home" }],
    ["#/home?view=", { name: "home" }],
    ["#/home?view=card", { name: "home" }],
    // 매물에서 온 길
    ["#/home?listing=listing-1", { name: "home", listingId: "listing-1" }],
    ["#/home?listing=bad%20id", { name: "home" }],
    ["#/home?listing=", { name: "home" }],
    [`#/home?listing=${TOO_LONG_ID}`, { name: "home" }],
    [
      "#/home/plan-1?view=trade&listing=listing-1",
      { name: "home", planId: "plan-1", listingId: "listing-1", view: "trade" },
    ],
    ["#/home?other=1", { name: "home" }],
    // home으로 시작하지만 다른 경로
    ["#/homes", { name: "hub" }],
    ["#/home-x", { name: "hub" }],
    ["#home", { name: "hub" }],
    // 첫 화면은 홈(ADR-031 D1)
    ["#/", { name: "hub" }],
    ["", { name: "hub" }],
  ];

  it.each(cases)("%j → %j", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});

describe("PATHS.home·toRoutePath 우리 집", () => {
  it.each<[HomeRoute, string]>([
    [{ name: "home" }, "#/home"],
    [{ name: "home", planId: "plan-1" }, "#/home/plan-1"],
    [{ name: "home", view: "trade" }, "#/home?view=trade"],
    [{ name: "home", view: "space" }, "#/home"],
    [{ name: "home", view: "table" }, "#/home?view=table"],
    [{ name: "home", planId: "plan-1", view: "table" }, "#/home/plan-1?view=table"],
    [
      { name: "home", planId: "plan-1", listingId: "listing-1", view: "table" },
      "#/home/plan-1?listing=listing-1&view=table",
    ],
    [{ name: "home", planId: "plan-1", view: "trade" }, "#/home/plan-1?view=trade"],
    [{ name: "home", listingId: "listing-1" }, "#/home?listing=listing-1"],
    [
      { name: "home", planId: "plan-1", listingId: "listing-1", view: "trade" },
      "#/home/plan-1?listing=listing-1&view=trade",
    ],
  ])("%j → %j", (route, path) => {
    const { name: _name, ...params } = route;
    void _name;
    expect(PATHS.home(params)).toBe(path);
    expect(toRoutePath(route)).toBe(path);
  });

  it("인자 없이 부르면 #/home(탭 링크)", () => {
    expect(PATHS.home()).toBe("#/home");
  });

  it.each([
    "#/home",
    "#/home/plan-1",
    "#/home?view=trade",
    "#/home/plan-1?view=trade",
    "#/home?listing=listing-1",
    "#/home/plan-1?listing=listing-1&view=trade",
    "#/home?view=table",
    "#/home/plan-1?view=table",
    "#/home?listing=listing-1&view=table",
  ])("정규 경로 %j는 다시 파싱해도 같은 경로다(replace 루프 없음, 새로고침 유지)", (hash) => {
    expect(toRoutePath(parseRoute(hash))).toBe(hash);
  });

  it.each([
    ["#/home?view=space", "#/home"],
    ["#/home/?view=card", "#/home"],
    ["#/home/import?view=trade", "#/home?view=trade"],
    ["#/home/plan-1?view=trade&listing=listing-1", "#/home/plan-1?listing=listing-1&view=trade"],
    ["#/home?listing=bad%20id&view=trade", "#/home?view=trade"],
    ["#/home/plan-1?view=TABLE", "#/home/plan-1"],
    ["#/home/plan-1?view=table&view=trade", "#/home/plan-1?view=table"],
    ["#/home/import?view=table", "#/home?view=table"],
  ])("%j는 %j로 맞춘다", (hash, canonical) => {
    expect(toRoutePath(parseRoute(hash))).toBe(canonical);
    expect(toRoutePath(parseRoute(canonical))).toBe(canonical);
  });
});
