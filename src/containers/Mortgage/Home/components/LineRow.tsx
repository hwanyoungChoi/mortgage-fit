import { useId } from "react";

import {
  INTERIOR_PLAN_TBD_LABEL,
  INTERIOR_VENDOR_TBD_LABEL,
} from "@/lib/constants/interiorPlanTable";
import { formatWon } from "@/lib/utils/amount";
import { vendorOf } from "@/lib/utils/interiorPlanRows";

import styles from "./PlanLines.module.css";

import type { InteriorQuote } from "@/lib/types/interiorPlan";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

type LineRowProps = {
  /** 묶음 제목(구분). 접근 가능한 이름의 앞머리다 */
  trade: string;
  row: InteriorPlanRow;
  /** 같은 항목의 확정을 저장하는 중(이 줄·형제 줄 모두 잠근다) */
  isSaving: boolean;
  onOpen: (button: HTMLButtonElement) => void;
  onConfirmChange: (isConfirmed: boolean) => void;
};

/** 견적 줄의 업체 글자. 업체 미정이면 "업체 미정"이다(ADR-036) */
function vendorTextOf(quote: InteriorQuote): string {
  return vendorOf(quote) ?? INTERIOR_VENDOR_TBD_LABEL;
}

/** 접근 가능한 이름의 앞머리: "{구분} {업체} {세부내용}". 업체 미정이면 "{구분} 업체 미정 {세부내용}" */
function nameOf(trade: string, { quote }: InteriorPlanRow): string {
  return [trade, quote === null ? "" : vendorTextOf(quote), quote?.memo ?? ""]
    .filter((part) => part !== "")
    .join(" ");
}

/** 금액 자리(원). 금액 키가 없으면 흐린 "미정"이다(ADR-033) */
function LineAmount({ won }: { won: number | undefined }) {
  if (won === undefined) return <span className={styles.tbdAmount}>{INTERIOR_PLAN_TBD_LABEL}</span>;
  return <span className={styles.amount}>{formatWon(won)}</span>;
}

/**
 * 줄 하나: [여는 버튼(세부내용 / 업체 · 견적)]과 [확정 체크]를 형제로 둔다(버튼 안에 체크박스를 넣지 않는다).
 * 비고(항목 메모)와 견적 없는 줄의 "예산 n원"은 목록에 그리지 않는다(줄 시트·표·CSV·인쇄에는 있다, 스펙 interior-tbd-amount 추가 요청).
 * 첫 줄은 세부내용이고 업체가 그 아래다. 세부내용이 없으면 업체가 첫 줄이다. 업체 미정이면 업체 자리에 "업체 미정"이고,
 * 첫 줄이면 흐린 글자(`tbdText`)다. 둘째 줄은 원래 흐린 글자라 글자로만 구별된다(U1).
 * 체크는 저장된 값 그대로이고, 저장 중에는 원래 상태로 비활성이다. 견적 없는 줄의 체크는 숨기지 않고 비활성으로 이유를 붙인다.
 */
function LineRow({ trade, row, isSaving, onOpen, onConfirmChange }: LineRowProps) {
  const noQuoteId = useId();
  const { quote } = row;
  const name = nameOf(trade, row);
  const detail = quote?.memo ?? "";

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.openButton}
        aria-haspopup="dialog"
        aria-label={`${name} 열기`}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className={styles.rowText}>
          {quote === null && <span className={styles.noQuote}>견적 없음</span>}
          {quote !== null && detail !== "" && (
            <>
              <span className={styles.primaryText}>{detail}</span>
              <span className={styles.secondaryText}>{vendorTextOf(quote)}</span>
            </>
          )}
          {quote !== null && detail === "" && (
            <span className={vendorOf(quote) === null ? styles.tbdText : styles.primaryText}>
              {vendorTextOf(quote)}
            </span>
          )}
        </span>
        {quote !== null && <LineAmount won={row.quoteWon} />}
      </button>
      <label className={styles.confirm}>
        <input
          type="checkbox"
          aria-label={`${name} 확정`}
          checked={row.isConfirmed}
          disabled={quote === null || isSaving}
          aria-busy={isSaving || undefined}
          aria-describedby={quote === null ? noQuoteId : undefined}
          onChange={(event) => onConfirmChange(event.currentTarget.checked)}
        />
        <span aria-hidden="true">확정</span>
        {quote === null && (
          <span id={noQuoteId} className={styles.screenReaderOnly}>
            견적이 없어 확정할 수 없습니다. 줄을 열어 업체를 적으세요
          </span>
        )}
      </label>
    </li>
  );
}

export default LineRow;
