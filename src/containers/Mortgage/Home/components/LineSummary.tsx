import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { formatWon } from "@/lib/utils/amount";
import { vendorOf } from "@/lib/utils/interiorPlanRows";

import styles from "./PlanLines.module.css";
import { lineVendorTextOf } from "../lineName";

import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

/** 금액 자리(원). 금액 키가 없으면 흐린 "미정"이다(ADR-033) */
function LineAmount({ won }: { won: number | undefined }) {
  if (won === undefined) return <span className={styles.tbdAmount}>{INTERIOR_PLAN_TBD_LABEL}</span>;
  return <span className={styles.amount}>{formatWon(won)}</span>;
}

/**
 * 줄 글자(버튼·체크 없는 표시): 왼쪽 글자 묶음(세부내용 / 업체) + 금액. 여는 버튼 안과 끄는 동안 뜬 줄(DragOverlay)이 같이 쓴다.
 * 첫 줄은 세부내용이고 업체가 그 아래다. 세부내용이 없으면 업체가 첫 줄이다. 업체 미정이면 업체 자리에 "업체 미정"이고,
 * 첫 줄이면 흐린 글자(`tbdText`)다. 둘째 줄은 원래 흐린 글자라 글자로만 구별된다(U1).
 */
function LineSummary({ row }: { row: InteriorPlanRow }) {
  const { quote } = row;
  const detail = quote?.memo ?? "";
  return (
    <>
      <span className={styles.rowText}>
        {quote === null && <span className={styles.noQuote}>견적 없음</span>}
        {quote !== null && detail !== "" && (
          <>
            <span className={styles.primaryText}>{detail}</span>
            <span className={styles.secondaryText}>{lineVendorTextOf(quote)}</span>
          </>
        )}
        {quote !== null && detail === "" && (
          <span className={vendorOf(quote) === null ? styles.tbdText : styles.primaryText}>
            {lineVendorTextOf(quote)}
          </span>
        )}
      </span>
      {quote !== null && <LineAmount won={row.quoteWon} />}
    </>
  );
}

export default LineSummary;
