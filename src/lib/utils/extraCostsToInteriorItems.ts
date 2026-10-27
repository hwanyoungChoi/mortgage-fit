import type { ExtraCost } from "@/lib/types/extraCost";
import type { InteriorItemInput } from "@/lib/types/interiorPlan";

/** 플랜으로 가져오는 추가 비용 줄: 인테리어 분류만(가전·가구·이사·기타는 가져오지 않는다, 스펙 U7). 입력 순서 그대로 */
export function interiorExtraCostsOf(extraCosts: ExtraCost[] = []): ExtraCost[] {
  return extraCosts.filter((extraCost) => extraCost.category === "interior");
}

/**
 * 매물 추가 비용 → 플랜 만들기의 항목(AC-6, 1회 복사). 인테리어 분류 줄만, 입력 순서대로
 * 줄 이름 → 공종(자르지 않는다. 공종 상한이 줄 이름 상한과 같은 30자), 줄 금액 → 항목 예산, 상태 계획, 공간은 `spaceId`("전체").
 */
export function extraCostsToInteriorItems(
  extraCosts: ExtraCost[] | undefined,
  spaceId: string,
): InteriorItemInput[] {
  return interiorExtraCostsOf(extraCosts).map((extraCost) => ({
    spaceId,
    trade: extraCost.label,
    budget: extraCost.amount,
    status: "planned",
  }));
}
