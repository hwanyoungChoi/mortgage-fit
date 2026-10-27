import { validateAmount } from "@/lib/utils/amount";
import { summarizeInteriorPlan } from "@/lib/utils/interiorPlanRows";

import type { Draft } from "@/lib/types/draft";
import type { InteriorPlanListState } from "@/lib/types/interiorPlanStore";
import type { ListingListState } from "@/lib/types/listing";

/**
 * 홈 카드 하나의 요약 줄. intro: 소개 문구, loading: 불러오는 중, error: 불러오지 못함, corrupt: 로컬 원문이 깨짐,
 * summary: 내 현황. 카드마다 따로 정한다(한 카드의 실패가 다른 카드에 번지지 않는다).
 */
export type HubCardSummary<T> =
  | { kind: "intro" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "corrupt" }
  | { kind: "summary"; value: T };

export type HubListingsValue = { count: number; isHousehold: boolean };

/** 계획 하나의 줄. `plannedTotal`은 지출 예정(만원, 확정한 줄의 견적 합) */
export type HubPlanLine = { id: string; name: string; plannedTotal: number };

export type HubSummary = {
  /** 작성 중 매매가(만원) */
  calculator: HubCardSummary<number>;
  listings: HubCardSummary<HubListingsValue>;
  /** 계획마다 한 줄. 목록 순서 그대로(다시 정렬하지 않는다) */
  home: HubCardSummary<HubPlanLine[]>;
};

type HubSummaryInput = {
  draft: Pick<Draft, "salePrice">;
  listings: ListingListState;
  /** 함께 쓰는 목록에 있다(로그인 상태에서만 참) */
  isListingsHousehold: boolean;
  plans: InteriorPlanListState;
};

type ListStatus = Exclude<ListingListState["status"] | InteriorPlanListState["status"], "ok">;

const INTRO = { kind: "intro" } as const;

/**
 * 목록이 정해지지 않았거나 읽지 못한 상태 → 요약 줄. 로딩 중에는 로컬 값을 먼저 그리지 않는다.
 * 저장소를 쓸 수 없으면 소개 문구다. 받아 둔 서버 목록이 있으면(재조회 실패) 출처가 ok를 주므로 여기 오지 않는다.
 */
const NOT_OK_SUMMARY: Record<ListStatus, HubCardSummary<never>> = {
  loading: { kind: "loading" },
  accountError: { kind: "error" },
  loadFailed: { kind: "error" },
  corrupt: { kind: "corrupt" },
  unavailable: INTRO,
};

function summarizeCalculator(draft: Pick<Draft, "salePrice">): HubCardSummary<number> {
  const salePrice = validateAmount(draft.salePrice);
  return salePrice.status === "valid" ? { kind: "summary", value: salePrice.value } : INTRO;
}

function summarizeListings(
  listings: ListingListState,
  isHousehold: boolean,
): HubCardSummary<HubListingsValue> {
  if (listings.status !== "ok") return NOT_OK_SUMMARY[listings.status];
  const count = listings.listings.length;
  // 함께 쓰는 중이면 0개도 "함께 쓰는 목록 · 매물 0개"로 보인다.
  if (count === 0 && !isHousehold) return INTRO;
  return { kind: "summary", value: { count, isHousehold } };
}

function summarizePlans(plans: InteriorPlanListState): HubCardSummary<HubPlanLine[]> {
  if (plans.status !== "ok") return NOT_OK_SUMMARY[plans.status];
  if (plans.plans.length === 0) return INTRO;
  return {
    kind: "summary",
    value: plans.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      // 우리 집 요약과 같은 정의(U7). 홈이 따로 계산하지 않는다.
      plannedTotal: summarizeInteriorPlan(plan).plannedTotal,
    })),
  };
}

/** 홈 카드 3개의 요약 줄. 규제값으로 계산한 수치(한도·자기자금)는 넣지 않는다. */
export function summarizeHub({
  draft,
  listings,
  isListingsHousehold,
  plans,
}: HubSummaryInput): HubSummary {
  return {
    calculator: summarizeCalculator(draft),
    listings: summarizeListings(listings, isListingsHousehold),
    home: summarizePlans(plans),
  };
}
