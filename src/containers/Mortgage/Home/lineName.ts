import { INTERIOR_VENDOR_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { vendorOf } from "@/lib/utils/interiorPlanRows";

import type { InteriorQuote } from "@/lib/types/interiorPlan";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

/** 견적 줄의 업체 글자. 업체 미정이면 "업체 미정"이다(ADR-036) */
export function lineVendorTextOf(quote: InteriorQuote): string {
  return vendorOf(quote) ?? INTERIOR_VENDOR_TBD_LABEL;
}

/**
 * 줄의 이름 "{구분} {업체} {세부내용}"(업체 미정이면 "{구분} 업체 미정 {세부내용}"). 여는 버튼·확정 체크의 접근 가능한 이름
 * 앞머리이고 끌기 알림의 줄 이름이다.
 */
export function lineNameOf(trade: string, { quote }: InteriorPlanRow): string {
  return [trade, quote === null ? "" : lineVendorTextOf(quote), quote?.memo ?? ""]
    .filter((part) => part !== "")
    .join(" ");
}
