import { useId } from "react";

import MaskedValue from "@/components/MaskedValue";
import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { formatWon } from "@/lib/utils/amount";

import styles from "./PlanLines.module.css";

import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

type LineRowProps = {
  /** 묶음 제목(구분). 접근 가능한 이름의 앞머리다 */
  trade: string;
  row: InteriorPlanRow;
  isMasked: boolean;
  /** 같은 항목의 확정을 저장하는 중(이 줄·형제 줄 모두 잠근다) */
  isSaving: boolean;
  onOpen: (button: HTMLButtonElement) => void;
  onConfirmChange: (isConfirmed: boolean) => void;
};

/** 접근 가능한 이름의 앞머리: "{구분} {업체} {세부내용}". 가리기 중에는 세부내용을 넣지 않는다(DOM에 값을 두지 않는다) */
function nameOf(trade: string, row: InteriorPlanRow, isMasked: boolean): string {
  const detail = isMasked ? "" : (row.quote?.memo ?? "");
  return [trade, row.quote?.vendor ?? "", detail].filter((part) => part !== "").join(" ");
}

/** 금액 자리(원). 금액 키가 없으면 흐린 "미정"이다(ADR-033). 둘 다 금액처럼 가리고, 가리는 중에는 색도 금액과 같다 */
function LineAmount({ won, isMasked }: { won: number | undefined; isMasked: boolean }) {
  if (won === undefined) {
    return (
      <span className={isMasked ? styles.amount : styles.tbdAmount}>
        <MaskedValue isMasked={isMasked}>{INTERIOR_PLAN_TBD_LABEL}</MaskedValue>
      </span>
    );
  }
  return (
    <span className={styles.amount}>
      <MaskedValue isMasked={isMasked}>{formatWon(won)}</MaskedValue>
    </span>
  );
}

/**
 * 줄 하나: [여는 버튼(세부내용 / 업체 · 견적)]과 [확정 체크]를 형제로 둔다(버튼 안에 체크박스를 넣지 않는다).
 * 비고(항목 메모)와 견적 없는 줄의 "예산 n원"은 목록에 그리지 않는다(줄 시트·표·CSV·인쇄에는 있다, 스펙 interior-tbd-amount 추가 요청).
 * 첫 줄은 세부내용이고 업체가 그 아래다. 세부내용이 없거나 가려졌으면 업체가 첫 줄이고, 가려진 세부내용은 그 아래 `•••`다
 * (첫 줄이 `•••`만 남아 어떤 줄인지 알 수 없게 되지 않도록).
 * 체크는 저장된 값 그대로이고, 저장 중에는 원래 상태로 비활성이다. 견적 없는 줄의 체크는 숨기지 않고 비활성으로 이유를 붙인다.
 * 가리기 중에는 견적·세부내용을 그리지 않고 시트도 열지 않는다(A10).
 */
function LineRow({ trade, row, isMasked, isSaving, onOpen, onConfirmChange }: LineRowProps) {
  const noQuoteId = useId();
  const { quote } = row;
  const name = nameOf(trade, row, isMasked);
  const detail = quote?.memo ?? "";
  const isDetailFirst = detail !== "" && !isMasked;

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.openButton}
        aria-haspopup="dialog"
        aria-label={`${name} 열기`}
        disabled={isMasked}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className={styles.rowText}>
          {quote === null && <span className={styles.noQuote}>견적 없음</span>}
          {quote !== null && isDetailFirst && (
            <>
              <span className={styles.primaryText}>{detail}</span>
              <span className={styles.secondaryText}>{quote.vendor}</span>
            </>
          )}
          {quote !== null && !isDetailFirst && (
            <>
              <span className={styles.primaryText}>{quote.vendor}</span>
              {detail !== "" && (
                <span className={styles.secondaryText}>
                  <MaskedValue isMasked={isMasked}>{detail}</MaskedValue>
                </span>
              )}
            </>
          )}
        </span>
        {quote !== null && <LineAmount won={row.quoteWon} isMasked={isMasked} />}
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
            견적이 없어 확정할 수 없습니다. 줄을 열어 업체와 견적을 적으세요
          </span>
        )}
      </label>
    </li>
  );
}

export default LineRow;
