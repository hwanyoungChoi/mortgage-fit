import { useId } from "react";

import MaskedValue from "@/components/MaskedValue";
import { formatManwon } from "@/lib/utils/amount";
import { rowNoteOf } from "@/lib/utils/interiorPlanRows";

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

/**
 * 줄 하나: [여는 버튼(세부내용 / 업체·비고 · 견적)]과 [확정 체크]를 형제로 둔다(버튼 안에 체크박스를 넣지 않는다).
 * 첫 줄은 세부내용이고 업체가 그 아래다. 세부내용이 없거나 가려졌으면 업체가 첫 줄이고, 가려진 세부내용은 그 아래 `•••`다
 * (첫 줄이 `•••`만 남아 어떤 줄인지 알 수 없게 되지 않도록).
 * 체크는 저장된 값 그대로이고, 저장 중에는 원래 상태로 비활성이다. 견적 없는 줄의 체크는 숨기지 않고 비활성으로 이유를 붙인다.
 * 가리기 중에는 견적·세부내용·비고를 그리지 않고 시트도 열지 않는다(A10).
 */
function LineRow({ trade, row, isMasked, isSaving, onOpen, onConfirmChange }: LineRowProps) {
  const noQuoteId = useId();
  const { quote } = row;
  const name = nameOf(trade, row, isMasked);
  const detail = quote?.memo ?? "";
  const isDetailFirst = detail !== "" && !isMasked;
  const note = rowNoteOf(row, formatManwon);

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
          {note !== "" && (
            <span className={styles.note}>
              <MaskedValue isMasked={isMasked}>{note}</MaskedValue>
            </span>
          )}
        </span>
        {quote !== null && (
          <span className={styles.amount}>
            <MaskedValue isMasked={isMasked}>{formatManwon(quote.amount)}</MaskedValue>
          </span>
        )}
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
