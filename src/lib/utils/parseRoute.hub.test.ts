// 스펙 platform-home AC-1: 홈(허브)이 첫 화면 `#/`, 계산은 정확히 `#/calculator`일 때만. 알 수 없는 해시는 홈.
// 스펙 hub-account AC-2: 로그인 결과 `?login=`은 홈이 받는다(저장 목록은 받지 않는다).
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
    // 홈은 로그인 결과(`login`)만 허용 값일 때 읽고 그 밖의 쿼리는 버린다(스펙 hub-account AC-2)
    ["#/?a=1", { name: "hub" }, "#/"],
    ["#/?login=failed", { name: "hub", login: "failed" }, "#/?login=failed"],
    ["#/?login=cancelled", { name: "hub", login: "cancelled" }, "#/?login=cancelled"],
    ["#/?login=notConfigured", { name: "hub", login: "notConfigured" }, "#/?login=notConfigured"],
    ["#/?login=", { name: "hub" }, "#/"],
    ["#/?login=FAILED", { name: "hub" }, "#/"],
    ["#/?login=x", { name: "hub" }, "#/"],
    // 허용 값 검사는 정확 일치다(`in`·객체 인덱싱이면 통과해 버리는 이름)
    ["#/?login=constructor", { name: "hub" }, "#/"],
    ["#/?login=toString", { name: "hub" }, "#/"],
    ["#/?login=__proto__", { name: "hub" }, "#/"],
    ["#/?login=failed&a=1", { name: "hub", login: "failed" }, "#/?login=failed"],
    // 중복이면 첫 값(URLSearchParams.get)
    ["#/?login=failed&login=cancelled", { name: "hub", login: "failed" }, "#/?login=failed"],
    // 홈 경로(`/`)가 아니면 login을 읽지 않는다
    ["#/x?login=failed", { name: "hub" }, "#/"],
    ["#/calculator?login=failed", { name: "calculator" }, "#/calculator"],
    ["#/home?login=failed", { name: "home" }, "#/home"],
    // 계산: 정확히 `/calculator`, 쿼리는 버린다
    ["#/calculator", { name: "calculator" }, "#/calculator"],
    ["#/calculator?a=1", { name: "calculator" }, "#/calculator"],
    // 저장 목록: 쿼리는 모두 버린다. 로그인 결과는 홈이 받는다(옛 `#/listings?login=`은 안내 없이 #/listings)
    ["#/listings", { name: "listings" }, "#/listings"],
    ["#/listings?login=failed", { name: "listings" }, "#/listings"],
    ["#/listings?login=cancelled", { name: "listings" }, "#/listings"],
    ["#/listings?login=notConfigured", { name: "listings" }, "#/listings"],
    ["#/listings?login=failed&x=1", { name: "listings" }, "#/listings"],
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

  it.each([
    "#/",
    "#/?login=failed",
    "#/calculator",
    "#/listings",
    "#/home",
    "#/home/plan-p?view=table",
  ])("정규 경로 %s는 다시 파싱해도 같다(replace 루프 없음)", (hash) => {
    expect(toRoutePath(parseRoute(hash))).toBe(hash);
  });

  it("PATHS.hub는 #/, PATHS.calculator는 #/calculator이고 hub·calculator의 정규 경로와 같다", () => {
    expect(PATHS.hub).toBe("#/");
    expect(PATHS.calculator).toBe("#/calculator");
    expect(toRoutePath({ name: "hub" })).toBe(PATHS.hub);
    expect(toRoutePath({ name: "calculator" })).toBe(PATHS.calculator);
  });

  it("로그인 결과가 있는 홈은 #/?login={값}, 없으면 #/(hub-account AC-2 왕복)", () => {
    expect(toRoutePath({ name: "hub", login: "cancelled" })).toBe("#/?login=cancelled");
    expect(toRoutePath({ name: "hub" })).toBe("#/");
  });
});
