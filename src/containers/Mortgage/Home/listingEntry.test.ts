// 스펙 interior-planner AC-6 · "화면 — 저장 목록 매물 카드": `#/home?listing={id}`에서 할 일의 상태표.
// 연결 계획 찾기는 계획 목록만 본다(매물 목록을 기다리지 않음, 여럿이면 첫 번째). 연결 계획이 없을 때만 매물 목록을 본다.
import { describe, expect, it } from "vitest";

import { INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { makePlanP } from "@/test/interiorPlanFixture";
import { makeListing } from "@/test/listingFixture";

import { LISTING_ENTRY_NOTICES, resolveListingEntry } from "./listingEntry";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { ListingListState } from "@/lib/types/listing";

const RAEMIAN = makeListing({ id: "listing-raemian", name: "래미안 84" });
const XI = makeListing({ id: "listing-xi", name: "자이 59" });

const plan = (id: string, listingId?: string): InteriorPlanWithItems =>
  makePlanP({ id, name: id, items: [], ...(listingId !== undefined && { listingId }) });

const LOADING: ListingListState = { status: "loading" };
const OK_BOTH: ListingListState = { status: "ok", listings: [RAEMIAN, XI] };
const OK_XI_ONLY: ListingListState = { status: "ok", listings: [XI] };
const OK_EMPTY: ListingListState = { status: "ok", listings: [] };
/** 확정 로드가 아닌 상태 전부(로딩 제외) */
const NOT_OK: ListingListState[] = [
  { status: "accountError" },
  { status: "loadFailed" },
  { status: "corrupt", rawText: "{" },
  { status: "unavailable" },
];
const ALL_LISTING_STATES: ListingListState[] = [LOADING, OK_BOTH, OK_XI_ONLY, OK_EMPTY, ...NOT_OK];

describe("resolveListingEntry", () => {
  describe("연결 계획이 있으면 매물 목록 상태와 상관없이 그 계획으로", () => {
    it.each(ALL_LISTING_STATES.map((state) => [state.status, state] as const))(
      "연결 계획 1개 · 매물 목록 %s → openPlan",
      (_, listings) => {
        expect(
          resolveListingEntry("listing-raemian", [plan("plan-a", "listing-raemian")], listings),
        ).toEqual({ action: "openPlan", planId: "plan-a" });
      },
    );

    it("연결 계획이 여럿이면 목록의 첫 번째(앞에 다른 매물 계획·연결 없는 계획이 있어도)", () => {
      const plans = [
        plan("plan-other", "listing-xi"),
        plan("plan-unlinked"),
        plan("plan-first", "listing-raemian"),
        plan("plan-second", "listing-raemian"),
      ];
      expect(resolveListingEntry("listing-raemian", plans, LOADING)).toEqual({
        action: "openPlan",
        planId: "plan-first",
      });
      expect(resolveListingEntry("listing-raemian", plans, OK_BOTH)).toEqual({
        action: "openPlan",
        planId: "plan-first",
      });
      // 순서가 바뀌면 첫 번째도 바뀐다(배열 순서 = 화면의 계획 순서)
      expect(resolveListingEntry("listing-raemian", [plans[3], plans[2]], OK_BOTH)).toEqual({
        action: "openPlan",
        planId: "plan-second",
      });
    });

    it("계획이 3개(상한)여도 연결 계획이 있으면 연다(만들기 상한과 무관)", () => {
      const plans = [plan("plan-1"), plan("plan-2"), plan("plan-3", "listing-raemian")];
      expect(plans).toHaveLength(INTERIOR_PLAN_MAX_COUNT);
      expect(resolveListingEntry("listing-raemian", plans, OK_BOTH)).toEqual({
        action: "openPlan",
        planId: "plan-3",
      });
    });

    it("매물이 지워졌어도(목록 ok에 없음) 연결 계획이 있으면 연다 — 그 계획 화면이 연결 끊김을 보인다", () => {
      expect(
        resolveListingEntry("listing-raemian", [plan("plan-a", "listing-raemian")], OK_XI_ONLY),
      ).toEqual({ action: "openPlan", planId: "plan-a" });
    });
  });

  describe("연결 계획이 없으면", () => {
    const unrelated = [plan("plan-other", "listing-xi"), plan("plan-unlinked")];

    it("매물 목록이 로딩이면 기다린다", () => {
      expect(resolveListingEntry("listing-raemian", [], LOADING)).toEqual({ action: "wait" });
      expect(resolveListingEntry("listing-raemian", unrelated, LOADING)).toEqual({
        action: "wait",
      });
    });

    it.each(NOT_OK.map((state) => [state.status, state] as const))(
      "매물 목록 %s → 안내(listingsUnavailable), 만들기 시트 없음",
      (_, listings) => {
        expect(resolveListingEntry("listing-raemian", [], listings)).toEqual({
          action: "notice",
          reason: "listingsUnavailable",
        });
      },
    );

    it("매물 목록 ok · 매물 있음 · 계획 0개 → 그 매물로 만들기", () => {
      expect(resolveListingEntry("listing-raemian", [], OK_BOTH)).toEqual({
        action: "create",
        listing: RAEMIAN,
      });
    });

    it("매물 목록 ok · 매물 있음 · 다른 매물 계획·연결 없는 계획 2개 → 만들기(상한 바로 안)", () => {
      expect(unrelated).toHaveLength(INTERIOR_PLAN_MAX_COUNT - 1);
      expect(resolveListingEntry("listing-raemian", unrelated, OK_BOTH)).toEqual({
        action: "create",
        listing: RAEMIAN,
      });
    });

    it("매물 목록 ok · 매물 있음 · 계획 3개(상한) → 안내(planLimit)", () => {
      const plans = [...unrelated, plan("plan-third")];
      expect(plans).toHaveLength(INTERIOR_PLAN_MAX_COUNT);
      expect(resolveListingEntry("listing-raemian", plans, OK_BOTH)).toEqual({
        action: "notice",
        reason: "planLimit",
      });
    });

    it("매물 목록 ok · 매물 없음(삭제·함께 쓰기에서 숨김) → 안내(listingMissing), 빈 만들기 시트를 열지 않는다", () => {
      for (const listings of [OK_XI_ONLY, OK_EMPTY]) {
        expect(resolveListingEntry("listing-raemian", [], listings)).toEqual({
          action: "notice",
          reason: "listingMissing",
        });
      }
    });

    it("매물 없음 + 계획 3개: 만들기가 아니라 안내", () => {
      const plans = [plan("plan-1"), plan("plan-2"), plan("plan-3")];
      expect(resolveListingEntry("listing-raemian", plans, OK_XI_ONLY).action).toBe("notice");
    });
  });

  it("안내 문구 3개는 서로 다르고 비어 있지 않으며, 상한 안내에 3개가 들어간다", () => {
    const messages = Object.values(LISTING_ENTRY_NOTICES);
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) expect(message.trim()).not.toBe("");
    expect(LISTING_ENTRY_NOTICES.planLimit).toContain(`${INTERIOR_PLAN_MAX_COUNT}개`);
  });
});
