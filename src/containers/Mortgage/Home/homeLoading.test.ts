// 스펙 loading-skeleton AC-7: 예산 화면은 계획(+연결 매물)이 다 온 뒤 한 번에 드러낸다.
import { describe, expect, it } from "vitest";

import { isHomeLoading } from "./homeLoading";

import type { InteriorPlanListState } from "@/lib/types/interiorPlanStore";
import type { ListingListState } from "@/lib/types/listing";

const PLANS_OK: InteriorPlanListState = { status: "ok", plans: [] };
const LISTINGS_OK: ListingListState = { status: "ok", listings: [] };
const LOADING = { status: "loading" } as const;
const LINKED = { listingId: "listing-1" };
const UNLINKED = {};

describe("isHomeLoading", () => {
  it.each<
    [string, InteriorPlanListState, { listingId?: string } | null, ListingListState, boolean]
  >([
    ["계획 로딩", LOADING, null, LISTINGS_OK, true],
    ["연결된 계획, 매물 로딩", PLANS_OK, LINKED, LOADING, true],
    ["연결된 계획, 매물 끝남", PLANS_OK, LINKED, LISTINGS_OK, false],
    ["연결된 계획, 매물 실패(로딩 아님)", PLANS_OK, LINKED, { status: "loadFailed" }, false],
    ["연결 없는 계획은 매물을 기다리지 않음", PLANS_OK, UNLINKED, LOADING, false],
    ["열 계획 없음(고르기·빈 상태)은 매물을 기다리지 않음", PLANS_OK, null, LOADING, false],
  ])("%s", (_row, plans, currentPlan, listings, expected) => {
    expect(isHomeLoading(plans, currentPlan, listings)).toBe(expected);
  });
});
