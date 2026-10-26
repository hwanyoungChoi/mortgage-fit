import AmountInput from "@/components/AmountInput";
import { telHref } from "@/lib/utils/telHref";

import styles from "./ItemSheet.module.css";
import formStyles from "./SheetForm.module.css";

import type { InteriorQuoteDraft } from "@/lib/types/interiorItemDraft";

export type QuoteFieldName = "vendor" | "contact" | "amount" | "memo";

type QuoteRowProps = {
  quote: InteriorQuoteDraft;
  /** 화면에 보이는 번호(1부터). 보조기기 이름에 쓴다 */
  number: number;
  isConfirmed: boolean;
  inputIdOf: (name: QuoteFieldName) => string;
  /** 칸을 벗어났거나 저장을 누른 뒤에만 보이는 오류 */
  errorOf: (name: QuoteFieldName) => string | null;
  onChange: (patch: Partial<InteriorQuoteDraft>) => void;
  onBlur: (name: QuoteFieldName) => void;
  onConfirm: () => void;
  onDelete: () => void;
};

/** 글자 칸 하나(업체·연락처·메모). 오류는 그 칸 바로 아래에 보인다 */
function QuoteTextInput({
  id,
  label,
  placeholder,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={formStyles.field}>
      <input
        id={id}
        className={formStyles.input}
        type="text"
        autoComplete="off"
        enterKeyHint="next"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {error !== null && (
        <p id={errorId} className={formStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/** 견적 한 줄: [확정] 업체 [삭제] / 금액 / 연락처 · 메모. 연락처가 전화번호 모양이면 [전화] 링크를 둔다(A7). */
function QuoteRow({
  quote,
  number,
  isConfirmed,
  inputIdOf,
  errorOf,
  onChange,
  onBlur,
  onConfirm,
  onDelete,
}: QuoteRowProps) {
  const name = `견적 ${number}`;
  const phoneHref = telHref(quote.contact);

  return (
    <li className={isConfirmed ? styles.confirmedLine : styles.line}>
      <div className={styles.lineTop}>
        <label className={styles.confirmLabel}>
          <input
            type="radio"
            name="interior-confirmed-quote"
            checked={isConfirmed}
            aria-label={`${name} 확정`}
            onChange={onConfirm}
          />
          <span aria-hidden="true">확정</span>
        </label>
        <div className={styles.lineGrow}>
          <QuoteTextInput
            id={inputIdOf("vendor")}
            label={`${name} 업체`}
            placeholder="업체 이름"
            value={quote.vendor}
            error={errorOf("vendor")}
            onChange={(vendor) => onChange({ vendor })}
            onBlur={() => onBlur("vendor")}
          />
        </div>
        <button
          type="button"
          className={formStyles.rowDeleteButton}
          aria-label={`${name} 삭제`}
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
      <AmountInput
        id={inputIdOf("amount")}
        label={`${name} 금액`}
        value={quote.amount}
        error={errorOf("amount")}
        isCompact
        onChange={(amount) => onChange({ amount })}
        onBlur={() => onBlur("amount")}
      />
      <div className={formStyles.twoColumns}>
        <div className={styles.contactField}>
          <QuoteTextInput
            id={inputIdOf("contact")}
            label={`${name} 연락처`}
            placeholder="연락처(선택)"
            value={quote.contact}
            error={errorOf("contact")}
            onChange={(contact) => onChange({ contact })}
            onBlur={() => onBlur("contact")}
          />
          {phoneHref !== null && (
            <a className={styles.phoneLink} href={phoneHref} aria-label={`${name} 전화`}>
              전화
            </a>
          )}
        </div>
        <QuoteTextInput
          id={inputIdOf("memo")}
          label={`${name} 메모`}
          placeholder="메모(선택)"
          value={quote.memo}
          error={errorOf("memo")}
          onChange={(memo) => onChange({ memo })}
          onBlur={() => onBlur("memo")}
        />
      </div>
    </li>
  );
}

export default QuoteRow;
