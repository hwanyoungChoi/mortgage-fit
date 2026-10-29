import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { formatWon } from "@/lib/utils/amount";
import { vendorOf } from "@/lib/utils/interiorPlanRows";
import { interiorScheduleTextOf } from "@/lib/utils/interiorScheduleText";

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
 * 항목에 일정이 있으면 첫 줄 오른쪽에 "11/3~11/7"처럼 붙인다. `scheduleId`를 주면 그 글자의 id라 여는 버튼이 설명으로 읽는다.
 */
function LineSummary({ row, scheduleId }: { row: InteriorPlanRow; scheduleId?: string }) {
  const { quote } = row;
  const detail = quote?.memo ?? "";
  const schedule = interiorScheduleTextOf(row.item);
  const titleClassName =
    quote !== null && detail === "" && vendorOf(quote) === null
      ? styles.tbdText
      : styles.primaryText;
  const title = quote === null ? "견적 없음" : detail !== "" ? detail : lineVendorTextOf(quote);
  return (
    <>
      <span className={styles.rowText}>
        <span className={styles.titleLine}>
          <span className={quote === null ? styles.noQuote : titleClassName}>{title}</span>
          {schedule !== null && (
            <span id={scheduleId} className={styles.schedule}>
              <span className={styles.screenReaderOnly}>일정</span> {schedule}
            </span>
          )}
        </span>
        {quote !== null && detail !== "" && (
          <span className={styles.secondaryText}>{lineVendorTextOf(quote)}</span>
        )}
      </span>
      {quote !== null && <LineAmount won={row.quoteWon} />}
    </>
  );
}

export default LineSummary;
