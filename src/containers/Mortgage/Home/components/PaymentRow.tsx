import AmountInput from "@/components/AmountInput";

import styles from "./ItemSheet.module.css";
import formStyles from "./SheetForm.module.css";

import type { InteriorPaymentDraft } from "@/lib/types/interiorItemDraft";

export type PaymentFieldName = "label" | "amount" | "dueDate";

type PaymentRowProps = {
  payment: InteriorPaymentDraft;
  /** 화면에 보이는 번호(1부터). 보조기기 이름에 쓴다 */
  number: number;
  inputIdOf: (name: PaymentFieldName) => string;
  errorOf: (name: PaymentFieldName) => string | null;
  onChange: (patch: Partial<InteriorPaymentDraft>) => void;
  onBlur: (name: PaymentFieldName) => void;
  onDelete: () => void;
};

/** 지급 한 줄: 이름(계약금·중도금·잔금·직접) · 금액 / 날짜 · [지급함] · [삭제]. 오류는 그 칸 아래에 보인다. */
function PaymentRow({
  payment,
  number,
  inputIdOf,
  errorOf,
  onChange,
  onBlur,
  onDelete,
}: PaymentRowProps) {
  const name = `지급 ${number}`;
  const labelInputId = inputIdOf("label");
  const dateInputId = inputIdOf("dueDate");
  const labelError = errorOf("label");
  const dateError = errorOf("dueDate");

  return (
    <li className={styles.line}>
      <div className={formStyles.twoColumns}>
        <div className={formStyles.field}>
          <input
            id={labelInputId}
            className={formStyles.input}
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="이름"
            aria-label={`${name} 이름`}
            value={payment.label}
            aria-invalid={labelError !== null}
            aria-describedby={labelError === null ? undefined : `${labelInputId}-error`}
            onChange={(event) => onChange({ label: event.target.value })}
            onBlur={() => onBlur("label")}
          />
          {labelError !== null && (
            <p id={`${labelInputId}-error`} className={formStyles.error}>
              {labelError}
            </p>
          )}
        </div>
        <AmountInput
          id={inputIdOf("amount")}
          label={`${name} 금액`}
          value={payment.amount}
          error={errorOf("amount")}
          isCompact
          onChange={(amount) => onChange({ amount })}
          onBlur={() => onBlur("amount")}
        />
      </div>
      <div className={styles.lineTop}>
        <div className={styles.lineGrow}>
          <input
            id={dateInputId}
            className={formStyles.input}
            type="date"
            aria-label={`${name} 날짜`}
            value={payment.dueDate}
            aria-invalid={dateError !== null}
            aria-describedby={dateError === null ? undefined : `${dateInputId}-error`}
            onChange={(event) => onChange({ dueDate: event.target.value })}
            onBlur={() => onBlur("dueDate")}
          />
        </div>
        <label className={styles.paidLabel}>
          <input
            type="checkbox"
            checked={payment.isPaid}
            aria-label={`${name} 지급함`}
            onChange={(event) => onChange({ isPaid: event.target.checked })}
          />
          <span aria-hidden="true">지급함</span>
        </label>
        <button
          type="button"
          className={formStyles.rowDeleteButton}
          aria-label={`${name} 삭제`}
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
      {dateError !== null && (
        <p id={`${dateInputId}-error`} className={formStyles.error}>
          {dateError}
        </p>
      )}
    </li>
  );
}

export default PaymentRow;
