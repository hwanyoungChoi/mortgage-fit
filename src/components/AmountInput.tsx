import { useLayoutEffect, useRef, type ChangeEvent } from "react";

import { MAX_WON } from "@/lib/constants/interiorPlan";
import {
  formatManwon,
  formatWonKorean,
  isBelowManwonWonInput,
  parseAmount,
  validateAmount,
} from "@/lib/utils/amount";

import styles from "./AmountInput.module.css";
import { caretAfterNonCommaChars, countNonCommaChars, toAmountInputText } from "./amountInputText";

/** 칸의 단위. 계산기·매물은 만원(ADR-002), 우리 집 견적·총 예산은 원(ADR-034) */
type AmountUnit = "manwon" | "won";

type UnitRule = {
  /** 칸 안 오른쪽에 붙는 단위 글자 */
  unitText: string;
  /** 칸 아래 힌트 줄. 읽을 수 있는 값이면 한국어 단위 표기, 아니면 입력 안내 */
  hintOf: (value: string) => string;
  /** 힌트 아래 덧붙이는 안내(없으면 null). 저장을 막지 않는다 */
  noticeOf: (value: string) => string | null;
};

const UNIT_RULES: Record<AmountUnit, UnitRule> = {
  manwon: {
    unitText: "만원",
    hintOf: (value) => {
      const validation = validateAmount(value);
      return validation.status === "valid" ? formatManwon(validation.value) : "만원 단위로 입력";
    },
    noticeOf: () => null,
  },
  won: {
    unitText: "원",
    hintOf: (value) => {
      const parsed = parseAmount(value);
      return parsed.kind === "value" && parsed.value <= MAX_WON
        ? formatWonKorean(parsed.value)
        : "원 단위로 입력";
    },
    noticeOf: (value) => (isBelowManwonWonInput(value) ? "원 단위입니다" : null),
  },
};

type AmountInputProps = {
  id: string;
  label: string;
  /** 쉼표를 뺀 입력 문자열 */
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  /**
   * 목록의 줄처럼 칸이 여러 개 반복되는 자리. 라벨은 보조기기에만 남기고 힌트 줄을 빼 높이를 줄인다.
   * 쉼표와 "만원" 단위는 칸 안에 그대로 보인다.
   */
  isCompact?: boolean;
  /** 기본 만원. 원이면 힌트가 억·만 형식이고 1만원 미만은 "원 단위입니다"를 붙인다 */
  unit?: AmountUnit;
};

function AmountInput({
  id,
  label,
  value,
  error,
  onChange,
  onBlur,
  isCompact = false,
  unit = "manwon",
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretChars = useRef<number | null>(null);

  // 쉼표가 새로 그려지면 브라우저가 커서를 끝으로 보낸다. 입력하던 글자 뒤로 되돌린다.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const count = pendingCaretChars.current;
    if (input === null || count === null) return;
    pendingCaretChars.current = null;
    const caret = caretAfterNonCommaChars(input.value, count);
    input.setSelectionRange(caret, caret);
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value: text, selectionStart } = event.target;
    pendingCaretChars.current = countNonCommaChars(text.slice(0, selectionStart ?? text.length));
    onChange(text.replaceAll(",", ""));
  };

  const rule = UNIT_RULES[unit];
  const notice = rule.noticeOf(value);
  const hintId = `${id}-hint`;
  const noticeId = `${id}-notice`;
  const errorId = `${id}-error`;
  const describedIds = [
    ...(isCompact ? [] : [hintId]),
    ...(notice === null ? [] : [noticeId]),
    ...(error === null ? [] : [errorId]),
  ];

  return (
    <div className={styles.field}>
      <label className={isCompact ? styles.visuallyHidden : styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          value={toAmountInputText(value)}
          aria-invalid={error !== null}
          aria-describedby={describedIds.length === 0 ? undefined : describedIds.join(" ")}
          onChange={handleChange}
          onBlur={onBlur}
        />
        <span className={styles.unit} aria-hidden="true">
          {rule.unitText}
        </span>
      </div>
      {!isCompact && (
        <p id={hintId} className={styles.hint}>
          {rule.hintOf(value)}
        </p>
      )}
      {notice !== null && (
        <p id={noticeId} className={styles.notice}>
          {notice}
        </p>
      )}
      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export default AmountInput;
