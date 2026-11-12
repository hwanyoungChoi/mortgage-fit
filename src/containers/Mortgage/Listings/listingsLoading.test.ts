// 스펙 loading-skeleton AC-7: 저장 목록은 목록·예산·순서가 다 온 뒤 한 번에 드러낸다.
import { describe, expect, it } from "vitest";

import { makeListing } from "@/test/listingFixture";

import { isListingsLoading } from "./listingsLoading";

import type { BudgetState } from "@/lib/types/budget";
import type { ListingListState } from "@/lib/types/listing";
import type { ListingOrderState } from "@/lib/types/listingOrder";

const ONE: ListingListState = { status: "ok", listings: [makeListing({ id: "a" })] };
const EMPTY: ListingListState = { status: "ok", listings: [] };
const BUDGET_OK: BudgetState = { status: "ok", budget: null };
const ORDER_OK: ListingOrderState = { status: "ok", ids: [] };
const LOADING = { status: "loading" } as const;

describe("isListingsLoading", () => {
  it.each<[string, ListingListState, BudgetState, ListingOrderState, boolean]>([
    ["목록 로딩", LOADING, BUDGET_OK, ORDER_OK, true],
    ["매물 있음, 예산 로딩", ONE, LOADING, ORDER_OK, true],
    ["매물 있음, 순서 로딩", ONE, BUDGET_OK, LOADING, true],
    ["셋 다 끝남", ONE, BUDGET_OK, ORDER_OK, false],
    ["매물 있음, 예산 실패(로딩 아님)", ONE, { status: "loadFailed" }, ORDER_OK, false],
    ["매물 0개면 예산·순서를 기다리지 않음", EMPTY, LOADING, LOADING, false],
    ["목록 실패면 예산·순서를 기다리지 않음", { status: "loadFailed" }, LOADING, LOADING, false],
  ])("%s", (_row, list, budget, order, expected) => {
    expect(isListingsLoading(list, budget, order)).toBe(expected);
  });
});
