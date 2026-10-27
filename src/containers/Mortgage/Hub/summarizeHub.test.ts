// 스펙 platform-home AC-6·AC-7: 홈 요약 순수 함수 summarizeHub. 카드별 판별 유니온(intro|loading|error|corrupt|summary).
// AC-7 상태표 11행을 출처 훅이 돌려주는 목록 상태(입력) → 카드 3개 출력(판별 유니온)으로 고정한다.
// 화면 쪽 연결(어느 상태에서 어떤 목록 상태가 오는지)은 MortgageHub.summary.test.tsx가 본다.
import { describe, expect, it } from "vitest";

import { DEFAULT_DRAFT } from "@/lib/constants/draft";
import { summarizeInteriorPlan } from "@/lib/utils/interiorPlanRows";
import {
  confirmSashD,
  makePlanP,
  paySashBalance,
  pSash,
  pTime,
  withItem,
} from "@/test/interiorPlanFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";
import { makeListing } from "@/test/listingFixture";

import { summarizeHub, type HubSummary } from "./summarizeHub";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanListState } from "@/lib/types/interiorPlanStore";
import type { ListingListState } from "@/lib/types/listing";

const listingsOk = (count: number): ListingListState => ({
  status: "ok",
  listings: Array.from({ length: count }, (_, index) =>
    makeListing({ id: `listing-${index + 1}`, name: `매물 ${index + 1}` }),
  ),
});

const plansOk = (plans: InteriorPlanWithItems[]): InteriorPlanListState => ({
  status: "ok",
  plans,
});

type Input = Parameters<typeof summarizeHub>[0];

function summarize(overrides: Partial<Input> = {}): HubSummary {
  return summarizeHub({
    draft: { salePrice: "125000" },
    listings: listingsOk(3),
    isListingsHousehold: false,
    plans: plansOk([makePlanP()]),
    ...overrides,
  });
}

const INTRO = { kind: "intro" } as const;
const LOADING = { kind: "loading" } as const;
const ERROR = { kind: "error" } as const;
const CORRUPT = { kind: "corrupt" } as const;
const DRAFT_125000 = { kind: "summary", value: 125000 } as const;
const P_LINE = { id: "plan-p", name: "우리 집", plannedTotal: 1530 };

describe("AC-7 카드별 상태표 (입력 목록 상태 → 카드 3개, 한 카드의 상태가 다른 카드에 번지지 않음)", () => {
  it.each<[string, Partial<Input>, HubSummary]>([
    [
      "1 로그아웃, 모두 정상",
      {},
      {
        calculator: DRAFT_125000,
        listings: { kind: "summary", value: { count: 3, isHousehold: false } },
        home: { kind: "summary", value: [P_LINE] },
      },
    ],
    [
      "2 로그아웃, listings 원문 깨짐(corrupt)",
      { listings: { status: "corrupt", rawText: "{" } },
      { calculator: DRAFT_125000, listings: CORRUPT, home: { kind: "summary", value: [P_LINE] } },
    ],
    [
      "3 로그아웃, interior-plans 원문 깨짐(corrupt)",
      { plans: { status: "corrupt", rawText: "{" } },
      {
        calculator: DRAFT_125000,
        listings: { kind: "summary", value: { count: 3, isHousehold: false } },
        home: CORRUPT,
      },
    ],
    [
      "4 로그인, /api/me 응답 전(둘 다 loading) — 대출 계산은 로컬 draft 그대로",
      { listings: { status: "loading" }, plans: { status: "loading" } },
      { calculator: DRAFT_125000, listings: LOADING, home: LOADING },
    ],
    [
      "5 로그인, 매물 이전 중(loading), 계획 이전 끝(서버 계획)",
      { listings: { status: "loading" } },
      { calculator: DRAFT_125000, listings: LOADING, home: { kind: "summary", value: [P_LINE] } },
    ],
    [
      "6 로그인, /api/listings 500(받아 둔 목록 없음 → loadFailed)",
      { listings: { status: "loadFailed" } },
      { calculator: DRAFT_125000, listings: ERROR, home: { kind: "summary", value: [P_LINE] } },
    ],
    [
      "7 로그인, /api/interior-plans 500(loadFailed)",
      { listings: listingsOk(2), plans: { status: "loadFailed" } },
      {
        calculator: DRAFT_125000,
        listings: { kind: "summary", value: { count: 2, isHousehold: false } },
        home: ERROR,
      },
    ],
    [
      "8 /api/me 실패 + session-hint 있음(accountError)",
      { listings: { status: "accountError" }, plans: { status: "accountError" } },
      { calculator: DRAFT_125000, listings: ERROR, home: ERROR },
    ],
    [
      "9 /api/me 실패 + session-hint 없음(출처가 로컬 스냅샷을 준다)",
      { listings: listingsOk(5) },
      {
        calculator: DRAFT_125000,
        listings: { kind: "summary", value: { count: 5, isHousehold: false } },
        home: { kind: "summary", value: [P_LINE] },
      },
    ],
    [
      "10 가구, 서버 매물 4개",
      {
        listings: listingsOk(4),
        isListingsHousehold: true,
        plans: plansOk([makePlanP({ id: "plan-pa", name: "A 계획" })]),
      },
      {
        calculator: DRAFT_125000,
        listings: { kind: "summary", value: { count: 4, isHousehold: true } },
        home: { kind: "summary", value: [{ id: "plan-pa", name: "A 계획", plannedTotal: 1530 }] },
      },
    ],
    [
      "11 저장소 접근 불가(unavailable, draft는 DEFAULT_DRAFT)",
      {
        draft: DEFAULT_DRAFT,
        listings: { status: "unavailable" },
        plans: { status: "unavailable" },
      },
      { calculator: INTRO, listings: INTRO, home: INTRO },
    ],
  ])("%s", (_row, overrides, expected) => {
    expect(summarize(overrides)).toEqual(expected);
  });

  it("상태 하나만 바꿔도 나머지 두 카드는 그대로다(카드 독립)", () => {
    const base = summarize();
    const notOkListings: ListingListState[] = [
      { status: "loading" },
      { status: "accountError" },
      { status: "loadFailed" },
      { status: "corrupt", rawText: "{" },
      { status: "unavailable" },
    ];
    for (const listings of notOkListings) {
      const result = summarize({ listings });
      expect(result.calculator, listings.status).toEqual(base.calculator);
      expect(result.home, listings.status).toEqual(base.home);
    }
    for (const plans of notOkListings as InteriorPlanListState[]) {
      const result = summarize({ plans });
      expect(result.calculator, plans.status).toEqual(base.calculator);
      expect(result.listings, plans.status).toEqual(base.listings);
    }
    const intro = summarize({ draft: { salePrice: "" } });
    expect(intro.listings).toEqual(base.listings);
    expect(intro.home).toEqual(base.home);
  });
});

