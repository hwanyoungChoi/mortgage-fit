// 스펙 platform-home AC-1: 홈(허브)이 첫 화면 `#/`, 계산은 정확히 `#/calculator`일 때만. 알 수 없는 해시는 홈.
import { describe, expect, it } from "vitest";

import { PATHS } from "@/lib/constants/paths";

import { parseRoute, toRoutePath } from "./parseRoute";

import type { Route } from "@/lib/types/route";

describe("parseRoute → 정규 경로 (platform-home AC-1)", () => {
  const cases: [hash: string, route: Route, canonical: string][] = [
    // 홈: 빈 해시·루트·알 수 없는 해시. `/calculator`와 비슷하지만 정확히 같지 않은 경로도 홈
    ["", { name: "hub" }, "#/"],
    ["#", { name: "hub" }, "#/"],
    ["#/", { name: "hub" }, "#/"],
    ["#/x", { name: "hub" }, "#/"],
    ["#/listing/abc", { name: "hub" }, "#/"],
    ["#listings", { name: "hub" }, "#/"],
    ["#/calc", { name: "hub" }, "#/"],
    ["#/calculatorx", { name: "hub" }, "#/"],
    ["#/calculator/", { name: "hub" }, "#/"],
    ["#/calculator/x", { name: "hub" }, "#/"],
    ["#/Calculator", { name: "hub" }, "#/"],
    ["#calculator", { name: "hub" }, "#/"],
    // 홈은 쿼리를 정규 경로에서 버린다(옛 `#/?login=`)
    ["#/?a=1", { name: "hub" }, "#/"],
    ["#/?login=failed", { name: "hub" }, "#/"],
    // 계산: 정확히 `/calculator`, 쿼리는 버린다
    ["#/calculator", { name: "calculator" }, "#/calculator"],
    ["#/calculator?a=1", { name: "calculator" }, "#/calculator"],
    // 저장 목록: login은 허용 목록만 남기고 그 밖의 쿼리는 버린다
    ["#/listings", { name: "listings" }, "#/listings"],
    ["#/listings?login=failed", { name: "listings", login: "failed" }, "#/listings?login=failed"],
    [
      "#/listings?login=cancelled",
      { name: "listings", login: "cancelled" },
      "#/listings?login=cancelled",
    ],
    [
      "#/listings?login=notConfigured",
      { name: "listings", login: "notConfigured" },
      "#/listings?login=notConfigured",
    ],
    ["#/listings?sort=recent", { name: "listings" }, "#/listings"],
    // 우리 집: 경로·쿼리 그대로
    ["#/home", { name: "home" }, "#/home"],
    [
      "#/home/plan-p?listing=listing-r&view=table",
      { name: "home", planId: "plan-p", listingId: "listing-r", view: "table" },
      "#/home/plan-p?listing=listing-r&view=table",
    ],
    // 형식 틀린 플랜 id는 버린다. 스펙 표의 "ZZ"는 기존 id 규칙(영문·숫자·_-)에 맞아 형식 틀린 예가 아니다
    ["#/home/a.b", { name: "home" }, "#/home"],
    // 공유받기·초대: 토큰 대소문자 그대로
    ["#/share/AbC_12", { name: "share", token: "AbC_12" }, "#/share/AbC_12"],
    ["#/invite/XyZ", { name: "invite", token: "XyZ" }, "#/invite/XyZ"],
  ];

  it.each(cases)("%j → %j, 정규 경로 %s", (hash, route, canonical) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(toRoutePath(parseRoute(hash))).toBe(canonical);
  });

  it.each(["#/", "#/calculator", "#/listings", "#/home", "#/home/plan-p?view=trade"])(
    "정규 경로 %s는 다시 파싱해도 같다(replace 루프 없음)",
    (hash) => {
      expect(toRoutePath(parseRoute(hash))).toBe(hash);
    },
  );

  it("PATHS.hub는 #/, PATHS.calculator는 #/calculator이고 hub·calculator의 정규 경로와 같다", () => {
    expect(PATHS.hub).toBe("#/");
    expect(PATHS.calculator).toBe("#/calculator");
    expect(toRoutePath({ name: "hub" })).toBe(PATHS.hub);
    expect(toRoutePath({ name: "calculator" })).toBe(PATHS.calculator);
  });
});
