// 스펙 interior-planner AC-6·A8: "연결된 매물이 삭제되었습니다"는 매물 목록이 확정 로드된(ok) 뒤에만 판단한다.
import { describe, expect, it } from "vitest";

import { makeListing } from "@/test/listingFixture";

import { linkedListingOf } from "./linkedListing";

import type { ListingListState } from "@/lib/types/listing";

const RAEMIAN = makeListing({ id: "listing-raemian", name: "래미안 84" });
const XI = makeListing({ id: "listing-xi", name: "자이 59" });

const NOT_OK: ListingListState[] = [
  { status: "loading" },
  { status: "accountError" },
  { status: "loadFailed" },
  { status: "corrupt", rawText: "{" },
  { status: "unavailable" },
];
const ALL: ListingListState[] = [
  ...NOT_OK,
  { status: "ok", listings: [] },
  { status: "ok", listings: [RAEMIAN, XI] },
];

describe("linkedListingOf", () => {
  it.each(ALL.map((state) => [state.status, state] as const))(
    "연결 없는 계획(listingId 없음) · 매물 목록 %s → none",
    (_, listings) => {
      expect(linkedListingOf(undefined, listings)).toEqual({ status: "none" });
    },
  );

  it.each(NOT_OK.map((state) => [state.status, state] as const))(
    "매물 목록이 확정 로드 전·실패(%s) → unknown(끊김을 판단하지 않는다)",
    (_, listings) => {
      expect(linkedListingOf("listing-raemian", listings)).toEqual({ status: "unknown" });
    },
  );

  it("매물 목록 ok · 그 매물 있음 → linked(그 매물)", () => {
    expect(linkedListingOf("listing-raemian", { status: "ok", listings: [XI, RAEMIAN] })).toEqual({
      status: "linked",
      listing: RAEMIAN,
    });
  });

  it("매물 목록 ok · 그 매물 없음(삭제·숨김) → missing", () => {
    expect(linkedListingOf("listing-raemian", { status: "ok", listings: [XI] })).toEqual({
      status: "missing",
    });
  });

  it("매물 목록 ok · 빈 목록(마지막 매물을 지움) → missing", () => {
    expect(linkedListingOf("listing-raemian", { status: "ok", listings: [] })).toEqual({
      status: "missing",
    });
  });
});