describe("AC-6 매물 개수 경계", () => {
  it.each<[string, ListingListState, boolean, HubSummary["listings"]]>([
    ["0개 → 소개", listingsOk(0), false, INTRO],
    ["1개 → 1", listingsOk(1), false, { kind: "summary", value: { count: 1, isHousehold: false } }],
    [
      "함께 쓰는 중 0개 → 함께 쓰는 목록 · 매물 0개",
      listingsOk(0),
      true,
      {
        kind: "summary",
        value: { count: 0, isHousehold: true },
      },
    ],
    [
      "함께 쓰는 중 1개",
      listingsOk(1),
      true,
      {
        kind: "summary",
        value: { count: 1, isHousehold: true },
      },
    ],
  ])("%s", (_name, listings, isListingsHousehold, expected) => {
    expect(summarize({ listings, isListingsHousehold }).listings).toEqual(expected);
  });
});

describe("AC-6 우리 집 카드: 계획별 지출 예정 (interior-simple U7)", () => {
  it("계획 0개 → 소개", () => {
    expect(summarize({ plans: plansOk([]) }).home).toEqual(INTRO);
  });

  it("계획 3개는 목록 순서 그대로(이름순·createdAt순으로 다시 정렬하지 않는다)", () => {
    const plans = [
      makePlanP({ id: "plan-c", name: "다 계획", createdAt: pTime(5) }),
      makePlanP({ id: "plan-a", name: "가 계획", createdAt: pTime(1) }),
      makePlanP({ id: "plan-b", name: "나 계획", createdAt: pTime(9) }),
    ];
    const home = summarize({ plans: plansOk(plans) }).home;
    expect(home.kind === "summary" && home.value.map((line) => line.id)).toEqual([
      "plan-c",
      "plan-a",
      "plan-b",
    ]);
  });

  // 지출 예정 = summarizeInteriorPlan(plan).plannedTotal 그대로(확정한 줄의 견적 합). 지급·예산은 세지 않는다.
  it.each<[string, InteriorPlanWithItems, number]>([
    ["예시 P(새 화면): R1 180 + R3 370 + R5 250 = 800", makeSimplePlanP(), 800],
    ["옛 P: 도배 A 280 + 샷시 E 1,250 = 1,530(옛 앞으로 낼 돈 1,250이 아님)", makePlanP(), 1530],
    [
      "옛 P + 샷시 잔금 지급(paySashBalance): 지급은 세지 않아 1,530 그대로",
      withItem(makePlanP(), "item-sash", paySashBalance),
      1530,
    ],
    [
      "옛 P + 샷시 확정 E→D(confirmSashD): 280 + 1,150 = 1,430",
      withItem(makePlanP(), "item-sash", confirmSashD),
      1430,
    ],
    [
      "옛 P + D 확정 + 잔금 지급: 1,430",
      withItem(makePlanP(), "item-sash", (item) => paySashBalance(confirmSashD(item))),
      1430,
    ],
    ["항목 없음: 0", makePlanP({ items: [] }), 0],
    [
      "확정 12,500·지급 줄 없음: 12,500",
      makePlanP({
        items: [
          {
            ...pSash(),
            quotes: [{ id: "q-e", vendor: "E샷시", amount: 12500 }],
            payments: [],
          },
        ],
      }),
      12500,
    ],
  ])("%s", (_name, plan, plannedTotal) => {
    expect(summarizeInteriorPlan(plan).plannedTotal).toBe(plannedTotal);
    expect(summarize({ plans: plansOk([plan]) }).home).toEqual({
      kind: "summary",
      value: [{ id: plan.id, name: plan.name, plannedTotal }],
    });
  });
});

describe("AC-6 금액 경계표 (대출 계산 카드, validateAmount(salePrice).status === valid)", () => {
  it.each<[string, HubSummary["calculator"]]>([
    ["125000", { kind: "summary", value: 125000 }],
    ["1", { kind: "summary", value: 1 }],
    ["10000", { kind: "summary", value: 10000 }],
    ["125,000", { kind: "summary", value: 125000 }],
    [" 125000 ", { kind: "summary", value: 125000 }],
    ["999999999", { kind: "summary", value: 999999999 }],
    ["0", INTRO],
    ["00", INTRO],
    ["12.5", INTRO],
    ["12a", INTRO],
    ["-1", INTRO],
    ["", INTRO],
    ["   ", INTRO],
    ["1000000000", INTRO],
  ])("salePrice %j → %j", (salePrice, expected) => {
    expect(summarize({ draft: { salePrice } }).calculator).toEqual(expected);
  });
});
